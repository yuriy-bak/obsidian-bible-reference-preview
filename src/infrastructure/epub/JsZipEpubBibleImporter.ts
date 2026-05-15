import JSZip from "jszip";
import { BibleIndexData } from "../BibleIndexData";
import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "../EpubBibleImporter";
import { readContainerOpfPath, readZipText, resolveZipPath } from "./EpubContainerReader";
import { EpubImportError } from "./EpubImportError";
import { getSpineXhtmlItems, parseOpfDocument } from "./EpubOpfReader";
import {
    extractBookIdFromHtmlOrPath,
    extractBookTableFromHtml,
    extractVersesFromHtml,
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
            throw new EpubImportError("EPUB book table was not found. Import cannot continue without book names and abbreviations.");
        }

        const bibleIndexData: BibleIndexData = {
            translations: {
                [input.translationId]: {
                    name: input.translationName,
                    books: {},
                },
            },
        };

        const translation = bibleIndexData.translations[input.translationId];

        for (const book of bookTable.books) {
            translation.books[String(book.id)] = {
                name: book.abbreviation,
                chapters: {},
            };
        }

        let lastInferredBookId: number | null = null;
        let inferredBookIdCount = 0;
        let importedVerseCount = 0;

        for (const document of xhtmlDocuments) {
            const verses = extractVersesFromHtml(document.html);

            if (verses.length === 0) {
                continue;
            }

            let bookId = extractBookIdFromHtmlOrPath(document.html, document.path, bookTable.books);

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

                inferredBookIdCount += 1;
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

        if (inferredBookIdCount > 0) {
            warnings.push(`Book id was inferred from spine order for ${inferredBookIdCount} XHTML documents.`);
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