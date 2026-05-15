import JSZip from "jszip";
import { BibleIndexData } from "../BibleIndexData";
import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "../EpubBibleImporter";
import { readContainerOpfPath, readZipText, resolveZipPath } from "./EpubContainerReader";
import { EpubImportError } from "./EpubImportError";
import { getSpineXhtmlItems, parseOpfDocument } from "./EpubOpfReader";
import {
    extractBookIdFromHtmlOrPath,
    extractBookNavigationAliasesFromHtml,
    extractBookTableFromHtml,
    extractVersesFromHtml,
    ExtractedBookTable,
    ExtractedVerse,
    toBibleIndexVerseData,
} from "./htmlTextUtils";

export class JsZipEpubBibleImporter implements EpubBibleImporter {
    async importEpub(input: EpubBibleImportInput): Promise<EpubBibleImportResult> {
        const warnings: string[] = [];
        const zip = await JSZip.loadAsync(input.content);
        const opfPath = await readContainerOpfPath(zip);
        const opfXml = await readZipText(zip, opfPath);
        const opf = parseOpfDocument(opfXml);
        const spineItems = getSpineXhtmlItems(opf);

        if (spineItems.length === 0) {
            throw new EpubImportError("EPUB spine does not contain XHTML documents.");
        }

        const xhtmlDocuments = await Promise.all(spineItems.map(async (item) => {
            const path = resolveZipPath(opfPath, item.href);
            return {
                path,
                html: await readZipText(zip, path),
            };
        }));

        const bookTable = xhtmlDocuments
            .map((document) => extractBookTableFromHtml(document.html))
            .find((table) => table !== null);

        if (bookTable === undefined || bookTable === null) {
            throw new EpubImportError("EPUB complete 66-book table was not found. Import cannot continue without a validated book table.");
        }

        const bibleIndexData: BibleIndexData = {
            translations: {
                [input.translationId]: {
                    name: input.translationName,
                    books: {},
                },
            },
        };


        const navigationAliasesByBookId = mergeNavigationAliases(
            xhtmlDocuments.map((document) => extractBookNavigationAliasesFromHtml(document.html, bookTable)),
        );

        const translation = bibleIndexData.translations[input.translationId];

        for (const book of bookTable.books) {

            const aliases = uniqueStrings([
                book.name,
                book.abbreviation,
                ...(book.aliases ?? []),
                ...(navigationAliasesByBookId[book.id] ?? []),
            ]);

            translation.books[String(book.id)] = {
                name: book.name,
                aliases,
                chapters: {},
            };
        }

        let lastInferredBookId: number | null = null;
        let importedVerseCount = 0;

        for (const document of xhtmlDocuments) {
            const verses = extractVersesFromHtml(document.html);

            if (verses.length === 0) {
                continue;
            }

            let bookId = extractBookIdFromDocumentPath(document.path, bookTable);

            if (bookId === null) {
                bookId = extractBookIdFromHtmlOrPath(document.html, document.path, bookTable.books);
            }

            if (bookId === null) {
                bookId = inferBookIdFromSpineOrder(
                    bookTable.books,
                    translation.books,
                    verses,
                    lastInferredBookId,
                );

                if (bookId === null) {
                    warnings.push(`Book id was not detected for XHTML document with verses: ${document.path}`);
                    continue;
                }
            }

            const book = translation.books[String(bookId)];
            if (book === undefined) {
                warnings.push(`Detected unknown book id ${bookId} for XHTML document: ${document.path}`);
                continue;
            }

            lastInferredBookId = bookId;

            for (const verse of verses) {
                const chapterKey = String(verse.chapter);
                const verseKey = String(verse.verse);

                book.chapters[chapterKey] ??= {};
                book.chapters[chapterKey][verseKey] = toBibleIndexVerseData(verse);
                importedVerseCount += 1;
            }
        }

        if (importedVerseCount === 0) {
            throw new EpubImportError("EPUB import did not find any verses in XHTML documents.");
        }

        return {
            translationId: input.translationId,
            translationName: input.translationName,
            books: bookTable.books,
            bibleIndexData,
            warnings,
        };
    }
}

function extractBookIdFromDocumentPath(path: string, bookTable: ExtractedBookTable): number | null {
    const fileName = path.split("/").pop() ?? path;
    const canonicalFileName = fileName.replace(/-split\d+(?=\.xhtml$)/i, "");

    return bookTable.hrefToBookId[canonicalFileName] ?? null;
}

function inferBookIdFromSpineOrder(
    books: Array<{ id: number }>,
    importedBooks: BibleIndexData["translations"][string]["books"],
    verses: ExtractedVerse[],
    lastInferredBookId: number | null,
): number | null {
    if (books.length === 0) {
        return null;
    }

    if (lastInferredBookId === null) {
        return books[0].id;
    }

    const currentBook = importedBooks[String(lastInferredBookId)];
    if (currentBook === undefined) {
        return lastInferredBookId;
    }

    if (!startsAtFirstVerse(verses)) {
        return lastInferredBookId;
    }

    if (!hasAnyImportedVerses(currentBook)) {
        return lastInferredBookId;
    }

    const currentBookIndex = books.findIndex((book) => book.id === lastInferredBookId);
    if (currentBookIndex < 0) {
        return lastInferredBookId;
    }

    return books[currentBookIndex + 1]?.id ?? lastInferredBookId;
}

function startsAtFirstVerse(verses: ExtractedVerse[]): boolean {
    const firstVerse = verses[0];

    return firstVerse !== undefined
        && firstVerse.chapter === 1
        && firstVerse.verse === 1;
}

function hasAnyImportedVerses(book: BibleIndexData["translations"][string]["books"][string]): boolean {
    return Object.values(book.chapters)
        .some((chapter) => Object.keys(chapter).length > 0);
}

function mergeNavigationAliases(
    aliasMaps: Array<Record<number, string[]>>,
): Record<number, string[]> {
    const result: Record<number, string[]> = {};

    for (const aliasMap of aliasMaps) {
        for (const [bookId, aliases] of Object.entries(aliasMap)) {
            const numericBookId = Number(bookId);
            result[numericBookId] ??= [];
            result[numericBookId].push(...aliases);
        }
    }

    return result;
}

function uniqueStrings(values: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        const normalized = value.trim();
        const key = normalized.toLowerCase();

        if (normalized.length === 0 || seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(normalized);
    }

    return result;
}