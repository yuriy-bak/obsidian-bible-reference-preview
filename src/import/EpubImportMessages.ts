import type { EpubBibleImportProgress } from "../infrastructure/EpubBibleImporter";
import type { I18nKey } from "../i18n/I18n";

export type EpubImportTranslate = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;

export function formatEpubImportProgress(progress: EpubBibleImportProgress, translate: EpubImportTranslate): string {
    return translate("notice.importProgress", {
        stage: translate(`notice.importProgress.stage.${progress.stage}` as I18nKey),
        processed: progress.processedCount,
        total: progress.totalCount,
    });
}

export function localizeImportErrorMessage(error: unknown, translate: EpubImportTranslate): string {
    const message = getErrorMessage(error);
    if (message === "EPUB does not contain XHTML documents.") {
        return translate("import.error.noXhtml");
    }
    if (message === "EPUB complete 66-book table was not found. Import cannot continue without a validated book table.") {
        return translate("import.error.noBookTable");
    }
    if (message === "EPUB import completed without extracted verses.") {
        return translate("import.error.noVerses");
    }
    if (message === "EPUB container.xml does not contain OPF rootfile path.") {
        return translate("import.error.containerNoRootfile");
    }
    const fileNotFoundMatch = /^EPUB file not found: (.+)$/.exec(message);
    if (fileNotFoundMatch !== null) {
        return translate("import.error.fileNotFound", { path: fileNotFoundMatch[1] });
    }
    return message;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
