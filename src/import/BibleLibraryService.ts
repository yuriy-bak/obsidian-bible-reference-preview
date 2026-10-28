import { Notice, type App } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { I18nKey, I18nParams } from "../i18n/I18n";
import { isBibleImportAbortError } from "../infrastructure/sources/BibleImportCancellation";
import { ensureVaultDirectoryExists } from "../infrastructure/VaultPathUtils";
import type { TranslationService } from "../translations/TranslationService";
import { executePreparedEpubImport, prepareEpubImportSettings } from "./EpubImportFlow";
import {
    formatBibleIndexV2StatsNotice,
    formatEpubImportSuccessNotice,
    formatLastImportReportNotice,
    localizeImportErrorMessage,
} from "./EpubImportMessages";

/** Loading the Bible index, importing EPUB files and showing information about the index. */
export class BibleLibraryService {
    private readonly translate = (key: I18nKey, params?: I18nParams): string => this.context.t(key, params);
    private readonly createRepository = () => this.context.createRepository();

    constructor(
        private readonly context: PluginContext,
        private readonly translations: TranslationService,
    ) {}

    async loadBibleIndex(): Promise<void> {
        try {
            const repository = this.context.createRepository();
            await repository.load();
            this.context.setBibleData(repository.getIndex(), repository.getV2Data());
            const lastImportReport = await repository.readLastImportReport();
            await this.translations.syncTranslationOrder(lastImportReport?.translationId);
            this.translations.activateTopTranslation();
        } catch (error) {
            console.warn("Bible index load failed. Bible analysis will be disabled until a translation is imported.", error);
            this.context.setBibleData(null, null);
            this.context.setActiveTranslationId(null);
            this.context.updateBookMapping();
        }
    }

    async reloadBibleIndex(): Promise<void> {
        await this.loadBibleIndex();
        this.context.refreshSettingsTab();
        new Notice(this.context.t("notice.bibleIndexReloaded"), 5000);
    }

    openEpubFilePicker(hostEl?: HTMLElement): void {
        // Create the input in the document that received the click (the settings window may not be the main one)
        // and keep it attached until the dialog closes; a detached input can be dropped before `change` fires.
        const doc = hostEl?.doc ?? activeDocument;
        const fileInput = doc.body.createEl("input", {
            type: "file",
            cls: "bible-reference-preview-hidden-file-input",
            attr: { accept: ".epub,application/epub+zip" },
        });
        const removeFileInput = (): void => fileInput.remove();
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            removeFileInput();
            if (file !== undefined) {
                void this.importEpubFile(file);
            }
        });
        fileInput.addEventListener("cancel", removeFileInput);
        fileInput.click();
    }

    async importEpubFile(file: File): Promise<void> {
        try {
            const preparedImport = await prepareEpubImportSettings({
                app: this.context.app,
                file,
                locale: this.context.settings.interfaceLanguage,
                translate: this.translate,
                createRepository: this.createRepository,
            });

            if (preparedImport === null) {
                return;
            }

            const result = await executePreparedEpubImport({
                app: this.context.app,
                fileName: file.name,
                preparedImport,
                translate: this.translate,
                createRepository: this.createRepository,
                onImported: async (repository, importResult) => {
                    this.context.setBibleData(repository.getIndex(), repository.getV2Data());
                    await this.translations.promoteTranslationToTop(importResult.translationId);
                    this.translations.activateTopTranslation();
                    this.context.refreshSettingsTab();
                },
            });

            if (result.warnings.length > 0) {
                console.warn("EPUB import warnings", result.warnings);
            }
            new Notice(formatEpubImportSuccessNotice(result, this.translate), 15000);
        } catch (error) {
            if (isBibleImportAbortError(error)) {
                new Notice(this.context.t("notice.importCancelled"), 5000);
                return;
            }
            console.error("EPUB import failed", error);
            new Notice(this.context.t("notice.importFailed", {
                message: localizeImportErrorMessage(error, this.translate),
            }), 15000);
        }
    }

    async openBibleIndexFolder(): Promise<void> {
        const app = this.context.app;
        const directoryPath = this.context.dataDirectoryPath;
        await ensureVaultDirectoryExists(app.vault.adapter, directoryPath);

        if (this.context.isMobile) {
            new Notice([
                this.context.t("notice.mobileFolderUnavailable"),
                this.context.t("notice.indexFolder", { directoryPath }),
            ].join("\n"), 12000);
            return;
        }

        const appWithShowInFolder = app as App & { showInFolder?: (path: string) => void };
        if (typeof appWithShowInFolder.showInFolder === "function") {
            appWithShowInFolder.showInFolder(directoryPath);
            return;
        }

        new Notice(this.context.t("notice.indexFolder", { directoryPath }), 10000);
    }

    async showBibleIndexStats(): Promise<void> {
        const repository = this.context.createRepository();
        await repository.load();
        const report = await repository.readLastImportReport();

        if (report !== null) {
            new Notice(formatLastImportReportNotice(report, this.translate), 15000);
            return;
        }

        const activeV2Data = this.context.v2Data;
        if (activeV2Data !== null) {
            const translationCount = Object.keys(activeV2Data.translations).length;
            new Notice(formatBibleIndexV2StatsNotice(
                translationCount,
                this.context.activeTranslationId ?? this.context.t("notice.none"),
                this.translate,
            ), 10000);
            return;
        }

        new Notice(this.context.t("notice.noImportedTranslations"), 5000);
    }
}
