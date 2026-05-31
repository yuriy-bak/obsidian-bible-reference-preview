
import { App, Notice, Platform, Plugin, type MarkdownPostProcessorContext, type WorkspaceLeaf } from "obsidian";
import type { BibleIndex } from "./src/infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import type { BibleReference } from "./src/domain/BibleReference";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createBookMapping } from "./src/parsing/BookMapping";
import type { BiblePreviewContent, BiblePreviewReferenceBlock } from "./src/application/formatBibleTexts";
import { analyzeBiblePreviewParagraph as analyzeBiblePreviewParagraphFlow, rebuildBiblePreviewContent as rebuildBiblePreviewContentFlow, toggleBiblePreviewComparison as toggleBiblePreviewComparisonFlow, type BiblePreviewAnalyzerFlowInput } from "./src/application/BiblePreviewAnalyzerFlow";
import { isEpubImportAbortError } from "./src/infrastructure/epub/JsZipEpubBibleImporter";
import { ObsidianBibleIndexV2Repository } from "./src/infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "./src/infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { BiblePluginLocale, I18nKey, t } from "./src/i18n/I18n";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow } from "./src/ui/FloatingBiblePreviewWindow";
import { DEFAULT_BIBLE_REFERENCE_LINK_COLOR, DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR, normalizeBibleReferenceLinkColor, normalizeFloatingPreviewBackgroundColor } from "./src/ui/cssColorValidation";
import type { CssColorDialogInput } from "./src/ui/CssColorDialog";
import { getBibleReferenceLinkColorPickerValue as getBibleReferenceLinkColorPickerValueFlow, getFloatingPreviewBackgroundColorPickerValue as getFloatingPreviewBackgroundColorPickerValueFlow, openCssColorDialog as openCssColorDialogFlow, openFloatingPreviewBackgroundColorDialog as openFloatingPreviewBackgroundColorDialogFlow } from "./src/ui/ColorSettingsFlow";
import { BIBLE_PREVIEW_VIEW_TYPE, type BiblePreviewScrollCommand } from "./src/ui/BiblePreviewPaneView";
import { refreshBiblePreviewLocalizedLabels as refreshBiblePreviewLocalizedLabelsFlow } from "./src/ui/BiblePreviewLocalizedRefreshFlow";
import { handleBiblePreviewActiveLeafChange as handleBiblePreviewActiveLeafChangeFlow, handleBiblePreviewPanelEscapeKeydown as handleBiblePreviewPanelEscapeKeydownFlow } from "./src/ui/BiblePreviewPaneStateFlow";
import { closeBiblePreviewPane as closeBiblePreviewPaneFlow, createBiblePreviewPaneFlowInputFactoryInput as createBiblePreviewPaneFlowInputFactoryInputFlow, createBiblePreviewPaneStateFlowInput as createBiblePreviewPaneStateFlowInputFlow, createBiblePreviewPaneViewInput as createBiblePreviewPaneViewInputFlow, createFloatingBiblePreviewWindowInput as createFloatingBiblePreviewWindowInputFlow, hideFloatingBiblePreview as hideFloatingBiblePreviewFlow, isFloatingPreviewTarget as isFloatingPreviewTargetFlow, refreshFloatingPreviewLabels as refreshFloatingPreviewLabelsFlow, scrollBiblePreview as scrollBiblePreviewFlow, showBiblePreviewContent as showBiblePreviewContentFlow, showBiblePreviewInPanel as showBiblePreviewInPanelFlow, showFloatingBiblePreview as showFloatingBiblePreviewFlow, switchBiblePreviewToFloating as switchBiblePreviewToFloatingFlow, switchBiblePreviewToPanel as switchBiblePreviewToPanelFlow, type BiblePreviewPluginFlowInput } from "./src/ui/BiblePreviewPluginFlow";
import type { BiblePluginSettingTab } from "./src/ui/BiblePluginSettingTab";

