import { BibleSource } from "./BibleSource";
import { JwEpubBibleSource } from "./jw-epub/JwEpubBibleSource";

export function createBibleSources(): BibleSource[] {
    return [new JwEpubBibleSource()];
}

export function selectBibleSource(sources: BibleSource[], fileName: string, content: ArrayBuffer): BibleSource {
    const source = sources.find((candidate) => candidate.canHandle(fileName, content));

    if (source === undefined) {
        throw new Error(`Unsupported Bible file format: ${fileName}`);
    }

    return source;
}
