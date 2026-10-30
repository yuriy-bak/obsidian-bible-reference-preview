import type { BibleBook } from "../../../domain/BibleBook";
import { assertBibleImportNotAborted, createBibleImportTimeSlicer } from "../BibleImportCancellation";
import { BibleIndexBuilder, normalizeLanguage } from "../BibleIndexBuilder";
import { BibleImportInput, BibleImportOptions, BibleImportResult, BibleSource, BibleSourceFile, BibleSourceMetadata } from "../BibleSource";
import { findTraditionalBookAbbreviations } from "../ebible-epub/bookAbbreviationTables";
import { getBookIdByDbsCode } from "./dbsBookCodes";
import { decompressDbsChapters, extractVersesFromDbsChapter, isDbsBiblePage, readDbsBiblePage } from "./dbsHtml";

const MAX_PAGE_BYTES = 50 * 1024 * 1024;

/** ISO 639-3 codes of the page's `lang` attribute as the two-letter codes the plugin uses elsewhere. */
const TWO_LETTER_LANGUAGES: Record<string, string> = {
    rus: "ru", eng: "en", ukr: "uk", bel: "be", deu: "de", fra: "fr", spa: "es", por: "pt", ita: "it", pol: "pl", tur: "tr",
};

/**
 * "HTML Study Bible" of the Digital Bible Society (dbs.org), saved from the browser as one HTML page:
 * the translation is compressed inside the page's scripts. Books outside the 66-book canon are skipped.
 */
export class DbsHtmlBibleSource implements BibleSource {
    readonly id = "dbs-html";
    readonly label = "dbs.org (HTML Study Bible)";
    readonly fileTypes = { extensions: [".html", ".htm"], mimeTypes: ["text/html"] };
    readonly maxFileBytes = MAX_PAGE_BYTES;

    canHandle(file: BibleSourceFile): Promise<boolean> {
        if (file.content.byteLength > this.maxFileBytes) {
            return Promise.resolve(false);
        }
        try {
            return Promise.resolve(isDbsBiblePage(decodeText(file.content)));
        } catch {
            return Promise.resolve(false);
        }
    }

    readMetadata(content: ArrayBuffer): Promise<BibleSourceMetadata> {
        const page = readDbsBiblePage(decodeText(content));
        return Promise.resolve({ title: page.bibleId, language: toTwoLetterLanguage(page.language ?? "") || null });
    }

    async importBible(input: BibleImportInput, options: BibleImportOptions = {}): Promise<BibleImportResult> {
        assertBibleImportNotAborted(options);
        options.onProgress?.({ stage: "reading-documents", processedCount: 0, totalCount: 1 });
        const page = readDbsBiblePage(decodeText(input.content));
        const chapters = decompressDbsChapters(page.compressedVerses);
        options.onProgress?.({ stage: "reading-documents", processedCount: 1, totalCount: 1 });

        const translationName = input.translationName.trim() || page.bibleId || input.fileName.replace(/\.html?$/i, "");
        const language = normalizeLanguage(input.language) || toTwoLetterLanguage(page.language ?? "") || "und";

        const canonicalBooks = page.books
            .map((book) => ({ ...book, id: getBookIdByDbsCode(book.code) }))
            .filter((book): book is { code: string; name: string; id: number } => book.id !== null);
        const skippedCodes = page.books.filter((book) => getBookIdByDbsCode(book.code) === null).map((book) => book.code);
        const abbreviations = findTraditionalBookAbbreviations(language, canonicalBooks);
        const books: BibleBook[] = canonicalBooks.map((book) => ({ id: book.id, name: book.name, abbreviation: abbreviations.get(book.id) ?? book.name }));

        const builder = new BibleIndexBuilder({ translationId: input.translationId, translationName, language, sourceFileName: input.fileName }, options);
        builder.setBooks(books);
        if (skippedCodes.length > 0) {
            builder.addWarning(`Skipped books outside the 66-book canon: ${skippedCodes.join(", ")}`);
        }

        const yieldIfSliceElapsed = createBibleImportTimeSlicer();
        options.onProgress?.({ stage: "extracting-verses", processedCount: 0, totalCount: canonicalBooks.length });
        for (let bookIndex = 0; bookIndex < canonicalBooks.length; bookIndex += 1) {
            assertBibleImportNotAborted(options);
            const book = canonicalBooks[bookIndex];
            const chapterKeys = Object.keys(chapters).filter((key) => key.startsWith(book.code) && /^\d+$/.test(key.slice(book.code.length)));
            const verses = chapterKeys
                .sort((left, right) => Number(left.slice(book.code.length)) - Number(right.slice(book.code.length)))
                .flatMap((key) => extractVersesFromDbsChapter(chapters[key]));
            if (verses.length === 0) {
                builder.addWarning(`No verses found in ${book.code}`);
            }
            await builder.appendVerses(book.id, verses);
            options.onProgress?.({ stage: "extracting-verses", processedCount: bookIndex + 1, totalCount: canonicalBooks.length });
            await yieldIfSliceElapsed();
        }

        return builder.build();
    }
}

function decodeText(content: ArrayBuffer): string {
    return new TextDecoder("utf-8").decode(content);
}

function toTwoLetterLanguage(language: string): string {
    const normalized = normalizeLanguage(language);
    return TWO_LETTER_LANGUAGES[normalized] ?? normalized;
}
