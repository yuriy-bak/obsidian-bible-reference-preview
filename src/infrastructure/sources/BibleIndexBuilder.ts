import { BibleBook } from "../../domain/BibleBook";
import { normalizeBookAlias, removeChapterNumberFromAlias } from "../../parsing/BookMapping";
import { BibleIndexV2Data, BibleIndexV2TranslationMetadata } from "../v2/BibleIndexV2Data";
import { CompactBibleBookData, CompactVerseData } from "../v2/CompactBibleBookData";
import { EpubImportError } from "../epub/EpubImportError";
import { detectVersification, type ChapterVerseCounts } from "../../versification/detectVersification";
import { getCompactBookChapterVerseCounts } from "../../versification/compactBookVerseCounts";
import { DEFAULT_VERSIFICATION_KEY, getVersificationRegistry } from "../../versification/VersificationRegistry";
import { assertBibleImportNotAborted, yieldBibleImportIfNeeded } from "./BibleImportCancellation";
import { BibleImportOptions, BibleImportResult, BibleImportVersificationDetection } from "./BibleSource";

const BIBLE_IMPORT_APPEND_VERSES_YIELD_EVERY_VERSES = 500;

/** Starts the import warning about an uncertain scheme; dropped once the user picks the scheme. */
export const VERSIFICATION_NOT_DETECTED_WARNING_PREFIX = "Versification was not detected reliably, using";

export type BibleImportVerse = {
    chapter: number;
    verse: number;
    text: string;
    footnotes: string[];
    paragraphStart?: boolean;
    /** Last number of verses joined into this one (Acts 1:16–17); verse 17 is not given separately. */
    verseEnd?: number;
};

export type BibleIndexBuilderInput = {
    translationId: string;
    translationName: string;
    language: string;
    sourceFileName: string;
};

/**
 * Builds the stored index (bibles-index.json metadata and compact book files) from books and
 * verses extracted by a BibleSource. Format-independent.
 */
export class BibleIndexBuilder {
    private readonly importedAt = new Date().toISOString();
    private readonly translation: BibleIndexV2TranslationMetadata;
    private readonly compactBooks: Record<string, CompactBibleBookData> = {};
    private readonly warnings: string[] = [];
    private books: BibleBook[] = [];
    private importedVerseCount = 0;

    constructor(
        private readonly input: BibleIndexBuilderInput,
        private readonly options: BibleImportOptions = {},
    ) {
        this.translation = {
            name: input.translationName,
            language: input.language,
            sourceFileName: input.sourceFileName,
            importedAt: this.importedAt,
            books: {},
        };
    }

    setBooks(books: BibleBook[], extraAliasesByBookId: Record<number, string[]> = {}): void {
        const booksDirectory = `translations/${this.input.translationId}/books`;
        this.books = books;

        for (const book of books) {
            const path = `${booksDirectory}/${book.id}.json`;
            const aliases = createCleanAliases([
                book.name,
                book.abbreviation,
                ...(extraAliasesByBookId[book.id] ?? []),
            ].map(removeChapterNumberFromAlias));

            this.translation.books[String(book.id)] = {
                name: removeChapterNumberFromAlias(book.name),
                abbreviation: removeChapterNumberFromAlias(cleanAliasForMetadata(book.abbreviation) ?? book.abbreviation),
                aliases,
                path,
            };
            this.compactBooks[path] = { chapters: [null] };
        }
    }

    hasBook(bookId: number): boolean {
        return this.translation.books[String(bookId)] !== undefined;
    }

    addWarning(warning: string): void {
        this.warnings.push(warning);
    }

    async appendVerses(bookId: number, verses: BibleImportVerse[]): Promise<number> {
        const bookPath = this.translation.books[String(bookId)]?.path;
        if (bookPath === undefined) {
            return 0;
        }

        const bookData = this.compactBooks[bookPath];
        let appendedVerseCount = 0;

        for (const verse of verses) {
            assertBibleImportNotAborted(this.options);
            bookData.chapters[verse.chapter] ??= [null];
            const chapter = bookData.chapters[verse.chapter];
            if (chapter === null) {
                continue;
            }

            chapter[verse.verse] = toCompactVerseData(verse);
            appendedVerseCount += 1;
            await yieldBibleImportIfNeeded(appendedVerseCount, BIBLE_IMPORT_APPEND_VERSES_YIELD_EVERY_VERSES);
        }

        this.importedVerseCount += appendedVerseCount;
        return appendedVerseCount;
    }

