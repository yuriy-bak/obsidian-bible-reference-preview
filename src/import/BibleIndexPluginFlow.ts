import { Notice, type App } from "obsidian";
import type { BibleIndex } from "../infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { isBibleImportAbortError } from "../infrastructure/sources/BibleImportCancellation";
import type { BiblePluginLocale } from "../i18n/I18n";
import type { EpubFileValidationTranslate } from "./EpubFileValidation";
import { executePreparedEpubImport, prepareEpubImportSettings } from "./EpubImportFlow";
import { formatEpubImportSuccessNotice, localizeImportErrorMessage, type EpubImportTranslate } from "./EpubImportMessages";
import { openBibleIndexFolder as openBibleIndexFolderFlow, showBibleIndexStats as showBibleIndexStatsFlow } from "./BibleIndexInfoFlow";

export type BibleIndexPluginFlowInput = {
    app: App;
    emptyBibleIndex: BibleIndex;
    interfaceLanguage: BiblePluginLocale;
    isMobile: boolean;
    getActiveTranslationId: () => string | null;
    getActiveV2Data: () => BibleIndexV2Data | null;
    getBibleIndexDataDirectoryPath: () => string;
    createRepository: () => ObsidianBibleIndexV2Repository;
    setBibleIndex: (bibleIndex: BibleIndex) => void;
    setActiveV2Data: (v2Data: BibleIndexV2Data | null) => void;
    setActiveTranslationId: (activeTranslationId: string | null) => void;
    syncTranslationOrder: (v2Data: BibleIndexV2Data | null, preferredTranslationId?: string) => Promise<void>;
    selectActiveTranslationId: (v2Data: BibleIndexV2Data | null) => string | null;
    updateBookMapping: (v2Data: BibleIndexV2Data | null) => void;
    promoteTranslationToTop: (translationId: string) => Promise<void>;
    refreshSettings: () => void;
    translate: EpubImportTranslate & EpubFileValidationTranslate;
};

export async function loadBibleIndex(input: BibleIndexPluginFlowInput): Promise<void> {
    try {
        const repository = input.createRepository();
        await repository.load();
        input.setBibleIndex(repository.getIndex());
        const activeV2Data = repository.getV2Data();
        input.setActiveV2Data(activeV2Data);
        const lastImportReport = await repository.readLastImportReport();
        await input.syncTranslationOrder(activeV2Data, lastImportReport?.translationId);
        input.setActiveTranslationId(input.selectActiveTranslationId(activeV2Data));
        input.updateBookMapping(activeV2Data);
    } catch (error) {
        console.warn("Bible index load failed. Bible analysis will be disabled until a translation is imported.", error);
        input.setBibleIndex(input.emptyBibleIndex);
        input.setActiveV2Data(null);
        input.setActiveTranslationId(null);
        input.updateBookMapping(null);
    }
}

export async function reloadBibleIndex(input: BibleIndexPluginFlowInput): Promise<void> {
    await loadBibleIndex(input);
    input.refreshSettings();
    new Notice(input.translate("notice.bibleIndexReloaded"), 5000);
}

export function openEpubFilePicker(input: BibleIndexPluginFlowInput, hostEl?: HTMLElement): void {
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
            void importEpubFile(input, file);
        }
    });
    fileInput.addEventListener("cancel", removeFileInput);
    fileInput.click();
}

export async function importEpubFile(input: BibleIndexPluginFlowInput, file: File): Promise<void> {
    try {
        const preparedImport = await prepareEpubImportSettings({
            app: input.app,
            file,
            locale: input.interfaceLanguage,
            translate: input.translate,
            createRepository: input.createRepository,
        });

        if (preparedImport === null) {
            return;
        }

        const result = await executePreparedEpubImport({
            app: input.app,
            fileName: file.name,
            preparedImport,
            translate: input.translate,
            createRepository: input.createRepository,
            onImported: async (repository, importResult) => {
                input.setBibleIndex(repository.getIndex());
                const activeV2Data = repository.getV2Data();
                input.setActiveV2Data(activeV2Data);
                await input.promoteTranslationToTop(importResult.translationId);
                input.setActiveTranslationId(input.selectActiveTranslationId(activeV2Data));
                input.updateBookMapping(activeV2Data);
                input.refreshSettings();
            },
        });

        if (result.warnings.length > 0) {
            console.warn("EPUB import warnings", result.warnings);
        }
        new Notice(formatEpubImportSuccessNotice(result, input.translate), 15000);
    } catch (error) {
        if (isBibleImportAbortError(error)) {
            new Notice(input.translate("notice.importCancelled"), 5000);
            return;
        }
        console.error("EPUB import failed", error);
        new Notice(input.translate("notice.importFailed", {
            message: localizeImportErrorMessage(error, input.translate),
        }), 15000);
    }
}

export async function openBibleIndexFolder(input: BibleIndexPluginFlowInput): Promise<void> {
    await openBibleIndexFolderFlow({
        app: input.app,
        directoryPath: input.getBibleIndexDataDirectoryPath(),
        isMobile: input.isMobile,
        translate: input.translate,
    });
}

export async function showBibleIndexStats(input: BibleIndexPluginFlowInput): Promise<void> {
    await showBibleIndexStatsFlow({
        activeV2Data: input.getActiveV2Data(),
        activeTranslationIdText: input.getActiveTranslationId() ?? input.translate("notice.none"),
        createRepository: input.createRepository,
        translate: input.translate,
    });
}
