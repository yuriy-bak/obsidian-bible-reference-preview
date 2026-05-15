import JSZip from "jszip";
import { normalizeBookAlias } from "../../parsing/BookMapping";
import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult, EpubBibleSourceMetadata } from "../EpubBibleImporter";
import { BibleIndexV2Data } from "../v2/BibleIndexV2Data";
import { CompactBibleBookData, CompactVerseData } from "../v2/CompactBibleBookData";
import { readContainerOpfPath, readZipText } from "./EpubContainerReader";
import { EpubImportError } from "./EpubImportError";
import { parseOpfDocument } from "./EpubOpfReader";
import {
    enrichBookTableFromNavigationHtml,
    extractBookNavigationAliasesFromHtml,
    extractBookTableFromHtml,
    extractVersesFromHtml,
    ExtractedBookTable,
    ExtractedVerse,
} from "./htmlTextUtils";

export class JsZipEpubBibleImporter implements EpubBibleImporter {
    async readMetadata(content: ArrayBuffer): Promise<EpubBibleSourceMetadata> {
        const zip = await JSZip.loadAsync(content);
        const opfPath = await readContainerOpfPath(zip);
        const opfXml = await readZipText(zip, opfPath);

        return extractSourceMetadataFromOpf(opfXml);
    }

    async importEpub(input: EpubBibleImportInput): Promise<EpubBibleImportResult> {
        const warnings: string[] = [];
        const zip = await JSZip.loadAsync(input.content);

        const opfPath = await readContainerOpfPath(zip);
        const opfXml = await readZipText(zip, opfPath);
        parseOpfDocument(opfXml);

        const sourceMetadata = extractSourceMetadataFromOpf(opfXml);
        const translationName = input.translationName.trim() || sourceMetadata.title || input.fileName.replace(/\.(epub|tsv)$/i, "");
        const language = normalizeLanguage(input.language) || normalizeLanguage(sourceMetadata.language ?? "") || "und";
        const booksDirectory = `translations/${input.translationId}/books`;

        const xhtmlDocuments = await readAllXhtmlDocuments(zip);
        if (xhtmlDocuments.length === 0) {
            throw new EpubImportError("EPUB does not contain XHTML documents.");
        }

        const bookTable = xhtmlDocuments
            .map((document) => extractBookTableFromHtml(document.html))
            .find((table) => table !== null);

        if (bookTable === undefined || bookTable === null) {
            throw new EpubImportError("EPUB complete 66-book table was not found. Import cannot continue without a validated book table.");
        }

        for (const document of xhtmlDocuments) {
            enrichBookTableFromNavigationHtml(bookTable, document.path, document.html);
        }

        const navigationAliasesByBookId = mergeNavigationAliases(
            xhtmlDocuments
                .filter((document) => isBibleBookNavigationDocument(document.path))
                .map((document) => extractBookNavigationAliasesFromHtml(document.html, bookTable)),
        );

        const importedAt = new Date().toISOString();
        const bibleIndexV2Data: BibleIndexV2Data = {
            version: 2,
            translations: {
                [input.translationId]: {
                    name: translationName,
                    language,
                    sourceFileName: input.fileName,
                    importedAt,
                    books: {},
                },
            },
        };
        const compactBooks: Record<string, CompactBibleBookData> = {};
        const translation = bibleIndexV2Data.translations[input.translationId];

        for (const book of bookTable.books) {
            const path = `${booksDirectory}/${book.id}.json`;
            const aliases = createCleanAliases([
                book.name,
                book.abbreviation,
                ...(navigationAliasesByBookId[book.id] ?? []),
            ]);

            translation.books[String(book.id)] = {
                name: book.name,
                abbreviation: cleanAliasForMetadata(book.abbreviation) ?? book.abbreviation,
                aliases,
                path,
            };
            compactBooks[path] = { chapters: [null] };
        }

        let importedVerseCount = 0;
        for (const document of xhtmlDocuments) {
            const verses = extractVersesFromHtml(document.html);
            if (verses.length === 0) {
                continue;
            }

            const bookId = extractBookIdFromDocumentPath(document.path, bookTable);
            if (bookId === null) {
                warnings.push(`Cannot map XHTML document to Bible book: ${document.path}`);
                continue;
            }

            const bookPath = translation.books[String(bookId)]?.path;
            if (bookPath === undefined) {
                warnings.push(`Unknown Bible book id ${bookId} for XHTML document: ${document.path}`);
                continue;
            }

            importedVerseCount += appendVerses(compactBooks[bookPath], verses);
        }

        if (importedVerseCount === 0) {
            throw new EpubImportError("EPUB import completed without extracted verses.");
        }

        const stats = calculateStats(compactBooks);
        const metadataBytes = byteLength(JSON.stringify(bibleIndexV2Data));
        const booksBytes = Object.values(compactBooks).reduce((sum, book) => sum + byteLength(JSON.stringify(book)), 0);
        const report = {
            fileName: input.fileName,
            translationId: input.translationId,
            translationName,
            language,
            books: bookTable.books.length,
            chapters: stats.chapters,
            verses: stats.verses,
            footnotes: stats.footnotes,
            warnings,
            createdAt: importedAt,
            metadataBytes,
            booksBytes,
        };

        return {
            translationId: input.translationId,
            translationName,
            language,
            books: bookTable.books,
            bibleIndexV2Data,
            compactBooks,
            report,
            warnings,
        };
    }
}