import type { BibleReadingModePreviewController } from "./src/ui/BibleReadingModePreviewController";
import type { ReferenceUsageController } from "./src/reference-usage/ReferenceUsageController";
import { findReferenceUsagesUnderCursor as findReferenceUsagesUnderCursorFlow, openReferenceUsagesPanelUnderCursor as openReferenceUsagesPanelUnderCursorFlow } from "./src/reference-usage/ReferenceUsageUnderCursorFlow";
import type { ReferenceUsagePaneFlowInput } from "./src/reference-usage/ReferenceUsagePaneFlow";
import { showReferenceUsagesForPreviewBlock as showReferenceUsagesForPreviewBlockFlow } from "./src/reference-usage/ReferenceUsagePreviewBlockFlow";
import { createReferenceUsageController as createReferenceUsageControllerFlow, createReferenceUsageIndexService as createReferenceUsageIndexServiceFlow, createReferenceUsagePaneFlowInput as createReferenceUsagePaneFlowInputFlow, createReferenceUsagePreviewBlockFlowInput as createReferenceUsagePreviewBlockFlowInputFlow, createReferenceUsageUnderCursorFlowInput as createReferenceUsageUnderCursorFlowInputFlow, loadReferenceUsageIndexService as loadReferenceUsageIndexServiceFlow, type ReferenceUsagePluginFlowInput } from "./src/reference-usage/ReferenceUsagePluginFlow";
import { buildReferenceUsageIndex as buildReferenceUsageIndexFlow, clearReferenceUsageIndex as clearReferenceUsageIndexFlow, getReferenceUsageExcludedFoldersText as getReferenceUsageExcludedFoldersTextFlow, isReferenceUsageIndexingEnabled as isReferenceUsageIndexingEnabledFlow, rebuildReferenceUsageIndex as rebuildReferenceUsageIndexFlow, setReferenceUsageAutoUpdate as setReferenceUsageAutoUpdateFlow, setReferenceUsageExcludedFoldersText as setReferenceUsageExcludedFoldersTextFlow, setReferenceUsageIndexingEnabled as setReferenceUsageIndexingEnabledFlow, shouldAutoUpdateReferenceUsageIndex as shouldAutoUpdateReferenceUsageIndexFlow, showReferenceUsageIndexStats as showReferenceUsageIndexStatsFlow, type ReferenceUsageSettingsFlowInput } from "./src/reference-usage/ReferenceUsageSettingsFlow";
import type { ReferenceUsageIndexService } from "./src/reference-usage/ReferenceUsageIndexService";
import type { TranslationControllerState } from "./src/translations/TranslationController";
import { createTranslationControllerState as createTranslationControllerStateFlow, getPreviewComparisonTranslationOptions as getPreviewComparisonTranslationOptionsFlow, getTranslationSettingsItems as getTranslationSettingsItemsFlow, moveTranslation as moveTranslationFlow, promoteTranslationToTop as promoteTranslationToTopFlow, selectActiveTranslationId as selectActiveTranslationIdFlow, setComparisonTranslationEnabled as setComparisonTranslationEnabledFlow, setTranslationOrder as setTranslationOrderFlow, syncTranslationOrder as syncTranslationOrderFlow, type TranslationSettingsFlowInput } from "./src/translations/TranslationSettingsFlow";
import { getActiveTranslationDisplayName as getActiveTranslationDisplayNameFlow, getActiveTranslationPreviewTitle as getActiveTranslationPreviewTitleFlow, type TranslationDisplayFlowInput } from "./src/translations/TranslationDisplayFlow";
import { deleteImportedTranslation as deleteImportedTranslationFlow, type TranslationDeleteFlowInput } from "./src/translations/TranslationDeleteFlow";
import type { PreviewComparisonTranslationOption, TranslationSettingsItem } from "./src/translations/TranslationModels";
import { DEFAULT_SETTINGS, normalizePluginSettings, type BibleLinkOpenShortcut, type BiblePluginSettings, type BiblePreviewDisplayMode, type BiblePreviewPanelSide, type BiblePreviewTriggerMode } from "./src/settings/PluginSettings";
import { executePreparedEpubImport, prepareEpubImportSettings } from "./src/import/EpubImportFlow";
import { formatEpubImportSuccessNotice, localizeImportErrorMessage } from "./src/import/EpubImportMessages";
import { openBibleIndexFolder as openBibleIndexFolderFlow, showBibleIndexStats as showBibleIndexStatsFlow } from "./src/import/BibleIndexInfoFlow";
import { registerPluginActiveRibbonIcon, registerPluginCommands } from "./src/lifecycle/PluginCommandRegistration";
import { registerPluginViews } from "./src/lifecycle/PluginViewRegistration";
import { initializeFloatingPreviewWindow, initializeReadingModePreviewController } from "./src/lifecycle/PluginPreviewInitialization";
import { initializeSettingsTab, registerWorkspaceAndKeyboardHandlers } from "./src/lifecycle/PluginUiInitialization";
import { registerContentProcessingExtensions } from "./src/lifecycle/PluginContentRegistration";
import { processReadingModeBibleReferences as processReadingModeBibleReferenceLinks } from "./src/reading-mode/ReadingModeBibleReferenceProcessor";
import { findBibleReferenceMatchAtPosition as findEditorBibleReferenceMatchAtPosition, getCurrentParagraph as getCurrentEditorParagraph } from "./src/editor/EditorTextAnalysis";
import { getBibleReferenceMatchUnderCursorFromActiveEditor, type EditorReferenceUnderCursorInput } from "./src/editor/EditorReferenceUnderCursor";
import { clearEditorReferenceLinks, refreshEditorReferenceLinks } from "./src/editor/EditorReferenceLinkDecorationFlow";
import { createEditorCursorExtension } from "./src/editor/EditorCursorExtension";
import { createEditorCursorExtensionInput as createEditorCursorExtensionInputFlow, createEditorReferenceLinkDecorationFlowInput as createEditorReferenceLinkDecorationFlowInputFlow, type EditorPluginInputFactoryInput } from "./src/editor/EditorPluginInputFactory";
import { createEditorRuntimeState } from "./src/editor/EditorRuntimeState";
import { dispatchEditorViewNoopUpdate, findFocusedEditorPreviewController } from "./src/editor/EditorViewFocus";


const EMPTY_BIBLE_INDEX: BibleIndex = {
    async getBibleText() {
        return null;
    },
};


export default class BiblePlugin extends Plugin {
    private bookMapping = createBookMapping([]);
    private bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
    private bibleIndex = EMPTY_BIBLE_INDEX;
    private activeV2Data: BibleIndexV2Data | null = null;
    private activeTranslationId: string | null = null;
    private settings: BiblePluginSettings = { ...DEFAULT_SETTINGS };
    private settingsTab: BiblePluginSettingTab | null = null;
    private readingModePreviewController: BibleReadingModePreviewController | null = null;
    private floatingPreviewWindow: FloatingBiblePreviewWindow | null = null;
    private lastPanePreviewContent: BiblePreviewContent | null = null;
    private lastPanelEscapeTime = 0;
    private suppressPreviewActiveLeafChange = false;
    private biblePreviewPaneIsActiveInSideDock = false;
    private pluginActiveRibbonIconEl: HTMLElement | null = null;
    private referenceUsageIndexService: ReferenceUsageIndexService | null = null;
    private referenceUsageController: ReferenceUsageController | null = null;
    private readonly editorRuntimeState = createEditorRuntimeState();
    private readonly linkOpenShortcutKeydownHandler = (event: KeyboardEvent) => this.handleLinkOpenShortcutKeydown(event);
    private readonly panelEscapeKeydownHandler = (event: KeyboardEvent) => this.handlePanelEscapeKeydown(event);

    async onload() {
        await this.loadPluginSettings();
        await this.loadBibleIndex();
        await this.loadReferenceUsageIndex();
        this.initializeFloatingPreviewWindow();
        this.registerPluginViews();
        this.registerCommands();
        this.registerActiveRibbonIcon();
        this.initializeReadingModePreviewController();
        this.initializeSettingsTab();
        this.registerWorkspaceAndKeyboardHandlers();
        this.registerContentProcessingExtensions();
    }

    onunload() { }

    private initializeFloatingPreviewWindow(): void {
        this.floatingPreviewWindow = initializeFloatingPreviewWindow({
            createInput: () => this.createFloatingPreviewWindowInput(),
            registerDisposer: (disposer) => this.register(disposer),
        });
    }

    private registerPluginViews(): void {
        registerPluginViews({
            registerView: (viewType, viewCreator) => this.registerView(viewType, viewCreator),
            createBiblePreviewPaneViewInput: () => this.createBiblePreviewPaneViewInput(),
            createReferenceUsagePaneViewInput: () => this.createReferenceUsagePaneFlowInput().createReferenceUsagePaneViewInput(),
            getLastPanePreviewContent: () => this.lastPanePreviewContent,
        });
    }

    private registerCommands(): void {
        registerPluginCommands({
            addCommand: (command) => this.addCommand(command),
            translate: (key) => this.t(key),
            openEpubFilePicker: () => this.openEpubFilePicker(),
            reloadBibleIndex: () => this.reloadBibleIndex(),
            openBibleIndexFolder: () => this.openBibleIndexFolder(),
            showBibleIndexStats: () => this.showBibleIndexStats(),
            buildReferenceUsageIndex: () => this.buildReferenceUsageIndex(),
            rebuildReferenceUsageIndex: () => this.rebuildReferenceUsageIndex(),
            clearReferenceUsageIndex: () => this.clearReferenceUsageIndex(),
            showReferenceUsageIndexStats: () => this.showReferenceUsageIndexStats(),
            findReferenceUsagesUnderCursor: () => this.findReferenceUsagesUnderCursor(),
            openReferenceUsagesPanelUnderCursor: () => this.openReferenceUsagesPanelUnderCursor(),
            scrollBiblePreview: (command) => this.scrollBiblePreview(command),
            togglePluginActive: () => this.togglePluginActive(),
            openBibleReferenceUnderCursorFromActiveEditor: (showNotice) => this.openBibleReferenceUnderCursorFromActiveEditor(showNotice),
        });
    }

