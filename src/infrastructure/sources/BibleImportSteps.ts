import type JSZip from "jszip";
import type { BibleBook } from "../../domain/BibleBook";
import { EPUB_IMPORT_LIMITS, readZipText, validateZipArchive } from "../epub/EpubContainerReader";
import { EpubImportError } from "../epub/EpubImportError";
import { loadZipArchive } from "../epub/loadZipArchive";
import { assertBibleImportNotAborted, createBibleImportTimeSlicer } from "./BibleImportCancellation";
import { BibleIndexBuilder, type BibleImportVerse } from "./BibleIndexBuilder";
import type { BibleImportInput, BibleImportOptions } from "./BibleSource";
import { findTraditionalBookAbbreviations } from "./ebible-epub/bookAbbreviationTables";

// The steps the ZIP-based Bible sources share; each source only finds its books and reads their verses.

/** Unpacks the archive of an import and checks its entries, reporting the "loading" stage. */
export async function openImportArchive(content: ArrayBuffer, options: BibleImportOptions): Promise<JSZip> {
    assertBibleImportNotAborted(options);
    options.onProgress?.({ stage: "loading-zip", processedCount: 0, totalCount: 1 });
    const zip = await loadZipArchive(content);
    assertBibleImportNotAborted(options);
    options.onProgress?.({ stage: "loading-zip", processedCount: 1, totalCount: 1 });
    validateZipArchive(zip);
    return zip;
}

/** The name typed in the import dialog, else the name the file gives, else the file name without `extension`. */
export function resolveTranslationName(input: BibleImportInput, sourceTitle: string | null, extension: RegExp): string {
    return input.translationName.trim() || sourceTitle || input.fileName.replace(extension, "");
}

export function createImportBuilder(input: BibleImportInput, translationName: string, language: string, options: BibleImportOptions): BibleIndexBuilder {
    return new BibleIndexBuilder({
        translationId: input.translationId,
        translationName,
        language,
        sourceFileName: input.fileName,
    }, options);
}

/** Books with the traditional abbreviations of the language, or the name where the language has none. */
export function withTraditionalAbbreviations(language: string, books: Array<{ id: number; name: string }>): BibleBook[] {
    const abbreviations = findTraditionalBookAbbreviations(language, books);
    return books.map((book) => ({ ...book, abbreviation: abbreviations.get(book.id) ?? book.name }));
}

export function addSkippedBooksWarning(builder: BibleIndexBuilder, skippedCodes: string[]): void {
    if (skippedCodes.length > 0) {
        builder.addWarning(`Skipped books outside the 66-book canon: ${skippedCodes.join(", ")}`);
    }
}

export type ImportedBookSource = {
    bookId: number;
    /** For the warning when the book has no verses. */
    label: string;
};

/**
 * Reads the verses of each book in turn (one book's markup in memory at a time), with progress,
 * cancellation and pauses that keep Obsidian responsive.
 */
export async function appendBookVerses<T extends ImportedBookSource>(
    builder: BibleIndexBuilder,
    books: T[],
    readVerses: (book: T) => Promise<BibleImportVerse[]>,
    options: BibleImportOptions,
): Promise<void> {
    const yieldIfSliceElapsed = createBibleImportTimeSlicer();
    options.onProgress?.({ stage: "extracting-verses", processedCount: 0, totalCount: books.length });
    for (let bookIndex = 0; bookIndex < books.length; bookIndex += 1) {
        assertBibleImportNotAborted(options);
        const book = books[bookIndex];
        const verses = await readVerses(book);
        if (verses.length === 0) {
            builder.addWarning(`No verses found in ${book.label}`);
        }
        await builder.appendVerses(book.bookId, verses);
        options.onProgress?.({ stage: "extracting-verses", processedCount: bookIndex + 1, totalCount: books.length });
        await yieldIfSliceElapsed();
    }
}

/**
 * Reads markup files of the archive on demand, keeping the per-file and the total limits of an import;
 * a file read twice counts once.
 */
export function createArchiveTextReader(zip: JSZip): (path: string) => Promise<string> {
    const countedPaths = new Set<string>();
    let totalBytes = 0;
    return async (path) => {
        const text = await readZipText(zip, path, EPUB_IMPORT_LIMITS.maxSingleHtmlTextBytes);
        if (!countedPaths.has(path)) {
            countedPaths.add(path);
            totalBytes += new TextEncoder().encode(text).byteLength;
            if (totalBytes > EPUB_IMPORT_LIMITS.maxTotalHtmlTextBytes) {
                throw new EpubImportError(
                    `EPUB HTML/XML text content is too large. Size: ${totalBytes} bytes. Maximum allowed: ${EPUB_IMPORT_LIMITS.maxTotalHtmlTextBytes} bytes.`,
                    "totalTooLarge",
                    { size: totalBytes, max: EPUB_IMPORT_LIMITS.maxTotalHtmlTextBytes },
                );
            }
        }
        return text;
    };
}