async function readAllXhtmlDocuments(zip: JSZip): Promise<Array<{ path: string; html: string }>> {
    const paths = Object.keys(zip.files)
        .filter((path) => !zip.files[path].dir && /\.xhtml$/i.test(path))
        .sort((left, right) => left.localeCompare(right));

    return Promise.all(paths.map(async (path) => ({
        path,
        html: await zip.file(path)!.async("text"),
    })));
}

function appendVerses(bookData: CompactBibleBookData, verses: ExtractedVerse[]): number {
    let importedVerseCount = 0;

    for (const verse of verses) {
        bookData.chapters[verse.chapter] ??= [null];
        const chapter = bookData.chapters[verse.chapter];
        if (chapter === null) {
            continue;
        }

        chapter[verse.verse] = toCompactVerseData(verse);
        importedVerseCount += 1;
    }

    return importedVerseCount;
}

function toCompactVerseData(verse: ExtractedVerse): CompactVerseData {
    if (verse.footnotes.length === 0) {
        return verse.text;
    }

    return [verse.text, [...verse.footnotes]];
}

function extractBookIdFromDocumentPath(path: string, bookTable: ExtractedBookTable): number | null {
    const fileName = canonicalFileName(path.split("/").pop() ?? path);
    return bookTable.hrefToBookId[fileName] ?? null;
}

function canonicalFileName(fileName: string): string {
    return fileName.replace(/-split\d+(?=\.xhtml$)/i, "");
}

function isBibleBookNavigationDocument(path: string): boolean {
    return /(?:^|\/)biblebooknav\.xhtml$/i.test(path);
}

function mergeNavigationAliases(sources: Array<Record<number, string[]>>): Record<number, string[]> {
    const result: Record<number, string[]> = {};

    for (const source of sources) {
        for (const [bookIdText, aliases] of Object.entries(source)) {
            const bookId = Number(bookIdText);
            result[bookId] ??= [];
            result[bookId].push(...aliases);
        }
    }

    return result;
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

function extractSourceMetadataFromOpf(opfXml: string): EpubBibleSourceMetadata {
    return {
        title: extractXmlElementText(opfXml, "dc:title") ?? extractXmlElementText(opfXml, "title"),
        language: normalizeLanguage(extractXmlElementText(opfXml, "dc:language") ?? extractXmlElementText(opfXml, "language") ?? "") || null,
    };
}

function extractXmlElementText(xml: string, tagName: string): string | null {
    const escapedTagName = tagName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const pattern = new RegExp(`<${escapedTagName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTagName}>`, "i");
    const match = pattern.exec(xml);

    if (match === null) {
        return null;
    }

    const value = decodeXmlEntities(match[1]).replace(/\s+/g, " ").trim();
    return value.length === 0 ? null : value;
}

function normalizeLanguage(value: string): string {
    return value.trim().toLowerCase().replace(/_/g, "-");
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
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
                }
            }
        }
    }

    return { chapters, verses, footnotes };
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}