    private registerActiveRibbonIcon(): void {
        this.pluginActiveRibbonIconEl = registerPluginActiveRibbonIcon({
            addRibbonIcon: (icon, title, callback) => this.addRibbonIcon(icon, title, callback),
            title: this.getPluginActiveRibbonTitle(),
            togglePluginActive: () => this.togglePluginActive(),
        });
        this.updatePluginActiveRibbonIcon();
    }

    private initializeReadingModePreviewController(): void {
        this.readingModePreviewController = initializeReadingModePreviewController({
            showBiblePreviewContent: (content, anchor, options) => this.showBiblePreviewContent(content, anchor, options),
            shouldAutoOpenPreviewOnVerseChange: () => this.shouldAutoOpenPreviewOnVerseChange(),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            analyzeReferenceText: (referenceText) => this.analyzeReferenceTextAsync(referenceText),
            showNoImportedTranslationsNotice: () => new Notice(this.t("notice.noImportedTranslations"), 2500),
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            isFloatingPreviewTarget: (target) => this.isFloatingPreviewTarget(target),
            hideFloatingBiblePreview: () => this.hideFloatingBiblePreview(),
        }, (disposer) => this.register(disposer));
    }

    private initializeSettingsTab(): void {
        this.settingsTab = initializeSettingsTab({
            app: this.app,
            plugin: this,
            addSettingTab: (tab) => this.addSettingTab(tab),
        });
    }

    private registerWorkspaceAndKeyboardHandlers(): void {
        registerWorkspaceAndKeyboardHandlers({
            app: this.app,
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerDisposer: (disposer) => this.register(disposer),
            onActiveLeafChange: (activeLeaf) => this.handlePreviewActiveLeafChange(activeLeaf),
            panelEscapeKeydownHandler: (event) => this.panelEscapeKeydownHandler(event),
            registerGlobalLinkOpenShortcutHandler: () => this.registerGlobalLinkOpenShortcutHandler(),
        });
    }

    private registerContentProcessingExtensions(): void {
        registerContentProcessingExtensions({
            registerMarkdownPostProcessor: (postProcessor) => this.registerMarkdownPostProcessor(postProcessor),
            registerEditorExtension: (extension) => this.registerEditorExtension(extension),
            createCursorExtension: () => this.createCursorExtension(),
            processReadingModeBibleReferences: (element, context) => this.processReadingModeBibleReferences(element, context),
            registerReferenceUsageIndexEvents: () => this.registerReferenceUsageIndexEvents(),
        });
    }

    private async loadBibleIndex(): Promise<void> {
        try {
            const repository = this.createObsidianBibleIndexRepository();
            await repository.load();
            this.bibleIndex = repository.getIndex();
            this.activeV2Data = repository.getV2Data();
            const lastImportReport = await repository.readLastImportReport();
            await this.syncTranslationOrder(this.activeV2Data, lastImportReport?.translationId);
            this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
            this.updateBookMapping(this.activeV2Data);
        } catch (error) {
            console.warn("Bible index load failed. Bible analysis will be disabled until a translation is imported.", error);
            this.bibleIndex = EMPTY_BIBLE_INDEX;
            this.activeV2Data = null;
            this.activeTranslationId = null;
            this.updateBookMapping(null);
        }
    }

    private async reloadBibleIndex(): Promise<void> {
        await this.loadBibleIndex();
        this.refreshSettingsTab();
        new Notice(this.t("notice.bibleIndexReloaded"), 5000);
    }

    public openEpubFilePicker(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".epub,application/epub+zip";
        input.onchange = () => { const file = input.files?.[0]; if (file !== undefined) void this.importEpubFile(file); };
        input.click();
    }

    public async importEpubFile(file: File): Promise<void> {
        try {
            const preparedImport = await prepareEpubImportSettings({
                app: this.app,
                file,
                locale: this.settings.interfaceLanguage,
                translate: (key, params) => this.t(key, params),
                createRepository: () => this.createObsidianBibleIndexRepository(),
            });

            if (preparedImport === null) {
                return;
            }

            const result = await executePreparedEpubImport({
                app: this.app,
                fileName: file.name,
                preparedImport,
                translate: (key, params) => this.t(key, params),
                createRepository: () => this.createObsidianBibleIndexRepository(),
                onImported: async (repository, importResult) => {
                    this.bibleIndex = repository.getIndex();
                    this.activeV2Data = repository.getV2Data();
                    await this.promoteTranslationToTop(importResult.translationId);
                    this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
                    this.updateBookMapping(this.activeV2Data);
                    this.refreshSettingsTab();
                },
            });

            if (result.warnings.length > 0) console.warn("EPUB import warnings", result.warnings);
            new Notice(formatEpubImportSuccessNotice(
                result,
                (key, params) => this.t(key, params),
            ), 15000);
        } catch (error) {
            if (isEpubImportAbortError(error)) {
                new Notice(this.t("notice.importCancelled"), 5000);
                return;
            }
            console.error("EPUB import failed", error);
            new Notice(this.t("notice.importFailed", { message: localizeImportErrorMessage(error, (key, params) => this.t(key, params)) }), 15000);
        }
    }

    private createObsidianBibleIndexRepository(): ObsidianBibleIndexV2Repository {
        return new ObsidianBibleIndexV2Repository(this.app.vault.adapter, this.getBibleIndexDataDirectoryPath());
    }

    private async loadPluginSettings(): Promise<void> {
        this.settings = normalizePluginSettings(await this.loadData());
    }

    private async savePluginSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private async loadReferenceUsageIndex(): Promise<void> {
        this.referenceUsageIndexService = await loadReferenceUsageIndexServiceFlow(this.createReferenceUsagePluginFlowInput());
    }

    private getReferenceUsageIndexService(): ReferenceUsageIndexService {
        if (this.referenceUsageIndexService === null) {
            this.referenceUsageIndexService = createReferenceUsageIndexServiceFlow(this.createReferenceUsagePluginFlowInput());
        }
        return this.referenceUsageIndexService;
    }

