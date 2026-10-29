import type { BibleImportProgress, BibleImportReport, BibleImportResult } from "../infrastructure/sources/BibleSource";
import type { I18nKey } from "../i18n/I18n";
import { UnsupportedBibleFileError } from "../infrastructure/sources/BibleSourceRegistry";

export type BibleImportTranslate = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;

export function formatBibleImportProgress(progress: BibleImportProgress, translate: BibleImportTranslate): string {
    return translate("notice.importProgress", {
        stage: translate(`notice.importProgress.stage.${progress.stage}`),
        processed: progress.processedCount,
        total: progress.totalCount,
    });
}

export function formatBibleImportSuccessNotice(
    result: BibleImportResult,
    translate: BibleImportTranslate,
): string {
    const warningsText = result.warnings.length === 0 ? "" : `\n${translate("notice.importWarnings", { count: result.warnings.length })}`;
    return [
        translate("notice.bibleImported"),
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

export function formatLastImportReportNotice(
    report: BibleImportReport,
    translate: BibleImportTranslate,
): string {
    return [
        translate("notice.lastImport"),
        translate("import.summary.translation", { translationName: report.translationName }),
        translate("import.summary.language", { language: report.language }),
        translate("import.summary.books", { count: report.books }),
        translate("import.summary.chapters", { count: report.chapters }),
        translate("import.summary.verses", { count: report.verses }),
        translate("import.summary.footnotes", { count: report.footnotes }),
        translate("import.summary.metadataSize", { size: formatKilobytes(report.metadataBytes) }),
        translate("import.summary.booksSize", { size: formatMegabytes(report.booksBytes) }),
    ].join("\n");
}

export function formatBibleIndexV2StatsNotice(
    translationCount: number,
    activeTranslationIdText: string,
    translate: BibleImportTranslate,
): string {
    return [
        translate("notice.bibleIndexV2"),
        translate("notice.translationCount", { count: translationCount }),
        translate("notice.activeTranslationId", { translationId: activeTranslationIdText }),
    ].join("\n");
}

export function localizeImportErrorMessage(error: unknown, translate: BibleImportTranslate): string {
    if (error instanceof UnsupportedBibleFileError) {
        return [
            translate("import.error.unsupportedFormat"),
            "",
            ...error.sourceLabels.map((label) => `• ${label}`),
        ].join("\n");
    }
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

function formatKilobytes(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatMegabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