    build(): BibleImportResult {
        if (this.importedVerseCount === 0) {
            throw new EpubImportError("EPUB import completed without extracted verses.");
        }

        assertBibleImportNotAborted(this.options);
        this.options.onProgress?.({ stage: "building-index", processedCount: 0, totalCount: this.books.length });
        let processedBookMetadataCount = 0;
        const chapterVerseCounts: ChapterVerseCounts = {};
        for (const [bookId, bookMetadata] of Object.entries(this.translation.books)) {
            const compactBook = this.compactBooks[bookMetadata.path];
            if (compactBook !== undefined) {
                bookMetadata.chapterCount = countImportedChapters(compactBook);
                chapterVerseCounts[Number(bookId)] = getCompactBookChapterVerseCounts(compactBook);
            }
            processedBookMetadataCount += 1;
            this.options.onProgress?.({ stage: "building-index", processedCount: processedBookMetadataCount, totalCount: this.books.length });
        }

        const versificationDetection = this.setDetectedVersification(chapterVerseCounts);

        const { translationId, translationName, language, sourceFileName } = this.input;
        const bibleIndexV2Data: BibleIndexV2Data = {
            version: 2,
            translations: {
                [translationId]: this.translation,
            },
        };
        const stats = calculateStats(this.compactBooks);
        const metadataBytes = byteLength(JSON.stringify(bibleIndexV2Data));
        const booksBytes = Object.values(this.compactBooks).reduce((sum, book) => sum + byteLength(JSON.stringify(book)), 0);

        return {
            translationId,
            translationName,
            language,
            books: this.books,
            bibleIndexV2Data,
            compactBooks: this.compactBooks,
            report: {
                fileName: sourceFileName,
                translationId,
                translationName,
                language,
                books: this.books.length,
                chapters: stats.chapters,
                verses: stats.verses,
                footnotes: stats.footnotes,
                warnings: this.warnings,
                createdAt: this.importedAt,
                metadataBytes,
                booksBytes,
            },
            warnings: this.warnings,
            versificationDetection,
        };
    }

    private setDetectedVersification(chapterVerseCounts: ChapterVerseCounts): BibleImportVersificationDetection {
        const detection = detectVersification(chapterVerseCounts, getVersificationRegistry());
        this.translation.versification = detection.key ?? DEFAULT_VERSIFICATION_KEY;
        this.translation.bookOrder = this.books
            .map((book) => book.id)
            .filter((bookId) => this.translation.books[String(bookId)] !== undefined);

        if (!detection.confident) {
            const scores = detection.scores
                .slice(0, 3)
                .map((score) => `${score.key} ${score.matchedChapters}/${detection.totalChapters}`)
                .join(", ");
            this.warnings.push(`${VERSIFICATION_NOT_DETECTED_WARNING_PREFIX} ${this.translation.versification} (${scores})`);
        }

        return {
            key: this.translation.versification,
            confident: detection.confident,
            totalChapters: detection.totalChapters,
            scores: detection.scores.map(({ key, matchedChapters }) => ({ key, matchedChapters })),
        };
    }
}

export function normalizeLanguage(value: string): string {
    return value.trim().toLowerCase().replace(/_/g, "-");
}

function toCompactVerseData(verse: BibleImportVerse): CompactVerseData {
    return {
        text: verse.text,
        footnotes: [...verse.footnotes],
        paragraphStart: verse.paragraphStart ?? true,
        ...(verse.verseEnd === undefined ? {} : { verseEnd: verse.verseEnd }),
    };
}

function createCleanAliases(values: string[]): string[] {
    const aliases: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        const cleaned = cleanAliasForMetadata(value);
        if (cleaned === null) {
            continue;
        }

        const key = normalizeBookAlias(cleaned);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        aliases.push(cleaned);
    }

    return aliases;
}

function cleanAliasForMetadata(value: string): string | null {
    const cleaned = value
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (cleaned.length === 0) {
        return null;
    }

    if (cleaned.startsWith("^")) {
        return null;
    }

    if (cleaned.includes(":") || cleaned.includes(";")) {
        return null;
    }

    if (/^[\d\s,\-—–]+$/.test(cleaned)) {
        return null;
    }

    if (!containsLetter(cleaned)) {
        return null;
    }

    return cleaned;
}

function containsLetter(value: string): boolean {
    return Array.from(value).some((character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase());
}

function countImportedChapters(book: CompactBibleBookData): number {
    let chapters = 0;

    for (const chapter of book.chapters) {
        if (chapter === null || chapter === undefined) {
            continue;
        }

        if (chapter.some((verse) => verse !== null && verse !== undefined)) {
            chapters += 1;
        }
    }

    return chapters;
}

function calculateStats(books: Record<string, CompactBibleBookData>): { chapters: number; verses: number; footnotes: number } {
    let chapters = 0;
    let verses = 0;
    let footnotes = 0;

    for (const book of Object.values(books)) {
        for (const chapter of book.chapters) {
            if (chapter === null || chapter === undefined) {
                continue;
            }

            chapters += 1;
            for (const verse of chapter) {
                if (verse === null || verse === undefined) {
                    continue;
                }

                verses += 1;
                if (Array.isArray(verse)) {
                    footnotes += verse[1].length;
                } else if (typeof verse === "object") {
                    footnotes += verse.footnotes?.length ?? 0;
                }
            }
        }
    }

    return { chapters, verses, footnotes };
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}
