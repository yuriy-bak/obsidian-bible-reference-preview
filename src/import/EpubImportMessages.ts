import type { EpubBibleImportProgress, EpubBibleImportResult } from "../infrastructure/EpubBibleImporter";
import type { I18nKey } from "../i18n/I18n";

export type EpubImportTranslate = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;
export type EpubImportSizeFormatter = (bytes: number) => string;

export function formatEpubImportProgress(progress: EpubBibleImportProgress, translate: EpubImportTranslate): string {
    return translate("notice.importProgress", {
        stage: translate(`notice.importProgress.stage.${progress.stage}` as I18nKey),
        processed: progress.processedCount,
        total: progress.totalCount,
    });
}

export function formatEpubImportSuccessNotice(
    result: EpubBibleImportResult,
    translate: EpubImportTranslate,
    formatKilobytes: EpubImportSizeFormatter,
    formatMegabytes: EpubImportSizeFormatter,
): string {
    const warningsText = result.warnings.length === 0 ? "" : `\n${translate("notice.importWarnings", { count: result.warnings.length })}`;
    return [
        translate("notice.epubImported"),
        translate("import.summary.translation", { translationName: result.translationName }),
        translate("import.summary.language", { language: result.language }),
        translate("import.summary.books", { count: result.report.books }),
        translate("import.summary.chapters", { count: result.report.chapters }),
        translate("import.summary.verses", { count: result.report.verses }),
        translate("import.summary.footnotes", { count: result.report.footnotes }),
        translate("import.summary.metadataSize", { size: formatKilobytes(result.report.metadataBytes) }),
        translate("import.summary.booksSize", { size: formatMegabytes(result.report.booksBytes) }),
    ].join("\n") + warningsText;
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
