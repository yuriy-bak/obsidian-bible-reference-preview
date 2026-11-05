/**
 * Import failures the user can act on. The message stays in English (logs, tests); the interface shows
 * the text of `code` in its language, with `params` filled in (see localizeImportErrorMessage).
 */
export type BibleImportErrorCode =
    | "fileTooLarge"
    | "noXhtml"
    | "noBookTable"
    | "noCanonBooks"
    | "noVerses"
    | "containerNoRootfile"
    | "fileNotFound"
    | "tooManyEntries"
    | "entryTooLarge"
    | "totalTooLarge"
    | "invalidPath"
    | "dbsNoData"
    | "dbsUnreadable"
    | "dataTooLarge";

export type BibleImportErrorParams = Record<string, string | number>;

export class EpubImportError extends Error {
    constructor(
        message: string,
        readonly code: BibleImportErrorCode | null = null,
        readonly params: BibleImportErrorParams = {},
    ) {
        super(message);
        this.name = "EpubImportError";
    }
}
