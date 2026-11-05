import { Notice, type App } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { I18nKey, I18nParams } from "../i18n/I18n";
import { EpubImportError } from "../infrastructure/epub/EpubImportError";
import { isBibleImportAbortError } from "../infrastructure/sources/BibleImportCancellation";
import { ensureVaultDirectoryExists } from "../infrastructure/VaultPathUtils";
import type { TranslationService } from "../translations/TranslationService";
import { createBibleSources, getBibleFilePickerAccept } from "../infrastructure/sources/BibleSourceRegistry";
import { executePreparedBibleImport, prepareBibleImport } from "./BibleImportFlow";
import type { BackgroundTaskProgress } from "../ui/BackgroundTaskProgress";
import { detectMissingVersifications } from "./detectMissingVersifications";
import { getExampleReference } from "../onboarding/GettingStarted";
import {
    formatBibleIndexStatsNotice,
    formatBibleImportSuccessNotice,
    formatLastImportReportNotice,
    localizeImportErrorMessage,
} from "./BibleImportMessages";

/** Loading the Bible index, importing Bible files and showing information about the index. */
export class BibleLibraryService {
    private readonly translate = (key: I18nKey, params?: I18nParams): string => this.context.t(key, params);
    private readonly createRepository = () => this.context.createRepository();
    // From the file choice to the end of the import; one import at a time.
    private importRunning = false;
    private importProgress: BackgroundTaskProgress | null = null;
    private unloaded = false;

    constructor(
        private readonly context: PluginContext,
        private readonly translations: TranslationService,
    ) {}

    async loadBibleIndex(): Promise<void> {
        try {
            const repository = this.context.createRepository();
            await repository.load();
            this.context.setBibleData(repository.getIndex(), repository.getIndexData());
            const lastImportReport = await repository.readLastImportReport();
            await this.translations.syncTranslationOrder(lastImportReport?.translationId);
            this.translations.activateTopTranslation();
            void this.updateMissingVersifications();
        } catch (error) {
            console.warn("Bible index load failed. Bible analysis will be disabled until a translation is imported.", error);
            if (error instanceof EpubImportError && error.code === "indexDamaged") {
                new Notice(localizeImportErrorMessage(error, this.translate), 0);
            }
            this.context.setBibleData(null, null);
            this.context.setActiveTranslationId(null);
            this.context.updateBookMapping();
        }
    }

    // Runs in the background after loading; skips publishing its result if an import or a deletion
    // replaced the index meanwhile (the next load repeats the detection then).
    private async updateMissingVersifications(): Promise<void> {
        const loadedIndexData = this.context.indexData;
        try {
            const repository = this.context.createRepository();
            await repository.load();
            if (await detectMissingVersifications(repository) && this.context.indexData === loadedIndexData) {
                this.context.setBibleData(repository.getIndex(), repository.getIndexData());
            }
        } catch (error) {
            console.warn("Versification detection for imported translations failed.", error);
        }
    }

    async reloadBibleIndex(): Promise<void> {
        await this.loadBibleIndex();
        this.context.refreshSettingsTab();
        new Notice(this.context.t("notice.bibleIndexReloaded"), 5000);
    }

    /** The import running now, for the settings status row; null when none runs. */
    getImportProgress(): BackgroundTaskProgress | null {
        return this.importProgress;
    }

    /** On unload: stops a running import before it writes anything. */
    cancelImportOnUnload(): void {
        this.unloaded = true;
        this.importProgress?.cancel();
    }

    openBibleFilePicker(hostEl?: HTMLElement): void {
        if (this.showImportAlreadyRunning()) {
            return;
        }
        // Create the input in the document that received the click (the settings window may not be the main one)
        // and keep it attached until the dialog closes; a detached input can be dropped before `change` fires.
        const doc = hostEl?.doc ?? activeDocument;
        const fileInput = doc.body.createEl("input", {
            type: "file",
            cls: "bible-reference-preview-hidden-file-input",
            attr: { accept: getBibleFilePickerAccept(createBibleSources()) },
        });
        const removeFileInput = (): void => fileInput.remove();
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            removeFileInput();
            if (file !== undefined) {
                void this.importBibleFile(file);
            }
        });
        fileInput.addEventListener("cancel", removeFileInput);
        fileInput.click();
    }

    async importBibleFile(file: File): Promise<void> {
        if (this.showImportAlreadyRunning()) {
            return;
        }
        this.importRunning = true;
        try {
            await this.runImport(file);
        } finally {
            this.importRunning = false;
            this.importProgress = null;
            this.context.setImportingTranslationId(null);
            if (!this.unloaded) {
                this.context.refreshSettingsTab();
            }
        }
    }

    private showImportAlreadyRunning(): boolean {
        if (!this.importRunning) {
            return false;
        }
        new Notice(this.context.t("notice.importAlreadyRunning"), 4000);
        this.importProgress?.showNotice();
        return true;
    }

    private async runImport(file: File): Promise<void> {
        const isFirstTranslation = !this.context.hasImportedTranslations();
        try {
            const preparedImport = await prepareBibleImport({
                app: this.context.app,
                file,
                locale: this.context.settings.interfaceLanguage,
                translate: this.translate,
                createRepository: this.createRepository,
            });

            if (preparedImport === null) {
                return;
            }

            const result = await executePreparedBibleImport({
                app: this.context.app,
                fileName: file.name,
                preparedImport,
                translate: this.translate,
                createRepository: this.createRepository,
                onStarted: (progress) => {
                    this.importProgress = progress;
                    this.context.setImportingTranslationId(preparedImport.importSettings.translationId);
                    this.context.refreshSettingsTab();
                },
                onImported: async (repository, importResult) => {
                    this.context.setBibleData(repository.getIndex(), repository.getIndexData());
                    // A new translation goes to the end of the list: the main one (and the numbering of the
                    // references in the notes) stays the same. The first import becomes the main translation.
                    await this.translations.syncTranslationOrder(importResult.translationId);
                    this.translations.activateTopTranslation();
                    this.context.refreshSettingsTab();
                },
            });

            if (result.warnings.length > 0) {
                console.warn("Bible import warnings", result.warnings);
            }
            // After the first translation a new user learns what to type, in that translation's book names.
            const exampleReference = isFirstTranslation
                ? getExampleReference(result.books, (text) => this.context.parseMatches(text).some((match) => match.text === text))
                : null;
            const exampleText = exampleReference === null ? "" : `\n\n${this.context.t("notice.importExample", { reference: exampleReference })}`;
            new Notice(formatBibleImportSuccessNotice(result, this.translate) + exampleText, 15000);
        } catch (error) {
            if (isBibleImportAbortError(error)) {
                if (!this.unloaded) {
                    new Notice(this.context.t("notice.importCancelled"), 5000);
                }
                return;
            }
            console.error("Bible import failed", error);
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

        const activeIndexData = this.context.indexData;
        if (activeIndexData !== null) {
            const translationCount = Object.keys(activeIndexData.translations).length;
            new Notice(formatBibleIndexStatsNotice(
                translationCount,
                this.context.activeTranslationId ?? this.context.t("notice.none"),
                this.translate,
            ), 10000);
            return;
        }

        this.context.showNoImportedTranslationsNotice();
    }
}
