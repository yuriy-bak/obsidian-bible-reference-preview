import JSZip from "jszip";
import { EPUB_IMPORT_LIMITS, normalizeZipPath, readContainerOpfPath, readZipText, resolveZipPath, validateZipArchive } from "../../epub/EpubContainerReader";
import { EpubImportError } from "../../epub/EpubImportError";
import { getSpineXhtmlItems, parseOpfDocument, parseOpfMetadata } from "../../epub/EpubOpfReader";
import { parseXhtmlDocument } from "../../epub/MarkupDocument";
import { assertBibleImportNotAborted, createBibleImportTimeSlicer, yieldBibleImportIfNeeded } from "../BibleImportCancellation";
import { BibleIndexBuilder, normalizeLanguage } from "../BibleIndexBuilder";
import { BibleImportInput, BibleImportOptions, BibleImportResult, BibleSource, BibleSourceFile, BibleSourceMetadata } from "../BibleSource";
import {
    canonicalVerseDocumentFileName,
    enrichBookTableFromNavigationDocument,
    extractBookNavigationAliasesFromDocument,
    extractBookTableFromDocument,
    extractVersesFromDocument,
    ExtractedBookTable,
    ExtractedVerse,
} from "./jwEpubHtml";

const EPUB_IMPORT_READ_DOCUMENTS_YIELD_EVERY_FILES = 10;

type EpubTextDocument = {
    path: string;
    html: string;
};

/** EPUB Bible as published on jw.org: a 66-book table, chapter navigation pages and `chapterN_verseM` verse markers. */
export class JwEpubBibleSource implements BibleSource {
    readonly id = "jw-epub";
    readonly label = "jw.org";
    readonly fileTypes = { extensions: [".epub"], mimeTypes: ["application/epub+zip"] };
    readonly maxFileBytes = EPUB_IMPORT_LIMITS.maxArchiveBytes;

    // A jw.org EPUB has the book navigation page and Watchtower as its creator or publisher; either one is
    // enough, so a layout change on one side does not lock the files out. The page is looked up among the ZIP
    // entries first: parsing the OPF (half a megabyte in NWT) is only needed when it is missing.
    async canHandle(file: BibleSourceFile): Promise<boolean> {
        const bytes = new Uint8Array(file.content.slice(0, 2));
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || file.content.byteLength > this.maxFileBytes) {
            return false;
        }
        try {
            const zip = await JSZip.loadAsync(file.content);
            validateZipArchive(zip);
            const opfXml = await readZipText(zip, await readContainerOpfPath(zip));
            if (Object.keys(zip.files).some((path) => isBibleBookNavigationDocument(path))) {
                return true;
            }
            const metadata = parseOpfMetadata(opfXml);
            return [metadata.creator, metadata.publisher].some((value) => /watchtower/i.test(value ?? ""));
        } catch {
            return false;
        }
    }

    async readMetadata(content: ArrayBuffer): Promise<BibleSourceMetadata> {
        const zip = await JSZip.loadAsync(content);
        validateZipArchive(zip);
        const opfPath = await readContainerOpfPath(zip);
        const opfXml = await readZipText(zip, opfPath);

        return extractSourceMetadataFromOpf(opfXml);
    }

    async importBible(input: BibleImportInput, options: BibleImportOptions = {}): Promise<BibleImportResult> {
        assertBibleImportNotAborted(options);
        options.onProgress?.({ stage: "loading-zip", processedCount: 0, totalCount: 1 });
        const zip = await JSZip.loadAsync(input.content);
        assertBibleImportNotAborted(options);
        options.onProgress?.({ stage: "loading-zip", processedCount: 1, totalCount: 1 });
        validateZipArchive(zip);

        const opfPath = await readContainerOpfPath(zip);
        const opfXml = await readZipText(zip, opfPath);
        const sourceMetadata = extractSourceMetadataFromOpf(opfXml);
        const translationName = input.translationName.trim() || sourceMetadata.title || input.fileName.replace(/\.epub$/i, "");
        const language = normalizeLanguage(input.language) || normalizeLanguage(sourceMetadata.language ?? "") || "und";

        const documents = await readAllXhtmlDocuments(zip, getDocumentPathsInReadingOrder(zip, opfPath, opfXml), options);
        if (documents.length === 0) {
            throw new EpubImportError("EPUB does not contain XHTML documents.");
        }

        const bookTable = await findBookTable(documents, options);
        if (bookTable === null) {
            throw new EpubImportError("EPUB complete 66-book table was not found. Import cannot continue without a validated book table.");
        }

        const verseDocuments: Array<{ path: string; verses: ExtractedVerse[] }> = [];
        const yieldIfSliceElapsed = createBibleImportTimeSlicer();
        options.onProgress?.({ stage: "extracting-verses", processedCount: 0, totalCount: documents.length });
        for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
            assertBibleImportNotAborted(options);
            const textDocument = documents[documentIndex];
            const document = parseXhtmlDocument(textDocument.html);
            enrichBookTableFromNavigationDocument(bookTable, textDocument.path, document);

            const verses = extractVersesFromDocument(document);
            if (verses.length > 0) {
                verseDocuments.push({ path: textDocument.path, verses });
            }
            options.onProgress?.({ stage: "extracting-verses", processedCount: documentIndex + 1, totalCount: documents.length });
            await yieldIfSliceElapsed();
        }

        // Book navigation aliases are resolved after every navigation page has extended the href table.
        const navigationAliasesByBookId = mergeNavigationAliases(
            documents
                .filter((textDocument) => isBibleBookNavigationDocument(textDocument.path))
                .map((textDocument) => extractBookNavigationAliasesFromDocument(parseXhtmlDocument(textDocument.html), bookTable)),
        );

        const builder = new BibleIndexBuilder({
            translationId: input.translationId,
            translationName,
            language,
            sourceFileName: input.fileName,
        }, options);
        builder.setBooks(bookTable.books, navigationAliasesByBookId);

        for (const verseDocument of verseDocuments) {
            const bookId = extractBookIdFromDocumentPath(verseDocument.path, bookTable);
            if (bookId === null) {
                builder.addWarning(`Cannot map XHTML document to Bible book: ${verseDocument.path}`);
                continue;
            }

            if (!builder.hasBook(bookId)) {
                builder.addWarning(`Unknown Bible book id ${bookId} for XHTML document: ${verseDocument.path}`);
                continue;
            }

            await builder.appendVerses(bookId, verseDocument.verses);
        }

        return builder.build();
    }
}

