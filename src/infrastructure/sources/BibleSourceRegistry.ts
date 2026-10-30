import { BibleSource, BibleSourceFile } from "./BibleSource";
import { DbsHtmlBibleSource } from "./dbs-html/DbsHtmlBibleSource";
import { EbibleEpubBibleSource } from "./ebible-epub/EbibleEpubBibleSource";
import { JwEpubBibleSource } from "./jw-epub/JwEpubBibleSource";

/**
 * The supported Bible file formats. The order is the priority: a file goes to the first source that
 * recognizes it, so a narrower format goes before a more general one that would also accept its files.
 */
export function createBibleSources(): BibleSource[] {
    return [new JwEpubBibleSource(), new EbibleEpubBibleSource(), new DbsHtmlBibleSource()];
}

export class UnsupportedBibleFileError extends Error {
    constructor(readonly fileName: string, readonly sourceLabels: string[]) {
        super(`Unsupported Bible file format: ${fileName}`);
        this.name = "UnsupportedBibleFileError";
    }
}

export async function selectBibleSource(sources: BibleSource[], file: BibleSourceFile): Promise<BibleSource> {
    for (const source of sources) {
        if (await source.canHandle(file)) {
            return source;
        }
    }
    throw new UnsupportedBibleFileError(file.fileName, sources.map((source) => source.label));
}

/** The `accept` attribute of the file picker: every extension and media type of every source. */
export function getBibleFilePickerAccept(sources: BibleSource[]): string {
    const types = sources.flatMap((source) => [...source.fileTypes.extensions, ...source.fileTypes.mimeTypes]);
    return [...new Set(types)].join(",");
}

export function getMaxBibleFileBytes(sources: BibleSource[]): number {
    return Math.max(0, ...sources.map((source) => source.maxFileBytes));
}
