import { BibleImportOptions } from "./BibleSource";

const BIBLE_IMPORT_ABORT_ERROR_NAME = "AbortError";

export function isBibleImportAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === BIBLE_IMPORT_ABORT_ERROR_NAME;
}

export function assertBibleImportNotAborted(options: BibleImportOptions): void {
    if (options.signal?.aborted !== true) {
        return;
    }
    const error = new Error("EPUB import was cancelled.");
    error.name = BIBLE_IMPORT_ABORT_ERROR_NAME;
    throw error;
}

export async function yieldBibleImportIfNeeded(processedCount: number, everyCount: number): Promise<void> {
    if (processedCount % everyCount !== 0) {
        return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

/** Yields to the UI once the current slice of work has run longer than `sliceMs`. */
export function createBibleImportTimeSlicer(sliceMs = 30): () => Promise<void> {
    let sliceStartedAt = Date.now();

    return async () => {
        if (Date.now() - sliceStartedAt < sliceMs) {
            return;
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        sliceStartedAt = Date.now();
    };
}