    private createReferenceUsagePluginFlowInput(): ReferenceUsagePluginFlowInput {
        return {
            app: this.app,
            interfaceLanguage: this.settings.interfaceLanguage,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: this.settings.previewPanelSide,
            isMobile: Platform.isMobileApp,
            getBibleIndexDataDirectoryPath: () => this.getBibleIndexDataDirectoryPath(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            getReferenceUsageExcludedFolders: () => this.settings.referenceUsageExcludedFolders,
            isIndexingEnabled: () => this.settings.referenceUsageIndexingEnabled,
            shouldAutoProcessEvents: () => this.shouldAutoProcessReferenceUsageIndexEvents(),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            getReferenceUnderCursor: () => getBibleReferenceMatchUnderCursorFromActiveEditor(this.createEditorReferenceUnderCursorInput(true)),
            getReferenceUsageIndexService: () => this.getReferenceUsageIndexService(),
            translate: (key, params) => this.t(key, params),
            refreshSettings: () => this.refreshSettingsTab(),
            waitForNextAnimationFrame: () => this.waitForNextAnimationFrame(),
            setSuppressPreviewActiveLeafChange: (value) => {
                this.suppressPreviewActiveLeafChange = value;
            },
        };
    }

    private updateBookMapping(v2Data: BibleIndexV2Data | null): void {
        this.bookMapping = v2Data !== null && this.activeTranslationId !== null
            ? createBookMappingFromBibleIndexV2Data(v2Data, this.activeTranslationId)
            : createBookMapping([]);
        this.bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
        this.refreshBibleReferenceLinks();
    }

    private createTranslationSettingsFlowInput(): TranslationSettingsFlowInput {
        return {
            getV2Data: () => this.activeV2Data,
            getActiveTranslationId: () => this.activeTranslationId,
            getTranslationOrder: () => this.settings.translationOrder,
            getComparisonTranslationIds: () => this.settings.comparisonTranslationIds,
            setTranslationOrder: (translationOrder) => {
                this.settings = { ...this.settings, translationOrder };
            },
            setComparisonTranslationIds: (comparisonTranslationIds) => {
                this.settings = { ...this.settings, comparisonTranslationIds };
            },
            setActiveTranslationId: (activeTranslationId) => {
                this.activeTranslationId = activeTranslationId;
            },
            saveSettings: () => this.savePluginSettings(),
            updateBookMapping: (v2Data) => this.updateBookMapping(v2Data),
            showCurrentTranslationNotice: () => new Notice(this.t("notice.currentTranslation", { translationName: this.getActiveTranslationDisplayName() }), 4000),
            refreshSettings: () => this.refreshSettingsTab(),
            refreshVisibleBiblePreviewContent: () => this.refreshVisibleBiblePreviewContent(),
        };
    }

    private createTranslationControllerState(v2Data: BibleIndexV2Data | null = this.activeV2Data): TranslationControllerState {
        return createTranslationControllerStateFlow(this.createTranslationSettingsFlowInput(), v2Data);
    }

    private selectActiveTranslationId(v2Data: BibleIndexV2Data | null): string | null {
        return selectActiveTranslationIdFlow(this.createTranslationSettingsFlowInput(), v2Data);
    }

    private async syncTranslationOrder(
        v2Data: BibleIndexV2Data | null,
        preferredTranslationId?: string,
    ): Promise<void> {
        await syncTranslationOrderFlow(this.createTranslationSettingsFlowInput(), v2Data, preferredTranslationId);
    }

    private async promoteTranslationToTop(translationId: string): Promise<void> {
        await promoteTranslationToTopFlow(this.createTranslationSettingsFlowInput(), translationId);
    }

    public getTranslationSettingsItems(): TranslationSettingsItem[] {
        return getTranslationSettingsItemsFlow(this.createTranslationSettingsFlowInput());
    }

    public async moveTranslation(translationId: string, direction: -1 | 1): Promise<void> {
        await moveTranslationFlow(this.createTranslationSettingsFlowInput(), translationId, direction);
    }

    public async setTranslationOrder(nextOrder: string[]): Promise<void> {
        await setTranslationOrderFlow(this.createTranslationSettingsFlowInput(), nextOrder);
    }

    public async setComparisonTranslationEnabled(translationId: string, enabled: boolean): Promise<void> {
        await setComparisonTranslationEnabledFlow(this.createTranslationSettingsFlowInput(), translationId, enabled);
    }

    public getPreviewComparisonTranslationOptions(): PreviewComparisonTranslationOption[] {
        return getPreviewComparisonTranslationOptionsFlow(this.createTranslationSettingsFlowInput());
    }

    private async refreshVisibleBiblePreviewContent(): Promise<void> {
        const content = this.getCurrentBiblePreviewContent();
        if (content === null) {
            return;
        }

        const nextContent = await this.rebuildBiblePreviewContent(content);
        if (nextContent !== null) {
            this.showBiblePreviewContent(nextContent, { type: "default" }, { reveal: false });
        }
    }

    private getCurrentBiblePreviewContent(): BiblePreviewContent | null {
        if (this.settings.previewDisplayMode === "side-panel") {
            return this.lastPanePreviewContent;
        }
        return this.floatingPreviewWindow?.getContent() ?? null;
    }

    public async setBibleReferenceLinkColor(color: string): Promise<void> {
        const nextColor = normalizeBibleReferenceLinkColor(color);

        if (this.settings.bibleReferenceLinkColor === nextColor) {
            return;
        }

        this.settings = { ...this.settings, bibleReferenceLinkColor: nextColor };
        await this.savePluginSettings();
        this.refreshBibleReferenceLinks();
        this.refreshSettingsTab();
    }

    public async resetBibleReferenceLinkColor(): Promise<void> {
        await this.setBibleReferenceLinkColor(DEFAULT_BIBLE_REFERENCE_LINK_COLOR);
    }

    public isPluginActive(): boolean {
        return this.settings.isPluginActive;
    }

    public shouldRunBiblePreviewForEditor(_view?: unknown): boolean {
        // Central runtime gate. Future folder/file/frontmatter filters should be added here
        // so hot paths can keep a single early-exit check.
        return this.isPluginActive();
    }

    public async togglePluginActive(): Promise<void> {
        await this.setPluginActive(!this.settings.isPluginActive);
    }

    public async setPluginActive(isPluginActive: boolean): Promise<void> {
        if (this.settings.isPluginActive === isPluginActive) {
            return;
        }
        this.settings = { ...this.settings, isPluginActive };
        await this.savePluginSettings();
        this.applyPluginActiveStateChange();
        this.refreshSettingsTab();
        new Notice(this.t(isPluginActive ? "notice.pluginActivated" : "notice.pluginDeactivated"), 2500);
    }

    private applyPluginActiveStateChange(): void {
        this.updatePluginActiveRibbonIcon();
        if (this.settings.isPluginActive) {
            this.refreshBibleReferenceLinks();
            return;
        }
        this.hideFloatingBiblePreview(true);
        void this.closeBiblePreviewPane({ collapseSideDock: false, requireActivePreview: false });
        this.clearBibleReferenceLinks();
    }

    private getPluginActiveRibbonTitle(): string {
        return this.t(this.settings.isPluginActive ? "ribbon.deactivatePlugin" : "ribbon.activatePlugin");
    }

    private updatePluginActiveRibbonIcon(): void {
        if (this.pluginActiveRibbonIconEl === null) {
            return;
        }
        this.pluginActiveRibbonIconEl.setAttribute("aria-label", this.getPluginActiveRibbonTitle());
        this.pluginActiveRibbonIconEl.classList.toggle("is-active", this.settings.isPluginActive);
        this.pluginActiveRibbonIconEl.classList.toggle("is-muted", !this.settings.isPluginActive);
    }

    public getBibleReferenceLinkColorPickerValue(): string {
        return getBibleReferenceLinkColorPickerValueFlow(this.settings.bibleReferenceLinkColor);
    }

    public isBibleReferenceLinkColorDefault(): boolean {
        return this.settings.bibleReferenceLinkColor === DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
    }

    public async setFloatingPreviewBackgroundColor(color: string): Promise<void> {
        const nextColor = normalizeFloatingPreviewBackgroundColor(color);
        if (this.settings.floatingPreviewBackgroundColor === nextColor) {
            return;
        }
        this.settings = { ...this.settings, floatingPreviewBackgroundColor: nextColor };
        await this.savePluginSettings();
        this.refreshFloatingPreviewLabels();
        this.refreshSettingsTab();
    }

    public async resetFloatingPreviewBackgroundColor(): Promise<void> {
        await this.setFloatingPreviewBackgroundColor(DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR);
    }

    public getFloatingPreviewBackgroundColor(): string {
        return normalizeFloatingPreviewBackgroundColor(this.settings.floatingPreviewBackgroundColor);
    }

    public getFloatingPreviewBackgroundColorPickerValue(): string {
        return getFloatingPreviewBackgroundColorPickerValueFlow(this.settings.floatingPreviewBackgroundColor);
    }

    public isFloatingPreviewBackgroundColorDefault(): boolean {
        return this.settings.floatingPreviewBackgroundColor === DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
    }

    public openCssColorDialog(input: CssColorDialogInput): void {
        openCssColorDialogFlow({
            app: this.app,
            locale: this.settings.interfaceLanguage,
        }, input);
    }

    public openFloatingPreviewBackgroundColorDialog(): void {
        openFloatingPreviewBackgroundColorDialogFlow({
            app: this.app,
            locale: this.settings.interfaceLanguage,
            translate: (key) => this.t(key),
            getFloatingPreviewBackgroundColor: () => this.getFloatingPreviewBackgroundColor(),
            setFloatingPreviewBackgroundColor: (color) => void this.setFloatingPreviewBackgroundColor(color),
        });
    }

    public getBiblePreviewTriggerMode(): BiblePreviewTriggerMode {
        return this.settings.previewTriggerMode;
    }

    public getBiblePreviewDisplayMode(): BiblePreviewDisplayMode {
        return this.settings.previewDisplayMode;
    }

    public getBiblePreviewPanelSide(): BiblePreviewPanelSide {
        return this.settings.previewPanelSide;
    }
    public shouldClosePreviewOnActiveLeafChange(): boolean {
        return this.settings.closePreviewOnActiveLeafChange;
    }
    public async setClosePreviewOnActiveLeafChange(closePreviewOnActiveLeafChange: boolean): Promise<void> {
        if (this.settings.closePreviewOnActiveLeafChange === closePreviewOnActiveLeafChange) {
            return;
        }
        this.settings = { ...this.settings, closePreviewOnActiveLeafChange };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public shouldAutoOpenPreviewOnVerseChange(): boolean {
        return this.settings.autoOpenPreviewOnVerseChange;
    }

    public async setAutoOpenPreviewOnVerseChange(autoOpenPreviewOnVerseChange: boolean): Promise<void> {
        if (this.settings.autoOpenPreviewOnVerseChange === autoOpenPreviewOnVerseChange) {
            return;
        }
        this.settings = { ...this.settings, autoOpenPreviewOnVerseChange };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public isPreviewComparisonEnabled(): boolean {
        return this.settings.previewComparisonEnabled;
    }

    public async setPreviewComparisonEnabled(previewComparisonEnabled: boolean): Promise<void> {
        if (this.settings.previewComparisonEnabled === previewComparisonEnabled) {
            return;
        }
        this.settings = { ...this.settings, previewComparisonEnabled };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public shouldInterceptLinkOpenShortcut(): boolean {
        return this.settings.interceptLinkOpenShortcut;
    }

    public getBibleLinkOpenShortcut(): BibleLinkOpenShortcut {
        return this.settings.linkOpenShortcut;
    }

    public async setInterceptLinkOpenShortcut(interceptLinkOpenShortcut: boolean): Promise<void> {
        if (this.settings.interceptLinkOpenShortcut === interceptLinkOpenShortcut) {
            return;
        }

        this.settings = { ...this.settings, interceptLinkOpenShortcut };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public async setBibleLinkOpenShortcut(linkOpenShortcut: BibleLinkOpenShortcut): Promise<void> {
        if (this.settings.linkOpenShortcut === linkOpenShortcut) {
            return;
        }

        this.settings = { ...this.settings, linkOpenShortcut };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    private createReferenceUsageSettingsFlowInput(): ReferenceUsageSettingsFlowInput {
        return {
            referenceUsageIndexingEnabled: this.settings.referenceUsageIndexingEnabled,
            referenceUsageAutoUpdate: this.settings.referenceUsageAutoUpdate,
            referenceUsageExcludedFolders: this.settings.referenceUsageExcludedFolders,
            setReferenceUsageIndexingEnabled: (referenceUsageIndexingEnabled) => {
                this.settings = { ...this.settings, referenceUsageIndexingEnabled };
            },
            setReferenceUsageAutoUpdate: (referenceUsageAutoUpdate) => {
                this.settings = { ...this.settings, referenceUsageAutoUpdate };
            },
            setReferenceUsageExcludedFolders: (referenceUsageExcludedFolders) => {
                this.settings = { ...this.settings, referenceUsageExcludedFolders };
            },
            saveSettings: () => this.savePluginSettings(),
            refreshSettings: () => this.refreshSettingsTab(),
            getReferenceUsageController: () => this.getReferenceUsageController(),
        };
    }

    public isReferenceUsageIndexingEnabled(): boolean {
        return isReferenceUsageIndexingEnabledFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public shouldAutoUpdateReferenceUsageIndex(): boolean {
        return shouldAutoUpdateReferenceUsageIndexFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public getReferenceUsageExcludedFoldersText(): string {
        return getReferenceUsageExcludedFoldersTextFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public async setReferenceUsageIndexingEnabled(referenceUsageIndexingEnabled: boolean): Promise<void> {
        await setReferenceUsageIndexingEnabledFlow(this.createReferenceUsageSettingsFlowInput(), referenceUsageIndexingEnabled);
    }

    public async setReferenceUsageAutoUpdate(referenceUsageAutoUpdate: boolean): Promise<void> {
        await setReferenceUsageAutoUpdateFlow(this.createReferenceUsageSettingsFlowInput(), referenceUsageAutoUpdate);
    }

    public async setReferenceUsageExcludedFoldersText(value: string): Promise<void> {
        await setReferenceUsageExcludedFoldersTextFlow(this.createReferenceUsageSettingsFlowInput(), value);
    }

    public async buildReferenceUsageIndex(): Promise<void> {
        await buildReferenceUsageIndexFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public async rebuildReferenceUsageIndex(): Promise<void> {
        await rebuildReferenceUsageIndexFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public async clearReferenceUsageIndex(): Promise<void> {
        await clearReferenceUsageIndexFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public async showReferenceUsageIndexStats(): Promise<void> {
        showReferenceUsageIndexStatsFlow(this.createReferenceUsageSettingsFlowInput());
    }

    public async findReferenceUsagesUnderCursor(): Promise<void> {
        await findReferenceUsagesUnderCursorFlow(this.createReferenceUsageUnderCursorFlowInput());
    }

    public async openReferenceUsagesPanelUnderCursor(): Promise<void> {
        await openReferenceUsagesPanelUnderCursorFlow(this.createReferenceUsageUnderCursorFlowInput());
    }

    private createReferenceUsageUnderCursorFlowInput() {
        return createReferenceUsageUnderCursorFlowInputFlow(this.createReferenceUsagePluginFlowInput());
    }

    private async showReferenceUsagesForPreviewBlock(block: BiblePreviewReferenceBlock): Promise<void> {
        await showReferenceUsagesForPreviewBlockFlow(
            createReferenceUsagePreviewBlockFlowInputFlow(this.createReferenceUsagePluginFlowInput()),
            block,
        );
    }

    private createReferenceUsagePaneFlowInput(): ReferenceUsagePaneFlowInput {
        return createReferenceUsagePaneFlowInputFlow(this.createReferenceUsagePluginFlowInput());
    }

    private waitForNextAnimationFrame(): Promise<void> {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    private createEditorReferenceUnderCursorInput(showNotice: boolean): EditorReferenceUnderCursorInput {
        return {
            editorRuntimeState: this.editorRuntimeState,
            showNotice,
            isPluginActive: () => this.isPluginActive(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            parseReferenceMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            translate: (key) => this.t(key),
        };
    }

    private registerReferenceUsageIndexEvents(): void {
        const controller = this.getReferenceUsageController();
        this.registerEvent(this.app.vault.on("create", (file) => controller.handleFileCreateOrModify(file)));
        this.registerEvent(this.app.vault.on("modify", (file) => controller.handleFileCreateOrModify(file)));
        this.registerEvent(this.app.vault.on("delete", (file) => controller.handleFileDelete(file)));
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => controller.handleFileRename(file, oldPath)));
        this.register(() => controller.clearPendingUpdates());
    }

    private getReferenceUsageController(): ReferenceUsageController {
        if (this.referenceUsageController === null) {
            this.referenceUsageController = createReferenceUsageControllerFlow(this.createReferenceUsagePluginFlowInput());
        }
        return this.referenceUsageController;
    }

    private shouldAutoProcessReferenceUsageIndexEvents(): boolean {
        return this.settings.referenceUsageIndexingEnabled && this.settings.referenceUsageAutoUpdate && this.hasImportedTranslations();
    }

    public async setBiblePreviewDisplayMode(previewDisplayMode: BiblePreviewDisplayMode): Promise<void> {
        if (this.settings.previewDisplayMode === previewDisplayMode) {
            return;
        }

        this.settings = { ...this.settings, previewDisplayMode };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public async setBiblePreviewPanelSide(previewPanelSide: BiblePreviewPanelSide): Promise<void> {
        if (this.settings.previewPanelSide === previewPanelSide) {
            return;
        }

        this.settings = { ...this.settings, previewPanelSide };
        await this.savePluginSettings();
        await this.closeBiblePreviewPane({ collapseSideDock: true, requireActivePreview: false });
        this.refreshSettingsTab();
    }

    public async setBiblePreviewTriggerMode(previewTriggerMode: BiblePreviewTriggerMode): Promise<void> {
        if (this.settings.previewTriggerMode === previewTriggerMode) {
            return;
        }

        this.settings = { ...this.settings, previewTriggerMode };
        await this.savePluginSettings();
        this.refreshSettingsTab();

        dispatchEditorViewNoopUpdate(this.editorRuntimeState.editorViews);
    }

    public getBibleReferenceLinkColor(): string {
        return normalizeBibleReferenceLinkColor(this.settings.bibleReferenceLinkColor);
    }



    private processReadingModeBibleReferences(element: HTMLElement, _context: MarkdownPostProcessorContext): void {
        processReadingModeBibleReferenceLinks({
            element,
            hasImportedTranslations: () => this.hasImportedTranslations(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            getBibleReferenceLinkColor: () => this.getBibleReferenceLinkColor(),
            openBibleReference: (anchorEl, referenceText) => this.readingModePreviewController?.open(anchorEl, referenceText),
        });
    }

    private registerGlobalLinkOpenShortcutHandler(): void {
        window.addEventListener("keydown", this.linkOpenShortcutKeydownHandler, true);
        this.register(() => window.removeEventListener("keydown", this.linkOpenShortcutKeydownHandler, true));
    }

    private handleLinkOpenShortcutKeydown(event: KeyboardEvent): void {
        if (!this.isPluginActive()) {
            return;
        }
        if (!this.shouldInterceptLinkOpenShortcut() || !this.isConfiguredBibleLinkOpenShortcut(event)) {
            return;
        }

        if (!this.openBibleReferenceUnderCursorFromActiveEditor(false)) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
    }

    private isConfiguredBibleLinkOpenShortcut(event: KeyboardEvent): boolean {
        if (event.key !== "Enter" || event.shiftKey || event.metaKey) {
            return false;
        }

        switch (this.settings.linkOpenShortcut) {
            case "alt-enter":
                return event.altKey && !event.ctrlKey;
            case "ctrl-enter":
                return event.ctrlKey && !event.altKey;
            case "ctrl-alt-enter":
                return event.ctrlKey && event.altKey;
        }
    }

    private openBibleReferenceUnderCursorFromActiveEditor(showNotice: boolean): boolean {
        if (!this.isPluginActive()) {
            if (showNotice) {
                new Notice(this.t("notice.pluginInactive"), 2500);
            }
            return false;
        }
        const controller = findFocusedEditorPreviewController(this.editorRuntimeState.previewControllers.entries());
        if (controller !== null) {
            return controller.openBibleReferenceUnderCursor(showNotice);
        }

        if (showNotice) {
            new Notice(this.t("notice.activeEditorNotFound"), 2500);
        }

        return false;
    }

    private createTranslationDisplayFlowInput(): TranslationDisplayFlowInput {
        return {
            activeV2Data: this.activeV2Data,
            activeTranslationId: this.activeTranslationId,
            getNoImportedTranslationText: () => this.t("translation.noImported"),
            getPreviewTitleFallbackText: () => this.t("preview.titleFallback"),
        };
    }

    private createTranslationDeleteFlowInput(): TranslationDeleteFlowInput {
        return {
            ...this.createTranslationSettingsFlowInput(),
            getBibleIndexV2Data: () => this.activeV2Data,
            createRepository: () => this.createObsidianBibleIndexRepository(),
            confirmDeleteTranslation: (translationName) => window.confirm([
                this.t("confirm.deleteTranslation.title", { translationName }),
                "",
                this.t("confirm.deleteTranslation.filesWillBeDeleted"),
                this.t("confirm.deleteTranslation.reimportHint"),
            ].join("\n")),
            setBibleIndex: (bibleIndex) => {
                this.bibleIndex = bibleIndex;
            },
            setBibleIndexV2Data: (v2Data) => {
                this.activeV2Data = v2Data;
            },
            showTranslationDeletedNotice: (translationName) => new Notice(this.t("notice.translationDeleted", { translationName }), 5000),
        };
    }

    public async deleteImportedTranslation(translationId: string): Promise<void> {
        await deleteImportedTranslationFlow(this.createTranslationDeleteFlowInput(), translationId);
    }

    public getActiveTranslationDisplayName(): string {
        return getActiveTranslationDisplayNameFlow(this.createTranslationDisplayFlowInput());
    }

    public getActiveTranslationPreviewTitle(): string {
        return getActiveTranslationPreviewTitleFlow(this.createTranslationDisplayFlowInput());
    }

    private refreshSettingsTab(): void {
        this.settingsTab?.display();
    }

    private getBibleIndexDataDirectoryPath(): string { return `${this.getPluginDirectoryPath()}/data`; }
    private getPluginDirectoryPath(): string { const manifestWithDirectory = this.manifest as { dir?: string }; return manifestWithDirectory.dir ?? `.obsidian/plugins/${this.manifest.id}`; }

    private createBiblePreviewPluginFlowInput(): BiblePreviewPluginFlowInput {
        return {
            app: this.app,
            isMobile: Platform.isMobileApp,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            getPreviewPanelSide: () => this.settings.previewPanelSide,
            getPreviewDisplayMode: () => this.settings.previewDisplayMode,
            setPreviewDisplayMode: (previewDisplayMode) => {
                this.settings = { ...this.settings, previewDisplayMode };
            },
            saveSettings: () => this.savePluginSettings(),
            refreshSettings: () => this.refreshSettingsTab(),
            getActiveTranslationPreviewTitle: () => this.getActiveTranslationPreviewTitle(),
            translate: (key, params) => this.t(key, params),
            getFloatingPreviewBackgroundColor: () => this.getFloatingPreviewBackgroundColor(),
            isPreviewComparisonEnabled: () => this.settings.previewComparisonEnabled,
            getPreviewComparisonTranslationOptions: () => this.getPreviewComparisonTranslationOptions(),
            showReferenceUsagesForPreviewBlock: (block) => void this.showReferenceUsagesForPreviewBlock(block),
            setComparisonTranslationEnabled: (translationId, enabled) => void this.setComparisonTranslationEnabled(translationId, enabled),
            toggleBiblePreviewComparison: (content) => void this.toggleBiblePreviewComparison(content),
            showFloatingBiblePreview: (content, anchor, options) => this.floatingPreviewWindow?.show(content, anchor, options),
            scrollFloatingBiblePreview: (command) => {
                this.floatingPreviewWindow?.scrollPreview(command);
            },
            waitForNextFrame: () => this.waitForNextFrame(),
            setLastPanePreviewContent: (nextContent) => {
                this.lastPanePreviewContent = nextContent;
            },
            setSuppressPreviewActiveLeafChange: (value) => {
                this.suppressPreviewActiveLeafChange = value;
            },
            getBiblePreviewPaneIsActiveInSideDock: () => this.biblePreviewPaneIsActiveInSideDock,
            setBiblePreviewPaneIsActiveInSideDock: (value) => {
                this.biblePreviewPaneIsActiveInSideDock = value;
            },
            getLastPanelEscapeTime: () => this.lastPanelEscapeTime,
            setLastPanelEscapeTime: (value) => {
                this.lastPanelEscapeTime = value;
            },
            isFloatingPreviewVisible: () => this.floatingPreviewWindow?.isVisible() === true,
            isClosePreviewOnActiveLeafChangeEnabled: () => this.settings.closePreviewOnActiveLeafChange,
            isPluginActive: () => this.isPluginActive(),
            hideFloatingBiblePreview: (resetPosition) => this.floatingPreviewWindow?.hide(resetPosition),
            refreshFloatingPreviewLabels: (input) => this.floatingPreviewWindow?.refreshLabels(input),
            isFloatingPreviewTarget: (target) => this.floatingPreviewWindow?.containsTarget(target) ?? false,
        };
    }

    private createFloatingPreviewWindowInput() {
        return createFloatingBiblePreviewWindowInputFlow(this.createBiblePreviewPluginFlowInput());
    }

    private createBiblePreviewPaneViewInput() {
        return createBiblePreviewPaneViewInputFlow(this.createBiblePreviewPluginFlowInput());
    }

    private createBiblePreviewPaneFlowInputFactoryInput() {
        return createBiblePreviewPaneFlowInputFactoryInputFlow(this.createBiblePreviewPluginFlowInput());
    }

    public showBiblePreviewContent(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        showBiblePreviewContentFlow(this.createBiblePreviewPluginFlowInput(), content, anchor, options);
    }
    public showFloatingBiblePreview(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        showFloatingBiblePreviewFlow(this.createBiblePreviewPluginFlowInput(), content, anchor, options);
    }
    private async switchBiblePreviewToPanel(content: BiblePreviewContent): Promise<void> {
        await switchBiblePreviewToPanelFlow(this.createBiblePreviewPluginFlowInput(), content);
    }
    private async switchBiblePreviewToFloating(content: BiblePreviewContent): Promise<void> {
        await switchBiblePreviewToFloatingFlow(this.createBiblePreviewPluginFlowInput(), content);
    }
    private async showBiblePreviewInPanel(content: BiblePreviewContent, options: { reveal?: boolean } = {}): Promise<void> {
        await showBiblePreviewInPanelFlow(this.createBiblePreviewPluginFlowInput(), content, options);
    }

    private async scrollBiblePreview(command: BiblePreviewScrollCommand): Promise<void> {
        await scrollBiblePreviewFlow(this.createBiblePreviewPluginFlowInput(), command);
    }

    private async closeBiblePreviewPane(options: { collapseSideDock?: boolean; requireActivePreview?: boolean } = {}): Promise<void> {
        await closeBiblePreviewPaneFlow(this.createBiblePreviewPluginFlowInput(), options);
    }
    private createBiblePreviewPaneStateFlowInput() {
        return createBiblePreviewPaneStateFlowInputFlow(this.createBiblePreviewPluginFlowInput());
    }

    private handlePanelEscapeKeydown(event: KeyboardEvent): void {
        handleBiblePreviewPanelEscapeKeydownFlow(this.createBiblePreviewPaneStateFlowInput(), event);
    }

    private handlePreviewActiveLeafChange(activeLeaf: WorkspaceLeaf | null): void {
        if (this.suppressPreviewActiveLeafChange) {
            return;
        }
        handleBiblePreviewActiveLeafChangeFlow(this.createBiblePreviewPaneStateFlowInput(), activeLeaf);
    }
    private waitForNextFrame(): Promise<void> {
        return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    public hideFloatingBiblePreview(resetPosition = false): void {
        hideFloatingBiblePreviewFlow(this.createBiblePreviewPluginFlowInput(), resetPosition);
    }
    public refreshFloatingPreviewLabels(): void {
        refreshFloatingPreviewLabelsFlow(this.createBiblePreviewPluginFlowInput());
    }
    public isFloatingPreviewTarget(target: Node): boolean {
        return isFloatingPreviewTargetFlow(this.createBiblePreviewPluginFlowInput(), target);
    }


    createCursorExtension() {
        return createEditorCursorExtension(createEditorCursorExtensionInputFlow(this.createEditorPluginInputFactoryInput()));
    }

    private createEditorPluginInputFactoryInput(): EditorPluginInputFactoryInput {
        return {
            app: this.app,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            editorRuntimeState: this.editorRuntimeState,
            getActiveTranslationId: () => this.activeTranslationId,
            getBibleReferenceLinkColor: () => this.getBibleReferenceLinkColor(),
            shouldRunBiblePreviewForEditor: (view) => this.shouldRunBiblePreviewForEditor(view),
            getBiblePreviewTriggerMode: () => this.getBiblePreviewTriggerMode(),
            getBiblePreviewDisplayMode: () => this.getBiblePreviewDisplayMode(),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            findBibleReferenceMatchAtPosition: (view, position) => findEditorBibleReferenceMatchAtPosition(view, position, (text) => this.bibleReferenceParser.parseMatches(text)),
            getCurrentParagraph: getCurrentEditorParagraph,
            analyzeParagraph: (paragraph) => this.analyzeParagraphAsync(paragraph),
            analyzeReferenceText: (text) => this.analyzeReferenceTextAsync(text),
            showBiblePreviewContent: (content) => this.showBiblePreviewContent(content, { type: "default" }, { reveal: this.shouldAutoOpenPreviewOnVerseChange() }),
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            hideFloatingBiblePreview: () => this.hideFloatingBiblePreview(),
            translate: (key) => this.t(key),
        };
    }


    private hasImportedTranslations(): boolean {
        return this.activeV2Data !== null
            && this.activeTranslationId !== null
            && this.activeV2Data.translations[this.activeTranslationId] !== undefined;
    }

    private refreshBibleReferenceLinks(): void {
        refreshEditorReferenceLinks(createEditorReferenceLinkDecorationFlowInputFlow(this.createEditorPluginInputFactoryInput()));
    }

    private clearBibleReferenceLinks(): void {
        clearEditorReferenceLinks(createEditorReferenceLinkDecorationFlowInputFlow(this.createEditorPluginInputFactoryInput()));
    }

    private createBiblePreviewAnalyzerFlowInput(): BiblePreviewAnalyzerFlowInput {
        return {
            bibleIndex: this.bibleIndex,
            bookMapping: this.bookMapping,
            activeV2Data: this.activeV2Data,
            translationControllerState: this.createTranslationControllerState(),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            getActiveTranslationId: () => this.activeTranslationId,
            isPreviewComparisonEnabled: () => this.settings.previewComparisonEnabled,
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            getMissingVerseText: () => this.t("preview.missingVerse"),
        };
    }

    async analyzeParagraphAsync(text: string): Promise<BiblePreviewContent | null> {
        return analyzeBiblePreviewParagraphFlow(this.createBiblePreviewAnalyzerFlowInput(), text);
    }

    async analyzeReferenceTextAsync(text: string): Promise<BiblePreviewContent | null> {
        return this.analyzeParagraphAsync(text);
    }

    private async toggleBiblePreviewComparison(content: BiblePreviewContent): Promise<void> {
        await toggleBiblePreviewComparisonFlow({
            ...this.createBiblePreviewAnalyzerFlowInput(),
            setPreviewComparisonEnabled: (enabled) => this.setPreviewComparisonEnabled(enabled),
            showBiblePreviewContent: (nextContent) => this.showBiblePreviewContent(nextContent, { type: "default" }, { reveal: true }),
        }, content);
    }

    private async rebuildBiblePreviewContent(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        return rebuildBiblePreviewContentFlow(this.createBiblePreviewAnalyzerFlowInput(), content);
    }

    async openBibleIndexFolder(): Promise<void> {
        await openBibleIndexFolderFlow({
            app: this.app,
            directoryPath: this.getBibleIndexDataDirectoryPath(),
            isMobile: Platform.isMobileApp,
            translate: (key, params) => this.t(key, params),
        });
    }

    async showBibleIndexStats(): Promise<void> {
        await showBibleIndexStatsFlow({
            activeV2Data: this.activeV2Data,
            activeTranslationIdText: this.activeTranslationId ?? this.t("notice.none"),
            createRepository: () => this.createObsidianBibleIndexRepository(),
            translate: (key, params) => this.t(key, params),
        });
    }

    public t(key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>): string {
        return t(this.settings.interfaceLanguage, key, params);
    }

    public getInterfaceLanguage(): BiblePluginLocale {
        return this.settings.interfaceLanguage;
    }

    public async setInterfaceLanguage(interfaceLanguage: BiblePluginLocale): Promise<void> {
        if (this.settings.interfaceLanguage === interfaceLanguage) {
            return;
        }
        this.settings = { ...this.settings, interfaceLanguage };
        await this.savePluginSettings();
        this.refreshSettingsTab();
        refreshBiblePreviewLocalizedLabelsFlow({
            app: this.app,
            previewControllers: this.editorRuntimeState.previewControllers.values(),
            readingModePreviewController: this.readingModePreviewController,
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            createBiblePreviewPaneViewInput: () => this.createBiblePreviewPaneViewInput(),
        });
        new Notice(this.t("notice.restartPluginForCommandNames"), 6000);
    }


}




