import { Notice, type App } from "obsidian";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import type { EpubBibleImportReport } from "../infrastructure/EpubBibleImporter";
import { ensureVaultDirectoryExists } from "../infrastructure/VaultPathUtils";
import { formatBibleIndexV2StatsNotice, formatLastImportReportNotice, type EpubImportTranslate } from "./EpubImportMessages";

export type BibleIndexInfoRepository = {
    load(): Promise<void>;
    readLastImportReport(): Promise<EpubBibleImportReport | null>;
};

export type OpenBibleIndexFolderFlowInput = {
    app: App;
    directoryPath: string;
    isMobile: boolean;
    translate: EpubImportTranslate;
};

export type ShowBibleIndexStatsFlowInput = {
    activeV2Data: BibleIndexV2Data | null;
    activeTranslationIdText: string;
    createRepository(): BibleIndexInfoRepository;
    translate: EpubImportTranslate;
};

export async function openBibleIndexFolder(input: OpenBibleIndexFolderFlowInput): Promise<void> {
    await ensureVaultDirectoryExists(input.app.vault.adapter, input.directoryPath);

    if (input.isMobile) {
        new Notice([
            input.translate("notice.mobileFolderUnavailable"),
            input.translate("notice.indexFolder", { directoryPath: input.directoryPath }),
        ].join("\n"), 12000);
        return;
    }

    const appWithShowInFolder = input.app as App & { showInFolder?: (path: string) => void };
    if (typeof appWithShowInFolder.showInFolder === "function") {
        appWithShowInFolder.showInFolder(input.directoryPath);
        return;
    }

    new Notice(input.translate("notice.indexFolder", { directoryPath: input.directoryPath }), 10000);
}

export async function showBibleIndexStats(input: ShowBibleIndexStatsFlowInput): Promise<void> {
    const repository = input.createRepository();
    await repository.load();
    const report = await repository.readLastImportReport();

    if (report !== null) {
        new Notice(formatLastImportReportNotice(report, input.translate), 15000);
        return;
    }

    if (input.activeV2Data !== null) {
        const translationCount = Object.keys(input.activeV2Data.translations).length;
        new Notice(formatBibleIndexV2StatsNotice(
            translationCount,
            input.activeTranslationIdText,
            input.translate,
        ), 10000);
        return;
    }

    new Notice(input.translate("notice.noImportedTranslations"), 5000);
}
