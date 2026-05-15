import JSZip from "jszip";
import { EpubImportError } from "./EpubImportError";

export async function readContainerOpfPath(zip: JSZip): Promise<string> {
    const containerXml = await readZipText(zip, "META-INF/container.xml");
    const match = /<rootfile[^>]+full-path=["']([^"']+)["'][^>]*>/i.exec(containerXml);

    if (match === null) {
        throw new EpubImportError("EPUB container.xml does not contain OPF rootfile path.");
    }

    return normalizeZipPath(match[1]);
}

export async function readZipText(zip: JSZip, path: string): Promise<string> {
    const normalizedPath = normalizeZipPath(path);
    const file = zip.file(normalizedPath);

    if (file === null) {
        throw new EpubImportError(`EPUB file not found: ${normalizedPath}`);
    }

    return file.async("text");
}

export function resolveZipPath(basePath: string, relativePath: string): string {
    if (relativePath.startsWith("/")) {
        return normalizeZipPath(relativePath.slice(1));
    }

    const baseParts = normalizeZipPath(basePath).split("/");
    baseParts.pop();

    for (const part of relativePath.split("/")) {
        if (part === "" || part === ".") {
            continue;
        }

        if (part === "..") {
            baseParts.pop();
            continue;
        }

        baseParts.push(part);
    }

    return normalizeZipPath(baseParts.join("/"));
}

export function normalizeZipPath(path: string): string {
    return path.split("\\").join("/").replace(/\/+/g, "/");
}
