import JSZip from "jszip";
import { EPUB_IMPORT_LIMITS, normalizeZipPath, readZipText, resolveZipPath } from "../epub/EpubContainerReader";
import { EpubImportError } from "../epub/EpubImportError";
import { getSpineXhtmlItems, parseOpfDocument, parseOpfMetadata } from "../epub/EpubOpfReader";
import { assertBibleImportNotAborted, yieldBibleImportIfNeeded } from "./BibleImportCancellation";
import { normalizeLanguage } from "./BibleIndexBuilder";
import { BibleImportOptions, BibleSourceMetadata } from "./BibleSource";

// Shared by the EPUB Bible sources: the markup documents of an archive and its OPF metadata.

const EPUB_IMPORT_READ_DOCUMENTS_YIELD_EVERY_FILES = 10;

export type EpubTextDocument = {
    path: string;
    html: string;
};

/** Spine documents first, in reading order, then any other markup files of the archive sorted by path. */
export function getDocumentPathsInReadingOrder(zip: JSZip, opfPath: string, opfXml: string): string[] {
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

export function resolveManifestHref(opfPath: string, href: string): string | null {
    try {
        return resolveZipPath(opfPath, decodeURIComponent(href.split("#")[0]));
    } catch {
        return null;
    }
}

export async function readAllXhtmlDocuments(zip: JSZip, paths: string[], options: BibleImportOptions): Promise<EpubTextDocument[]> {
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

export function extractSourceMetadataFromOpf(opfXml: string): BibleSourceMetadata {
    const metadata = parseOpfMetadata(opfXml);

    return {
        title: metadata.title,
        language: normalizeLanguage(metadata.language ?? "") || null,
    };
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}
