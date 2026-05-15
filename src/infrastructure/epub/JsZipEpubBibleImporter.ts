import JSZip from "jszip";
import { normalizeBookAlias } from "../../parsing/BookMapping";
import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "../EpubBibleImporter";
import { BibleIndexV2Data } from "../v2/BibleIndexV2Data";
import { CompactBibleBookData, CompactVerseData } from "../v2/CompactBibleBookData";
import { readContainerOpfPath, readZipText } from "./EpubContainerReader";
import { EpubImportError } from "./EpubImportError";
import { parseOpfDocument } from "./EpubOpfReader";
import { extractBookNavigationAliasesFromHtml, extractBookTableFromHtml, extractVersesFromHtml, ExtractedBookTable, ExtractedVerse } from "./htmlTextUtils";

const BOOKS_DIRECTORY = "translations/newworld/books";

export class JsZipEpubBibleImporter implements EpubBibleImporter {
    async importEpub(input: EpubBibleImportInput): Promise<EpubBibleImportResult> {
        const warnings: string[] = [];
        const zip = await JSZip.loadAsync(input.content);
        const opfPath = await readContainerOpfPath(zip);
        parseOpfDocument(await readZipText(zip, opfPath));

        const xhtmlDocuments = await readAllXhtmlDocuments(zip);
        const bookTable = xhtmlDocuments.map((document) => extractBookTableFromHtml(document.html)).find((table) => table !== null);
        if (bookTable === undefined || bookTable === null) {
            throw new EpubImportError("EPUB complete 66-book table was not found. Import cannot continue without a validated book table.");
        }

        const navigationAliasesByBookId = mergeNavigationAliases(
            xhtmlDocuments
                .filter((document) => /(?:^|\/)biblebooknav\.xhtml$/i.test(document.path))
                .map((document) => extractBookNavigationAliasesFromHtml(document.html, bookTable)),
        );

        const bibleIndexV2Data: BibleIndexV2Data = { version: 2, translations: { [input.translationId]: { name: input.translationName, books: {} } } };
        const compactBooks: Record<string, CompactBibleBookData> = {};
        const translation = bibleIndexV2Data.translations[input.translationId];

        for (const book of bookTable.books) {
            const path = `${BOOKS_DIRECTORY}/${book.id}.json`;
            translation.books[String(book.id)] = {
                name: book.name,
                abbreviation: cleanAliasForMetadata(book.abbreviation) ?? book.abbreviation,
                aliases: createCleanAliases([book.name, book.abbreviation, ...(navigationAliasesByBookId[book.id] ?? [])]),
                path,
            };
            compactBooks[path] = { chapters: [null] };
        }

        let importedVerseCount = 0;
        for (const document of xhtmlDocuments) {
            const verses = extractVersesFromHtml(document.html);
            if (verses.length === 0) continue;
            const bookId = extractBookIdFromDocumentPath(document.path, bookTable);
            if (bookId === null) { warnings.push(`Cannot map XHTML document to Bible book: ${document.path}`); continue; }
            const bookPath = translation.books[String(bookId)]?.path;
            if (bookPath === undefined) continue;
            importedVerseCount += appendVerses(compactBooks[bookPath], verses);
        }

        if (importedVerseCount === 0) throw new EpubImportError("EPUB import completed without extracted verses.");

        const stats = calculateStats(compactBooks);
        const metadataBytes = byteLength(JSON.stringify(bibleIndexV2Data));
        const booksBytes = Object.values(compactBooks).reduce((sum, book) => sum + byteLength(JSON.stringify(book)), 0);
        const report = { fileName: input.fileName, translationId: input.translationId, books: bookTable.books.length, chapters: stats.chapters, verses: stats.verses, footnotes: stats.footnotes, warnings, createdAt: new Date().toISOString(), metadataBytes, booksBytes };

        return { translationId: input.translationId, translationName: input.translationName, books: bookTable.books, bibleIndexV2Data, compactBooks, report, warnings };
    }
}

async function readAllXhtmlDocuments(zip: JSZip): Promise<Array<{ path: string; html: string }>> {
    const paths = Object.keys(zip.files).filter((path) => !zip.files[path].dir && /\.xhtml$/i.test(path)).sort((left, right) => left.localeCompare(right));
    return Promise.all(paths.map(async (path) => ({ path, html: await zip.file(path)!.async("text") })));
}

function appendVerses(bookData: CompactBibleBookData, verses: ExtractedVerse[]): number {
    let count = 0;
    for (const verse of verses) {
        bookData.chapters[verse.chapter] ??= [null];
        const chapter = bookData.chapters[verse.chapter];
        if (chapter !== null) { chapter[verse.verse] = toCompactVerseData(verse); count += 1; }
    }
    return count;
}

function toCompactVerseData(verse: ExtractedVerse): CompactVerseData {
    return verse.footnotes.length === 0 ? verse.text : [verse.text, [...verse.footnotes]];
}

function extractBookIdFromDocumentPath(path: string, bookTable: ExtractedBookTable): number | null {
    const fileName = (path.split("/").pop() ?? path).replace(/-split\d+(?=\.xhtml$)/i, "");
    return bookTable.hrefToBookId[fileName] ?? null;
}

function mergeNavigationAliases(sources: Array<Record<number, string[]>>): Record<number, string[]> {
    const result: Record<number, string[]> = {};
    for (const source of sources) for (const [bookIdText, aliases] of Object.entries(source)) { const bookId = Number(bookIdText); result[bookId] ??= []; result[bookId].push(...aliases); }
    return result;
}

function createCleanAliases(values: string[]): string[] {
    const aliases: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const cleaned = cleanAliasForMetadata(value);
        if (cleaned === null) continue;
        const key = normalizeBookAlias(cleaned);
        if (!seen.has(key)) { seen.add(key); aliases.push(cleaned); }
    }
    return aliases;
}

function cleanAliasForMetadata(value: string): string | null {
    const cleaned = value.replace(/\./g, "").replace(/\s+/g, " ").trim();
    if (cleaned.length === 0 || cleaned.startsWith("^") || cleaned.includes(":") || cleaned.includes(";")) return null;
    if (/^[\d\s,\-—–]+$/.test(cleaned) || !/[A-Za-zА-Яа-яЁё]/.test(cleaned)) return null;
    return cleaned;
}

function calculateStats(books: Record<string, CompactBibleBookData>): { chapters: number; verses: number; footnotes: number } {
    let chapters = 0; let verses = 0; let footnotes = 0;
    for (const book of Object.values(books)) for (const chapter of book.chapters) {
        if (chapter === null || chapter === undefined) continue;
        chapters += 1;
        for (const verse of chapter) if (verse !== null && verse !== undefined) { verses += 1; if (Array.isArray(verse)) footnotes += verse[1].length; }
    }
    return { chapters, verses, footnotes };
}

function byteLength(value: string): number { return new TextEncoder().encode(value).length; }
