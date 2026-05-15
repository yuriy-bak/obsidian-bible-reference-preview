import JSZip from "jszip";
import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "../EpubBibleImporter";
import { BibleIndexData } from "../BibleIndexData";
import { readContainerOpfPath, readZipText, resolveZipPath } from "./EpubContainerReader";
import { EpubImportError } from "./EpubImportError";
import { getSpineXhtmlItems, parseOpfDocument } from "./EpubOpfReader";
import {
    extractBookIdFromHtmlOrPath,
    extractBookTableFromHtml,
    extractVersesFromHtml,
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

        for (const document of xhtmlDocuments) {
            const bookId = extractBookIdFromHtmlOrPath(document.html, document.path, bookTable.books);
            if (bookId === null) {
                warnings.push(`Book id was not detected for XHTML document: ${document.path}`);
                continue;
            }

            const book = translation.books[String(bookId)];
            if (book === undefined) {
                warnings.push(`Detected unknown book id ${bookId} for XHTML document: ${document.path}`);
                continue;
            }

            const verses = extractVersesFromHtml(document.html);
            if (verses.length === 0) {
                warnings.push(`No verses were found in XHTML document: ${document.path}`);
                continue;
            }

            for (const verse of verses) {
                const chapterKey = String(verse.chapter);
                const verseKey = String(verse.verse);
                book.chapters[chapterKey] ??= {};
                book.chapters[chapterKey][verseKey] = toBibleIndexVerseData(verse);
            }
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
