import JSZip from "jszip";
import { EpubImportError } from "./EpubImportError";

export const EPUB_IMPORT_LIMITS = {
    maxArchiveBytes: 100 * 1024 * 1024,
    maxZipEntries: 5000,
    maxXmlTextBytes: 8 * 1024 * 1024,
    maxSingleHtmlTextBytes: 12 * 1024 * 1024,
    maxTotalHtmlTextBytes: 80 * 1024 * 1024,
} as const;

type ZipEntryWithInternalSize = JSZip.JSZipObject & {
    _data?: {
        uncompressedSize?: unknown;
    };
};

export function validateZipArchive(zip: JSZip): void {
    const entries = Object.values(zip.files);

    if (entries.length > EPUB_IMPORT_LIMITS.maxZipEntries) {
        throw new EpubImportError(`EPUB ZIP contains too many entries: ${entries.length}. Maximum allowed: ${EPUB_IMPORT_LIMITS.maxZipEntries}.`);
    }

    for (const entry of entries) {
        normalizeZipPath(entry.name);
    }
}

export async function readContainerOpfPath(zip: JSZip): Promise<string> {
    const containerXml = await readZipText(zip, "META-INF/container.xml");
    const match = /<rootfile[^>]+full-path=["']([^"']+)["'][^>]*>/i.exec(containerXml);

    if (match === null) {
        throw new EpubImportError("EPUB container.xml does not contain OPF rootfile path.");
    }

    return normalizeZipPath(match[1]);
}

export async function readZipText(zip: JSZip, path: string, maxBytes = EPUB_IMPORT_LIMITS.maxXmlTextBytes): Promise<string> {
    const normalizedPath = normalizeZipPath(path);
    const file = zip.file(normalizedPath);

    if (file === null) {
        throw new EpubImportError(`EPUB file not found: ${normalizedPath}`);
    }

    const knownUncompressedSize = getZipEntryUncompressedSize(file);
    if (knownUncompressedSize !== null && knownUncompressedSize > maxBytes) {
        throw new EpubImportError(`EPUB file is too large: ${normalizedPath}. Size: ${knownUncompressedSize} bytes. Maximum allowed: ${maxBytes} bytes.`);
    }

    const text = await file.async("text");
    const actualBytes = byteLength(text);

    if (actualBytes > maxBytes) {
        throw new EpubImportError(`EPUB file is too large after decompression: ${normalizedPath}. Size: ${actualBytes} bytes. Maximum allowed: ${maxBytes} bytes.`);
    }

    return text;
}

export function resolveZipPath(basePath: string, relativePath: string): string {
    if (isAbsoluteZipPath(relativePath)) {
        throw new EpubImportError(`EPUB path must be relative: ${relativePath}`);
    }

    const baseParts = normalizeZipPath(basePath).split("/");
    baseParts.pop();

    for (const part of splitSafeZipPath(relativePath)) {
        if (part === "" || part === ".") {
            continue;
        }

        if (part === "..") {
            if (baseParts.length === 0) {
                throw new EpubImportError(`EPUB path escapes archive root: ${relativePath}`);
            }

            baseParts.pop();
            continue;
        }

        baseParts.push(part);
    }

    return normalizeZipPath(baseParts.join("/"));
}

export function normalizeZipPath(path: string): string {
    const trimmedPath = path.trim();

    if (trimmedPath.length === 0) {
        throw new EpubImportError("EPUB path must not be empty.");
    }

    if (trimmedPath.includes("\\")) {
        throw new EpubImportError(`EPUB path contains unsupported backslash separator: ${path}`);
    }

    if (isAbsoluteZipPath(trimmedPath)) {
        throw new EpubImportError(`EPUB path must not be absolute: ${path}`);
    }

    const parts: string[] = [];
    for (const part of splitSafeZipPath(trimmedPath)) {
        if (part === "" || part === ".") {
            continue;
        }

        if (part === "..") {
            throw new EpubImportError(`EPUB path traversal is not allowed: ${path}`);
        }

        parts.push(part);
    }

    const normalizedPath = parts.join("/");
    if (normalizedPath.length === 0) {
        throw new EpubImportError(`EPUB path is invalid: ${path}`);
    }

    return normalizedPath;
}

function splitSafeZipPath(path: string): string[] {
    if (path.includes("\\")) {
        throw new EpubImportError(`EPUB path contains unsupported backslash separator: ${path}`);
    }

    return path.replace(/\/+/g, "/").split("/");
}

function isAbsoluteZipPath(path: string): boolean {
    return path.startsWith("/") || /^[a-zA-Z]:/.test(path);
}

function getZipEntryUncompressedSize(file: JSZip.JSZipObject): number | null {
    const value = (file as ZipEntryWithInternalSize)._data?.uncompressedSize;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
}