/** Spine documents first, in reading order, then any other markup files of the archive sorted by path. */
function getDocumentPathsInReadingOrder(zip: JSZip, opfPath: string, opfXml: string): string[] {
    const isReadableFile = (path: string): boolean => zip.files[path] !== undefined && !zip.files[path].dir;
    const spinePaths: string[] = [];
    const seen = new Set<string>();

    for (const item of getSpineXhtmlItems(parseOpfDocument(opfXml))) {
        const path = resolveManifestHref(opfPath, item.href);
        if (path !== null && isReadableFile(path) && !seen.has(path)) {
            seen.add(path);
            spinePaths.push(path);
        }
    }

    const otherPaths = Object.keys(zip.files)
        .map((path) => normalizeZipPath(path))
        .filter((path) => isReadableFile(path) && !seen.has(path) && /\.(?:xhtml|html|xml)$/i.test(path))
        .sort((left, right) => left.localeCompare(right));

    return [...spinePaths, ...otherPaths];
}

function resolveManifestHref(opfPath: string, href: string): string | null {
    try {
        return resolveZipPath(opfPath, decodeURIComponent(href.split("#")[0]));
    } catch {
        return null;
    }
}

async function readAllXhtmlDocuments(zip: JSZip, paths: string[], options: BibleImportOptions): Promise<EpubTextDocument[]> {
    const documents: EpubTextDocument[] = [];
    let totalHtmlTextBytes = 0;
    options.onProgress?.({ stage: "reading-documents", processedCount: 0, totalCount: paths.length });

    for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
        assertBibleImportNotAborted(options);
        const path = paths[pathIndex];
        const html = await readZipText(zip, path, EPUB_IMPORT_LIMITS.maxSingleHtmlTextBytes);
        totalHtmlTextBytes += byteLength(html);

        if (totalHtmlTextBytes > EPUB_IMPORT_LIMITS.maxTotalHtmlTextBytes) {
            throw new EpubImportError(`EPUB HTML/XML text content is too large. Size: ${totalHtmlTextBytes} bytes. Maximum allowed: ${EPUB_IMPORT_LIMITS.maxTotalHtmlTextBytes} bytes.`);
        }

        documents.push({ path, html });
        options.onProgress?.({ stage: "reading-documents", processedCount: pathIndex + 1, totalCount: paths.length });
        await yieldBibleImportIfNeeded(pathIndex + 1, EPUB_IMPORT_READ_DOCUMENTS_YIELD_EVERY_FILES);
    }

    return documents;
}

async function findBookTable(documents: EpubTextDocument[], options: BibleImportOptions): Promise<ExtractedBookTable | null> {
    const yieldIfSliceElapsed = createBibleImportTimeSlicer();
    for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
        assertBibleImportNotAborted(options);
        const bookTable = extractBookTableFromDocument(parseXhtmlDocument(documents[documentIndex].html));
        if (bookTable !== null) {
            return bookTable;
        }
        await yieldIfSliceElapsed();
    }

    return null;
}

function extractBookIdFromDocumentPath(path: string, bookTable: ExtractedBookTable): number | null {
    const fileName = canonicalVerseDocumentFileName(path.split("/").pop() ?? path);
    return bookTable.hrefToBookId[fileName] ?? null;
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

function extractSourceMetadataFromOpf(opfXml: string): BibleSourceMetadata {
    const metadata = parseOpfMetadata(opfXml);

    return {
        title: metadata.title,
        language: normalizeLanguage(metadata.language ?? "") || null,
    };
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}
