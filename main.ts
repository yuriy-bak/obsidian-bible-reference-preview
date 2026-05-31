
import { App, Notice, Platform, Plugin, type MarkdownPostProcessorContext, type WorkspaceLeaf } from "obsidian";
import type { BibleIndex } from "./src/infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import type { BibleReference } from "./src/domain/BibleReference";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createBookMapping } from "./src/parsing/BookMapping";
import type { BiblePreviewContent, BiblePreviewReferenceBlock } from "./src/application/formatBibleTexts";
import { ObsidianBibleIndexV2Repository } from "./src/infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "./src/infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { BiblePluginLocale, I18nKey, t } from "./src/i18n/I18n";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow } from "./src/ui/FloatingBiblePreviewWindow";
import type { CssColorDialogInput } from "./src/ui/CssColorDialog";
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
import { createReferenceUsageController as createReferenceUsageControllerFlow, createReferenceUsageIndexService as createReferenceUsageIndexServiceFlow, createReferenceUsagePaneFlowInput as createReferenceUsagePaneFlowInputFlow, createReferenceUsagePreviewBlockFlowInput as createReferenceUsagePreviewBlockFlowInputFlow, createReferenceUsageUnderCursorFlowInput as createReferenceUsageUnderCursorFlowInputFlow, loadReferenceUsageIndexService as loadReferenceUsageIndexServiceFlow, registerReferenceUsageIndexEvents as registerReferenceUsageIndexEventsFlow, type ReferenceUsagePluginFlowInput } from "./src/reference-usage/ReferenceUsagePluginFlow";
import { buildReferenceUsageIndex as buildReferenceUsageIndexFlow, clearReferenceUsageIndex as clearReferenceUsageIndexFlow, getReferenceUsageExcludedFoldersText as getReferenceUsageExcludedFoldersTextFlow, isReferenceUsageIndexingEnabled as isReferenceUsageIndexingEnabledFlow, rebuildReferenceUsageIndex as rebuildReferenceUsageIndexFlow, setReferenceUsageAutoUpdate as setReferenceUsageAutoUpdateFlow, setReferenceUsageExcludedFoldersText as setReferenceUsageExcludedFoldersTextFlow, setReferenceUsageIndexingEnabled as setReferenceUsageIndexingEnabledFlow, shouldAutoUpdateReferenceUsageIndex as shouldAutoUpdateReferenceUsageIndexFlow, showReferenceUsageIndexStats as showReferenceUsageIndexStatsFlow, type ReferenceUsageSettingsFlowInput } from "./src/reference-usage/ReferenceUsageSettingsFlow";
import type { ReferenceUsageIndexService } from "./src/reference-usage/ReferenceUsageIndexService";
import { createTranslationControllerState as createTranslationControllerStateFlow, deleteImportedTranslation as deleteImportedTranslationFlow, getActiveTranslationDisplayName as getActiveTranslationDisplayNameFlow, getActiveTranslationPreviewTitle as getActiveTranslationPreviewTitleFlow, getPreviewComparisonTranslationOptions as getPreviewComparisonTranslationOptionsFlow, getTranslationSettingsItems as getTranslationSettingsItemsFlow, moveTranslation as moveTranslationFlow, promoteTranslationToTop as promoteTranslationToTopFlow, selectActiveTranslationId as selectActiveTranslationIdFlow, setComparisonTranslationEnabled as setComparisonTranslationEnabledFlow, setTranslationOrder as setTranslationOrderFlow, syncTranslationOrder as syncTranslationOrderFlow, type PreviewComparisonTranslationOption, type TranslationControllerState, type TranslationPluginFlowInput, type TranslationSettingsItem } from "./src/translations/TranslationPluginFlow";
import { DEFAULT_SETTINGS, normalizePluginSettings, type BibleLinkOpenShortcut, type BiblePluginSettings, type BiblePreviewDisplayMode, type BiblePreviewPanelSide, type BiblePreviewTriggerMode } from "./src/settings/PluginSettings";
import { getBibleLinkOpenShortcut as getBibleLinkOpenShortcutFlow, getBiblePreviewDisplayMode as getBiblePreviewDisplayModeFlow, getBiblePreviewPanelSide as getBiblePreviewPanelSideFlow, getBiblePreviewTriggerMode as getBiblePreviewTriggerModeFlow, getBibleReferenceLinkColor as getBibleReferenceLinkColorFlow, getBibleReferenceLinkColorPickerValue as getBibleReferenceLinkColorPickerValueFlow, getFloatingPreviewBackgroundColor as getFloatingPreviewBackgroundColorFlow, getFloatingPreviewBackgroundColorPickerValue as getFloatingPreviewBackgroundColorPickerValueFlow, getInterfaceLanguage as getInterfaceLanguageFlow, getPluginActiveRibbonTitle as getPluginActiveRibbonTitleFlow, isBibleReferenceLinkColorDefault as isBibleReferenceLinkColorDefaultFlow, isFloatingPreviewBackgroundColorDefault as isFloatingPreviewBackgroundColorDefaultFlow, isPluginActive as isPluginActiveFlow, isPreviewComparisonEnabled as isPreviewComparisonEnabledFlow, openCssColorDialog as openCssColorDialogFlow, openFloatingPreviewBackgroundColorDialog as openFloatingPreviewBackgroundColorDialogFlow, resetBibleReferenceLinkColor as resetBibleReferenceLinkColorFlow, resetFloatingPreviewBackgroundColor as resetFloatingPreviewBackgroundColorFlow, setAutoOpenPreviewOnVerseChange as setAutoOpenPreviewOnVerseChangeFlow, setBibleLinkOpenShortcut as setBibleLinkOpenShortcutFlow, setBiblePreviewDisplayMode as setBiblePreviewDisplayModeFlow, setBiblePreviewPanelSide as setBiblePreviewPanelSideFlow, setBiblePreviewTriggerMode as setBiblePreviewTriggerModeFlow, setBibleReferenceLinkColor as setBibleReferenceLinkColorFlow, setClosePreviewOnActiveLeafChange as setClosePreviewOnActiveLeafChangeFlow, setFloatingPreviewBackgroundColor as setFloatingPreviewBackgroundColorFlow, setInterceptLinkOpenShortcut as setInterceptLinkOpenShortcutFlow, setInterfaceLanguage as setInterfaceLanguageFlow, setPluginActive as setPluginActiveFlow, setPreviewComparisonEnabled as setPreviewComparisonEnabledFlow, shouldAutoOpenPreviewOnVerseChange as shouldAutoOpenPreviewOnVerseChangeFlow, shouldClosePreviewOnActiveLeafChange as shouldClosePreviewOnActiveLeafChangeFlow, shouldInterceptLinkOpenShortcut as shouldInterceptLinkOpenShortcutFlow, togglePluginActive as togglePluginActiveFlow, type PluginSettingsFlowInput } from "./src/settings/PluginSettingsFlow";
import { importEpubFile as importEpubFileFlow, loadBibleIndex as loadBibleIndexFlow, openBibleIndexFolder as openBibleIndexFolderFlow, openEpubFilePicker as openEpubFilePickerFlow, reloadBibleIndex as reloadBibleIndexFlow, showBibleIndexStats as showBibleIndexStatsFlow, type BibleIndexPluginFlowInput } from "./src/import/BibleIndexPluginFlow";
import { initializePluginLifecycle as initializePluginLifecycleFlow, type PluginLifecycleFlowInput } from "./src/lifecycle/PluginLifecycleFlow";
import { initializePluginStartup as initializePluginStartupFlow, type PluginStartupFlowInput } from "./src/lifecycle/PluginStartupFlow";
import { processReadingModeBibleReferences as processReadingModeBibleReferenceLinks, type ReadingModePluginFlowInput } from "./src/reading-mode/ReadingModePluginFlow";
import { findBibleReferenceMatchAtPosition as findEditorBibleReferenceMatchAtPosition, getCurrentParagraph as getCurrentEditorParagraph } from "./src/editor/EditorTextAnalysis";
import { getBibleReferenceMatchUnderCursorFromActiveEditor, type EditorReferenceUnderCursorInput } from "./src/editor/EditorReferenceUnderCursor";
import { analyzeParagraph as analyzeParagraphFlow, analyzeReferenceText as analyzeReferenceTextFlow, clearBibleReferenceLinks as clearBibleReferenceLinksFlow, createCursorExtension as createCursorExtensionFlow, rebuildBiblePreviewContent as rebuildBiblePreviewContentFlow, refreshBibleReferenceLinks as refreshBibleReferenceLinksFlow, toggleBiblePreviewComparison as toggleBiblePreviewComparisonFlow, type EditorPluginFlowInput } from "./src/editor/EditorPluginFlow";
import { createEditorRuntimeState } from "./src/editor/EditorRuntimeState";
import { dispatchEditorViewNoopUpdate } from "./src/editor/EditorViewFocus";
import { handleLinkOpenShortcutKeydown as handleLinkOpenShortcutKeydownFlow, openBibleReferenceUnderCursorFromActiveEditor as openBibleReferenceUnderCursorFromActiveEditorFlow, type EditorLinkOpenShortcutFlowInput } from "./src/editor/EditorLinkOpenShortcutFlow";
import { waitForNextAnimationFrame as waitForNextAnimationFrameFlow } from "./src/utils/AnimationFrame";


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
        await initializePluginStartupFlow(this.createPluginStartupFlowInput());
    }

    onunload() { }

    private createPluginStartupFlowInput(): PluginStartupFlowInput {
        return {
            loadPluginSettings: () => this.loadPluginSettings(),
            loadBibleIndex: () => this.loadBibleIndex(),
            loadReferenceUsageIndex: () => this.loadReferenceUsageIndex(),
            initializePluginLifecycle: () => initializePluginLifecycleFlow(this.createPluginLifecycleFlowInput()),
        };
    }

    private createPluginLifecycleFlowInput(): PluginLifecycleFlowInput {
        return {
            addCommand: (command) => this.addCommand(command),
            addRibbonIcon: (icon, title, callback) => this.addRibbonIcon(icon, title, callback),
            addSettingTab: (tab) => this.addSettingTab(tab),
            analyzeReferenceText: (referenceText) => this.analyzeReferenceTextAsync(referenceText),
            buildReferenceUsageIndex: () => this.buildReferenceUsageIndex(),
            clearReferenceUsageIndex: () => this.clearReferenceUsageIndex(),
            createBiblePreviewPaneViewInput: () => this.createBiblePreviewPaneViewInput(),
            createCursorExtension: () => this.createCursorExtension(),
            createFloatingPreviewWindowInput: () => this.createFloatingPreviewWindowInput(),
            createReferenceUsagePaneViewInput: () => this.createReferenceUsagePaneFlowInput().createReferenceUsagePaneViewInput(),
            findReferenceUsagesUnderCursor: () => this.findReferenceUsagesUnderCursor(),
            getLastPanePreviewContent: () => this.lastPanePreviewContent,
            getPluginActiveRibbonTitle: () => this.getPluginActiveRibbonTitle(),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            hideFloatingBiblePreview: () => this.hideFloatingBiblePreview(),
            isFloatingPreviewTarget: (target) => this.isFloatingPreviewTarget(target),
            onActiveLeafChange: (activeLeaf) => this.handlePreviewActiveLeafChange(activeLeaf),
            openBibleIndexFolder: () => this.openBibleIndexFolder(),
            openBibleReferenceUnderCursorFromActiveEditor: (showNotice) => this.openBibleReferenceUnderCursorFromActiveEditor(showNotice),
            openEpubFilePicker: () => this.openEpubFilePicker(),
            openReferenceUsagesPanelUnderCursor: () => this.openReferenceUsagesPanelUnderCursor(),
            panelEscapeKeydownHandler: (event) => this.panelEscapeKeydownHandler(event),
            plugin: this,
            processReadingModeBibleReferences: (element, context) => this.processReadingModeBibleReferences(element, context),
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            rebuildReferenceUsageIndex: () => this.rebuildReferenceUsageIndex(),
            registerDisposer: (disposer) => this.register(disposer),
            registerEditorExtension: (extension) => this.registerEditorExtension(extension),
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerGlobalLinkOpenShortcutHandler: () => this.registerGlobalLinkOpenShortcutHandler(),
            registerMarkdownPostProcessor: (postProcessor) => this.registerMarkdownPostProcessor(postProcessor),
            registerReferenceUsageIndexEvents: () => this.registerReferenceUsageIndexEvents(),
            registerView: (viewType, viewCreator) => this.registerView(viewType, viewCreator),
            reloadBibleIndex: () => this.reloadBibleIndex(),
            scrollBiblePreview: (command) => this.scrollBiblePreview(command),
            setFloatingPreviewWindow: (floatingPreviewWindow) => {
                this.floatingPreviewWindow = floatingPreviewWindow;
            },
            setPluginActiveRibbonIcon: (pluginActiveRibbonIconEl) => {
                this.pluginActiveRibbonIconEl = pluginActiveRibbonIconEl;
            },
            setReadingModePreviewController: (readingModePreviewController) => {
                this.readingModePreviewController = readingModePreviewController;
            },
            setSettingsTab: (settingsTab) => {
                this.settingsTab = settingsTab;
            },
            shouldAutoOpenPreviewOnVerseChange: () => this.shouldAutoOpenPreviewOnVerseChange(),
            showBibleIndexStats: () => this.showBibleIndexStats(),
            showBiblePreviewContent: (content, anchor, options) => this.showBiblePreviewContent(content, anchor, options),
            showNoImportedTranslationsNotice: () => new Notice(this.t("notice.noImportedTranslations"), 2500),
            showReferenceUsageIndexStats: () => this.showReferenceUsageIndexStats(),
            togglePluginActive: () => this.togglePluginActive(),
            translate: (key) => this.t(key),
            updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
        };
    }

    private createBibleIndexPluginFlowInput(): BibleIndexPluginFlowInput {
        return {
            app: this.app,
            emptyBibleIndex: EMPTY_BIBLE_INDEX,
            interfaceLanguage: this.settings.interfaceLanguage,
            isMobile: Platform.isMobileApp,
            getActiveTranslationId: () => this.activeTranslationId,
            getActiveV2Data: () => this.activeV2Data,
            getBibleIndexDataDirectoryPath: () => this.getBibleIndexDataDirectoryPath(),
            createRepository: () => this.createObsidianBibleIndexRepository(),
            setBibleIndex: (bibleIndex) => {
                this.bibleIndex = bibleIndex;
            },
            setActiveV2Data: (v2Data) => {
                this.activeV2Data = v2Data;
            },
            setActiveTranslationId: (activeTranslationId) => {
                this.activeTranslationId = activeTranslationId;
            },
            syncTranslationOrder: (v2Data, preferredTranslationId) => this.syncTranslationOrder(v2Data, preferredTranslationId),
            selectActiveTranslationId: (v2Data) => this.selectActiveTranslationId(v2Data),
            updateBookMapping: (v2Data) => this.updateBookMapping(v2Data),
            promoteTranslationToTop: (translationId) => this.promoteTranslationToTop(translationId),
            refreshSettings: () => this.refreshSettingsTab(),
            translate: (key, params) => this.t(key, params),
        };
    }

    private async loadBibleIndex(): Promise<void> {
        await loadBibleIndexFlow(this.createBibleIndexPluginFlowInput());
    }

    private async reloadBibleIndex(): Promise<void> {
        await reloadBibleIndexFlow(this.createBibleIndexPluginFlowInput());
    }

    public openEpubFilePicker(): void {
        openEpubFilePickerFlow(this.createBibleIndexPluginFlowInput());
    }

    public async importEpubFile(file: File): Promise<void> {
        await importEpubFileFlow(this.createBibleIndexPluginFlowInput(), file);
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
            getReferenceUsageController: () => this.getReferenceUsageController(),
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerDisposer: (disposer) => this.register(disposer),
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

    private createTranslationPluginFlowInput(): TranslationPluginFlowInput {
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
            getNoImportedTranslationText: () => this.t("translation.noImported"),
            getPreviewTitleFallbackText: () => this.t("preview.titleFallback"),
        };
    }

    private createTranslationControllerState(v2Data: BibleIndexV2Data | null = this.activeV2Data): TranslationControllerState {
        return createTranslationControllerStateFlow(this.createTranslationPluginFlowInput(), v2Data);
    }

    private selectActiveTranslationId(v2Data: BibleIndexV2Data | null): string | null {
        return selectActiveTranslationIdFlow(this.createTranslationPluginFlowInput(), v2Data);
    }

    private async syncTranslationOrder(
        v2Data: BibleIndexV2Data | null,
        preferredTranslationId?: string,
    ): Promise<void> {
        await syncTranslationOrderFlow(this.createTranslationPluginFlowInput(), v2Data, preferredTranslationId);
    }

    private async promoteTranslationToTop(translationId: string): Promise<void> {
        await promoteTranslationToTopFlow(this.createTranslationPluginFlowInput(), translationId);
    }

    public getTranslationSettingsItems(): TranslationSettingsItem[] {
        return getTranslationSettingsItemsFlow(this.createTranslationPluginFlowInput());
    }

    public async moveTranslation(translationId: string, direction: -1 | 1): Promise<void> {
        await moveTranslationFlow(this.createTranslationPluginFlowInput(), translationId, direction);
    }

    public async setTranslationOrder(nextOrder: string[]): Promise<void> {
        await setTranslationOrderFlow(this.createTranslationPluginFlowInput(), nextOrder);
    }

    public async setComparisonTranslationEnabled(translationId: string, enabled: boolean): Promise<void> {
        await setComparisonTranslationEnabledFlow(this.createTranslationPluginFlowInput(), translationId, enabled);
    }

    public getPreviewComparisonTranslationOptions(): PreviewComparisonTranslationOption[] {
        return getPreviewComparisonTranslationOptionsFlow(this.createTranslationPluginFlowInput());
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

    private createPluginSettingsFlowInput(): PluginSettingsFlowInput {
        return {
            app: this.app,
            getSettings: () => this.settings,
            setSettings: (settings) => {
                this.settings = settings;
            },
            saveSettings: () => this.savePluginSettings(),
            refreshSettings: () => this.refreshSettingsTab(),
            refreshBibleReferenceLinks: () => this.refreshBibleReferenceLinks(),
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            refreshBiblePreviewLocalizedLabels: () => refreshBiblePreviewLocalizedLabelsFlow({
                app: this.app,
                previewControllers: this.editorRuntimeState.previewControllers.values(),
                readingModePreviewController: this.readingModePreviewController,
                refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
                createBiblePreviewPaneViewInput: () => this.createBiblePreviewPaneViewInput(),
            }),
            updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
            hideFloatingBiblePreview: (resetPosition) => this.hideFloatingBiblePreview(resetPosition),
            closeBiblePreviewPane: (options) => this.closeBiblePreviewPane(options),
            clearBibleReferenceLinks: () => this.clearBibleReferenceLinks(),
            dispatchEditorViewNoopUpdate: () => dispatchEditorViewNoopUpdate(this.editorRuntimeState.editorViews),
            getFloatingPreviewBackgroundColor: () => this.getFloatingPreviewBackgroundColor(),
            translate: (key, params) => this.t(key, params),
        };
    }

    public async setBibleReferenceLinkColor(color: string): Promise<void> {
        await setBibleReferenceLinkColorFlow(this.createPluginSettingsFlowInput(), color);
    }

    public async resetBibleReferenceLinkColor(): Promise<void> {
        await resetBibleReferenceLinkColorFlow(this.createPluginSettingsFlowInput());
    }

    public isPluginActive(): boolean {
        return isPluginActiveFlow(this.createPluginSettingsFlowInput());
    }

    public shouldRunBiblePreviewForEditor(_view?: unknown): boolean {
        // Central runtime gate. Future folder/file/frontmatter filters should be added here
        // so hot paths can keep a single early-exit check.
        return this.isPluginActive();
    }

    public async togglePluginActive(): Promise<void> {
        await togglePluginActiveFlow(this.createPluginSettingsFlowInput());
    }

    public async setPluginActive(isPluginActive: boolean): Promise<void> {
        await setPluginActiveFlow(this.createPluginSettingsFlowInput(), isPluginActive);
    }

    private getPluginActiveRibbonTitle(): string {
        return getPluginActiveRibbonTitleFlow(this.createPluginSettingsFlowInput());
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
        return getBibleReferenceLinkColorPickerValueFlow(this.createPluginSettingsFlowInput());
    }

    public isBibleReferenceLinkColorDefault(): boolean {
        return isBibleReferenceLinkColorDefaultFlow(this.createPluginSettingsFlowInput());
    }

    public async setFloatingPreviewBackgroundColor(color: string): Promise<void> {
        await setFloatingPreviewBackgroundColorFlow(this.createPluginSettingsFlowInput(), color);
    }

    public async resetFloatingPreviewBackgroundColor(): Promise<void> {
        await resetFloatingPreviewBackgroundColorFlow(this.createPluginSettingsFlowInput());
    }

    public getFloatingPreviewBackgroundColor(): string {
        return getFloatingPreviewBackgroundColorFlow(this.createPluginSettingsFlowInput());
    }

    public getFloatingPreviewBackgroundColorPickerValue(): string {
        return getFloatingPreviewBackgroundColorPickerValueFlow(this.createPluginSettingsFlowInput());
    }

    public isFloatingPreviewBackgroundColorDefault(): boolean {
        return isFloatingPreviewBackgroundColorDefaultFlow(this.createPluginSettingsFlowInput());
    }

    public openCssColorDialog(input: CssColorDialogInput): void {
        openCssColorDialogFlow(this.createPluginSettingsFlowInput(), input);
    }

    public openFloatingPreviewBackgroundColorDialog(): void {
        openFloatingPreviewBackgroundColorDialogFlow(this.createPluginSettingsFlowInput());
    }

    public getBiblePreviewTriggerMode(): BiblePreviewTriggerMode {
        return getBiblePreviewTriggerModeFlow(this.createPluginSettingsFlowInput());
    }

    public getBiblePreviewDisplayMode(): BiblePreviewDisplayMode {
        return getBiblePreviewDisplayModeFlow(this.createPluginSettingsFlowInput());
    }

    public getBiblePreviewPanelSide(): BiblePreviewPanelSide {
        return getBiblePreviewPanelSideFlow(this.createPluginSettingsFlowInput());
    }
    public shouldClosePreviewOnActiveLeafChange(): boolean {
        return shouldClosePreviewOnActiveLeafChangeFlow(this.createPluginSettingsFlowInput());
    }
    public async setClosePreviewOnActiveLeafChange(closePreviewOnActiveLeafChange: boolean): Promise<void> {
        await setClosePreviewOnActiveLeafChangeFlow(this.createPluginSettingsFlowInput(), closePreviewOnActiveLeafChange);
    }

    public shouldAutoOpenPreviewOnVerseChange(): boolean {
        return shouldAutoOpenPreviewOnVerseChangeFlow(this.createPluginSettingsFlowInput());
    }

    public async setAutoOpenPreviewOnVerseChange(autoOpenPreviewOnVerseChange: boolean): Promise<void> {
        await setAutoOpenPreviewOnVerseChangeFlow(this.createPluginSettingsFlowInput(), autoOpenPreviewOnVerseChange);
    }

    public isPreviewComparisonEnabled(): boolean {
        return isPreviewComparisonEnabledFlow(this.createPluginSettingsFlowInput());
    }

    public async setPreviewComparisonEnabled(previewComparisonEnabled: boolean): Promise<void> {
        await setPreviewComparisonEnabledFlow(this.createPluginSettingsFlowInput(), previewComparisonEnabled);
    }

    public shouldInterceptLinkOpenShortcut(): boolean {
        return shouldInterceptLinkOpenShortcutFlow(this.createPluginSettingsFlowInput());
    }

    public getBibleLinkOpenShortcut(): BibleLinkOpenShortcut {
        return getBibleLinkOpenShortcutFlow(this.createPluginSettingsFlowInput());
    }

    public async setInterceptLinkOpenShortcut(interceptLinkOpenShortcut: boolean): Promise<void> {
        await setInterceptLinkOpenShortcutFlow(this.createPluginSettingsFlowInput(), interceptLinkOpenShortcut);
    }

    public async setBibleLinkOpenShortcut(linkOpenShortcut: BibleLinkOpenShortcut): Promise<void> {
        await setBibleLinkOpenShortcutFlow(this.createPluginSettingsFlowInput(), linkOpenShortcut);
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
        return waitForNextAnimationFrameFlow();
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
        registerReferenceUsageIndexEventsFlow(this.createReferenceUsagePluginFlowInput());
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
        await setBiblePreviewDisplayModeFlow(this.createPluginSettingsFlowInput(), previewDisplayMode);
    }

    public async setBiblePreviewPanelSide(previewPanelSide: BiblePreviewPanelSide): Promise<void> {
        await setBiblePreviewPanelSideFlow(this.createPluginSettingsFlowInput(), previewPanelSide);
    }

    public async setBiblePreviewTriggerMode(previewTriggerMode: BiblePreviewTriggerMode): Promise<void> {
        await setBiblePreviewTriggerModeFlow(this.createPluginSettingsFlowInput(), previewTriggerMode);
    }

    public getBibleReferenceLinkColor(): string {
        return getBibleReferenceLinkColorFlow(this.createPluginSettingsFlowInput());
    }

    private createReadingModePluginFlowInput(): ReadingModePluginFlowInput {
        return {
            hasImportedTranslations: () => this.hasImportedTranslations(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            getBibleReferenceLinkColor: () => this.getBibleReferenceLinkColor(),
            openBibleReference: (anchorEl, referenceText) => this.readingModePreviewController?.open(anchorEl, referenceText),
        };
    }

    private processReadingModeBibleReferences(element: HTMLElement, _context: MarkdownPostProcessorContext): void {
        processReadingModeBibleReferenceLinks(this.createReadingModePluginFlowInput(), element);
    }

    private registerGlobalLinkOpenShortcutHandler(): void {
        window.addEventListener("keydown", this.linkOpenShortcutKeydownHandler, true);
        this.register(() => window.removeEventListener("keydown", this.linkOpenShortcutKeydownHandler, true));
    }

    private createEditorLinkOpenShortcutFlowInput(): EditorLinkOpenShortcutFlowInput {
        return {
            editorRuntimeState: this.editorRuntimeState,
            isPluginActive: () => this.isPluginActive(),
            shouldInterceptLinkOpenShortcut: () => this.shouldInterceptLinkOpenShortcut(),
            getBibleLinkOpenShortcut: () => this.getBibleLinkOpenShortcut(),
            translate: (key) => this.t(key),
        };
    }

    private handleLinkOpenShortcutKeydown(event: KeyboardEvent): void {
        handleLinkOpenShortcutKeydownFlow(this.createEditorLinkOpenShortcutFlowInput(), event);
    }

    private openBibleReferenceUnderCursorFromActiveEditor(showNotice: boolean): boolean {
        return openBibleReferenceUnderCursorFromActiveEditorFlow(this.createEditorLinkOpenShortcutFlowInput(), showNotice);
    }

    public async deleteImportedTranslation(translationId: string): Promise<void> {
        await deleteImportedTranslationFlow(this.createTranslationPluginFlowInput(), translationId);
    }

    public getActiveTranslationDisplayName(): string {
        return getActiveTranslationDisplayNameFlow(this.createTranslationPluginFlowInput());
    }

    public getActiveTranslationPreviewTitle(): string {
        return getActiveTranslationPreviewTitleFlow(this.createTranslationPluginFlowInput());
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
        return waitForNextAnimationFrameFlow();
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
        return createCursorExtensionFlow(this.createEditorPluginFlowInput());
    }

    private createEditorPluginFlowInput(): EditorPluginFlowInput {
        return {
            app: this.app,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            editorRuntimeState: this.editorRuntimeState,
            bibleIndex: this.bibleIndex,
            bookMapping: this.bookMapping,
            activeV2Data: this.activeV2Data,
            translationControllerState: this.createTranslationControllerState(),
            getActiveTranslationId: () => this.activeTranslationId,
            getBibleReferenceLinkColor: () => this.getBibleReferenceLinkColor(),
            shouldRunBiblePreviewForEditor: (view) => this.shouldRunBiblePreviewForEditor(view),
            getBiblePreviewTriggerMode: () => this.getBiblePreviewTriggerMode(),
            getBiblePreviewDisplayMode: () => this.getBiblePreviewDisplayMode(),
            shouldAutoOpenPreviewOnVerseChange: () => this.shouldAutoOpenPreviewOnVerseChange(),
            isPreviewComparisonEnabled: () => this.settings.previewComparisonEnabled,
            hasImportedTranslations: () => this.hasImportedTranslations(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            findBibleReferenceMatchAtPosition: (view, position) => findEditorBibleReferenceMatchAtPosition(view, position, (text) => this.bibleReferenceParser.parseMatches(text)),
            getCurrentParagraph: getCurrentEditorParagraph,
            setPreviewComparisonEnabled: (enabled) => this.setPreviewComparisonEnabled(enabled),
            showBiblePreviewContent: (content, options) => this.showBiblePreviewContent(content, { type: "default" }, options),
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            hideFloatingBiblePreview: () => this.hideFloatingBiblePreview(),
            getMissingVerseText: () => this.t("preview.missingVerse"),
            translate: (key) => this.t(key),
        };
    }


    private hasImportedTranslations(): boolean {
        return this.activeV2Data !== null
            && this.activeTranslationId !== null
            && this.activeV2Data.translations[this.activeTranslationId] !== undefined;
    }

    private refreshBibleReferenceLinks(): void {
        refreshBibleReferenceLinksFlow(this.createEditorPluginFlowInput());
    }

    private clearBibleReferenceLinks(): void {
        clearBibleReferenceLinksFlow(this.createEditorPluginFlowInput());
    }

    async analyzeParagraphAsync(text: string): Promise<BiblePreviewContent | null> {
        return analyzeParagraphFlow(this.createEditorPluginFlowInput(), text);
    }

    async analyzeReferenceTextAsync(text: string): Promise<BiblePreviewContent | null> {
        return analyzeReferenceTextFlow(this.createEditorPluginFlowInput(), text);
    }

    private async toggleBiblePreviewComparison(content: BiblePreviewContent): Promise<void> {
        await toggleBiblePreviewComparisonFlow(this.createEditorPluginFlowInput(), content, () => this.settings.previewComparisonEnabled);
    }

    private async rebuildBiblePreviewContent(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        return rebuildBiblePreviewContentFlow(this.createEditorPluginFlowInput(), content, () => this.settings.previewComparisonEnabled);
    }

    async openBibleIndexFolder(): Promise<void> {
        await openBibleIndexFolderFlow(this.createBibleIndexPluginFlowInput());
    }

    async showBibleIndexStats(): Promise<void> {
        await showBibleIndexStatsFlow(this.createBibleIndexPluginFlowInput());
    }

    public t(key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>): string {
        return t(this.settings.interfaceLanguage, key, params);
    }

    public getInterfaceLanguage(): BiblePluginLocale {
        return getInterfaceLanguageFlow(this.createPluginSettingsFlowInput());
    }

    public async setInterfaceLanguage(interfaceLanguage: BiblePluginLocale): Promise<void> {
        await setInterfaceLanguageFlow(this.createPluginSettingsFlowInput(), interfaceLanguage);
    }


}




