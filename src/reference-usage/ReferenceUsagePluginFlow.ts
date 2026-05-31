import { Notice, type App } from "obsidian";
import type { BiblePreviewReferenceBlock } from "../application/formatBibleTexts";
import type { BiblePluginLocale, I18nKey } from "../i18n/I18n";
import type { BibleReferenceMatch } from "../parsing/BibleReferenceParser";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";
import { ReferenceUsageController } from "./ReferenceUsageController";
import {
    REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES,
    REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
    ReferenceUsageIndexService,
    type ReferenceUsageIndexServiceOptions,
} from "./ReferenceUsageIndexService";
import type { ReferenceUsagePaneFlowInput } from "./ReferenceUsagePaneFlow";
import { showReferenceUsageResultsInPanel } from "./ReferenceUsagePaneFlow";
import { createReferenceUsagePaneFlowInput as createReferenceUsagePaneFlowInputFromFactory } from "./ReferenceUsagePaneFlowInputFactory";
import type { ReferenceUsagePreviewBlockFlowInput } from "./ReferenceUsagePreviewBlockFlow";
import type { ReferenceUsageUnderCursorFlowInput } from "./ReferenceUsageUnderCursorFlow";
import { createReferenceUsageUnderCursorFlowInput as createReferenceUsageUnderCursorFlowInputFromFactory } from "./ReferenceUsageUnderCursorFlowInputFactory";

export type ReferenceUsagePluginTranslate = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;

export type ReferenceUsagePluginFlowInput = {
    app: App;
    interfaceLanguage: BiblePluginLocale;
    previewViewType: string;
    previewPanelSide: BiblePreviewPanelSide;
    isMobile: boolean;
    getBibleIndexDataDirectoryPath(): string;
    parseMatches(text: string): BibleReferenceMatch[];
    getReferenceUsageExcludedFolders(): string[];
    isIndexingEnabled(): boolean;
    isAutoUpdateEnabled(): boolean;
    hasImportedTranslations(): boolean;
    getReferenceUnderCursor: ReferenceUsageUnderCursorFlowInput["getReferenceUnderCursor"];
    getReferenceUsageIndexService(): ReferenceUsageIndexService;
    getReferenceUsageController(): ReferenceUsageController;
    registerEvent(eventRef: ReturnType<App["vault"]["on"]>): void;
    registerDisposer(disposer: () => void): void;
    translate: ReferenceUsagePluginTranslate;
    refreshSettings(): void;
    waitForNextAnimationFrame(): Promise<void>;
    setSuppressPreviewActiveLeafChange(value: boolean): void;
};

export function getReferenceUsageIndexServiceOptions(isMobile: boolean): ReferenceUsageIndexServiceOptions {
    return isMobile
        ? {
            maxMarkdownFileSizeBytes: REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
            buildYieldEveryFiles: REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES,
        }
        : {};
}

export function createReferenceUsageIndexService(input: ReferenceUsagePluginFlowInput): ReferenceUsageIndexService {
    return new ReferenceUsageIndexService(
        input.app,
        input.getBibleIndexDataDirectoryPath,
        input.parseMatches,
        input.getReferenceUsageExcludedFolders,
        getReferenceUsageIndexServiceOptions(input.isMobile),
    );
}

export async function loadReferenceUsageIndexService(input: ReferenceUsagePluginFlowInput): Promise<ReferenceUsageIndexService> {
    const service = createReferenceUsageIndexService(input);
    try {
        await service.load();
    } catch (error) {
        console.warn("Bible reference usage index load failed", error);
        new Notice(input.translate("notice.referenceUsageIndexLoadFailed"), 5000);
    }
    return service;
}

export function shouldAutoProcessReferenceUsageIndexEvents(input: ReferenceUsagePluginFlowInput): boolean {
    return input.isIndexingEnabled() && input.isAutoUpdateEnabled() && input.hasImportedTranslations();
}

export function createReferenceUsageController(input: ReferenceUsagePluginFlowInput): ReferenceUsageController {
    return new ReferenceUsageController({
        app: input.app,
        getService: input.getReferenceUsageIndexService,
        isIndexingEnabled: input.isIndexingEnabled,
        shouldAutoProcessEvents: () => shouldAutoProcessReferenceUsageIndexEvents(input),
        hasImportedTranslations: input.hasImportedTranslations,
        translate: input.translate,
        refreshSettings: input.refreshSettings,
    });
}

export function createReferenceUsagePaneFlowInput(input: ReferenceUsagePluginFlowInput): ReferenceUsagePaneFlowInput {
    return createReferenceUsagePaneFlowInputFromFactory({
        app: input.app,
        interfaceLanguage: input.interfaceLanguage,
        previewViewType: input.previewViewType,
        previewPanelSide: input.previewPanelSide,
        isMobile: input.isMobile,
        waitForNextAnimationFrame: input.waitForNextAnimationFrame,
        setSuppressPreviewActiveLeafChange: input.setSuppressPreviewActiveLeafChange,
    });
}

export function createReferenceUsageUnderCursorFlowInput(input: ReferenceUsagePluginFlowInput): ReferenceUsageUnderCursorFlowInput {
    return createReferenceUsageUnderCursorFlowInputFromFactory({
        app: input.app,
        interfaceLanguage: input.interfaceLanguage,
        isIndexingEnabled: input.isIndexingEnabled,
        getReferenceUnderCursor: input.getReferenceUnderCursor,
        findUsages: (references) => input.getReferenceUsageIndexService().findUsages(references),
        showResultsInPanel: (titleText, results) => showReferenceUsageResultsInPanel(
            createReferenceUsagePaneFlowInput(input),
            titleText,
            results,
        ),
        waitForNextAnimationFrame: input.waitForNextAnimationFrame,
    });
}

export function createReferenceUsagePreviewBlockFlowInput(input: ReferenceUsagePluginFlowInput): ReferenceUsagePreviewBlockFlowInput {
    return {
        isIndexingEnabled: input.isIndexingEnabled,
        getIndexDisabledText: () => input.translate("notice.referenceUsageIndexDisabled"),
        findUsages: (references: BiblePreviewReferenceBlock["references"]) => input.getReferenceUsageIndexService().findUsages(references),
        formatTitle: (referenceText) => input.translate("modal.referenceUsages.title", { reference: referenceText }),
        createReferenceUsagePaneFlowInput: () => createReferenceUsagePaneFlowInput(input),
    };
}

export function registerReferenceUsageIndexEvents(input: ReferenceUsagePluginFlowInput): void {
    const controller = input.getReferenceUsageController();
    input.registerEvent(input.app.vault.on("create", (file) => controller.handleFileCreateOrModify(file)));
    input.registerEvent(input.app.vault.on("modify", (file) => controller.handleFileCreateOrModify(file)));
    input.registerEvent(input.app.vault.on("delete", (file) => controller.handleFileDelete(file)));
    input.registerEvent(input.app.vault.on("rename", (file, oldPath) => controller.handleFileRename(file, oldPath)));
    input.registerDisposer(() => controller.clearPendingUpdates());
}
