
import { Notice, Platform, Plugin, type MarkdownPostProcessorContext, type WorkspaceLeaf } from "obsidian";
import { PluginContext } from "./src/core/PluginContext";
import { SettingsService } from "./src/settings/SettingsService";
import { TranslationService } from "./src/translations/TranslationService";
import { BibleLibraryService } from "./src/import/BibleLibraryService";
import type { BiblePluginSettingTabServices } from "./src/ui/BiblePluginSettingTab";
import type { BibleChapterLocation, BibleChapterTarget } from "./src/application/BibleChapterNavigation";
import { refreshChapterUsageCounts, type BiblePreviewContent } from "./src/application/formatBibleTexts";
import { backFromBiblePreviewChapter as backFromBiblePreviewChapterFlow, isBiblePreviewChapterHighlightHidden as isBiblePreviewChapterHighlightHiddenFlow, isBiblePreviewChapterModeActive as isBiblePreviewChapterModeActiveFlow, navigateBiblePreviewChapter as navigateBiblePreviewChapterFlow, openBiblePreviewChapter as openBiblePreviewChapterFlow, setBiblePreviewChapterHighlightHidden as setBiblePreviewChapterHighlightHiddenFlow, trackShownBiblePreviewContent as trackShownBiblePreviewContentFlow, type BiblePreviewChapterFlowInput, type BiblePreviewChapterState } from "./src/preview-navigation/BiblePreviewChapterFlow";
import { getFirstWorkspaceLeafOfType } from "./src/workspace/BiblePreviewWorkspace";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow } from "./src/ui/FloatingBiblePreviewWindow";
import { BIBLE_PREVIEW_VIEW_TYPE, type BiblePreviewScrollCommand } from "./src/ui/BiblePreviewPaneView";
import { refreshBiblePreviewLocalizedLabels as refreshBiblePreviewLocalizedLabelsFlow } from "./src/ui/BiblePreviewLocalizedRefreshFlow";
import { closeBiblePreviewPane as closeBiblePreviewPaneFlow, createBiblePreviewPaneViewInput as createBiblePreviewPaneViewInputFlow, createFloatingBiblePreviewWindowInput as createFloatingBiblePreviewWindowInputFlow, handleBiblePreviewActiveLeafChange as handleBiblePreviewActiveLeafChangeFlow, handleBiblePreviewPanelEscapeKeydown as handleBiblePreviewPanelEscapeKeydownFlow, hideFloatingBiblePreview as hideFloatingBiblePreviewFlow, isFloatingPreviewTarget as isFloatingPreviewTargetFlow, refreshFloatingPreviewLabels as refreshFloatingPreviewLabelsFlow, scrollBiblePreview as scrollBiblePreviewFlow, showBiblePreviewContent as showBiblePreviewContentFlow, type BiblePreviewPluginFlowInput } from "./src/ui/BiblePreviewPluginFlow";

import type { BibleReadingModePreviewController } from "./src/ui/BibleReadingModePreviewController";
import type { ReferenceUsageController } from "./src/reference-usage/ReferenceUsageController";
import { findReferenceUsagesUnderCursor as findReferenceUsagesUnderCursorFlow, openReferenceUsagesPanelUnderCursor as openReferenceUsagesPanelUnderCursorFlow } from "./src/reference-usage/ReferenceUsageUnderCursorFlow";
import { countReferenceUsagesInChapter as countReferenceUsagesInChapterFlow, showReferenceUsagesForChapter as showReferenceUsagesForChapterFlow, showReferenceUsagesForPreviewBlock as showReferenceUsagesForPreviewBlockFlow } from "./src/reference-usage/ReferenceUsagePreviewBlockFlow";
import { createReferenceUsageController as createReferenceUsageControllerFlow, createReferenceUsageIndexService as createReferenceUsageIndexServiceFlow, createReferenceUsagePaneFlowInput as createReferenceUsagePaneFlowInputFlow, createReferenceUsagePreviewBlockFlowInput as createReferenceUsagePreviewBlockFlowInputFlow, createReferenceUsageUnderCursorFlowInput as createReferenceUsageUnderCursorFlowInputFlow, loadReferenceUsageIndexService as loadReferenceUsageIndexServiceFlow, registerReferenceUsageIndexEvents as registerReferenceUsageIndexEventsFlow, type ReferenceUsagePluginFlowInput } from "./src/reference-usage/ReferenceUsagePluginFlow";
import { buildReferenceUsageIndex as buildReferenceUsageIndexFlow, clearReferenceUsageIndex as clearReferenceUsageIndexFlow, getReferenceUsageExcludedFoldersText as getReferenceUsageExcludedFoldersTextFlow, isReferenceUsageIndexingEnabled as isReferenceUsageIndexingEnabledFlow, rebuildReferenceUsageIndex as rebuildReferenceUsageIndexFlow, setReferenceUsageAutoUpdate as setReferenceUsageAutoUpdateFlow, setReferenceUsageExcludedFoldersText as setReferenceUsageExcludedFoldersTextFlow, setReferenceUsageIndexingEnabled as setReferenceUsageIndexingEnabledFlow, shouldAutoUpdateReferenceUsageIndex as shouldAutoUpdateReferenceUsageIndexFlow, showReferenceUsageIndexStats as showReferenceUsageIndexStatsFlow, type ReferenceUsageSettingsFlowInput } from "./src/reference-usage/ReferenceUsageSettingsFlow";
import type { ReferenceUsageIndexService } from "./src/reference-usage/ReferenceUsageIndexService";
import { initializePluginLifecycle as initializePluginLifecycleFlow, type PluginLifecycleFlowInput } from "./src/lifecycle/PluginLifecycleFlow";
import { initializePluginStartup as initializePluginStartupFlow, type PluginStartupFlowInput } from "./src/lifecycle/PluginStartupFlow";
import { processReadingModeBibleReferences as processReadingModeBibleReferenceLinks, type ReadingModePluginFlowInput } from "./src/reading-mode/ReadingModePluginFlow";
import { findBibleReferenceMatchAtPosition as findEditorBibleReferenceMatchAtPosition, getCurrentParagraph as getCurrentEditorParagraph } from "./src/editor/EditorTextAnalysis";
import { getBibleReferenceMatchUnderCursorFromActiveEditor, type EditorReferenceUnderCursorInput } from "./src/editor/EditorReferenceUnderCursor";
import { analyzeReferenceText as analyzeReferenceTextFlow, buildBibleChapterContent as buildBibleChapterContentFlow, clearBibleReferenceLinks as clearBibleReferenceLinksFlow, createCursorExtension as createCursorExtensionFlow, rebuildBiblePreviewContent as rebuildBiblePreviewContentFlow, refreshBibleReferenceLinks as refreshBibleReferenceLinksFlow, toggleBiblePreviewComparison as toggleBiblePreviewComparisonFlow, type EditorPluginFlowInput } from "./src/editor/EditorPluginFlow";
import { createEditorRuntimeState } from "./src/editor/EditorRuntimeState";
import { dispatchEditorViewNoopUpdate } from "./src/editor/EditorViewFocus";
import { handleLinkOpenShortcutKeydown as handleLinkOpenShortcutKeydownFlow, openBibleReferenceUnderCursorFromActiveEditor as openBibleReferenceUnderCursorFromActiveEditorFlow, type EditorLinkOpenShortcutFlowInput } from "./src/editor/EditorLinkOpenShortcutFlow";
import { waitForNextAnimationFrame as waitForNextAnimationFrameFlow } from "./src/utils/AnimationFrame";




export default class BiblePlugin extends Plugin {
    private readonly context = new PluginContext(this);
    private readonly settingsService = new SettingsService(this.context, {
        refreshBibleReferenceLinks: () => refreshBibleReferenceLinksFlow(this.createEditorPluginFlowInput()),
        clearBibleReferenceLinks: () => clearBibleReferenceLinksFlow(this.createEditorPluginFlowInput()),
        dispatchEditorViewNoopUpdate: () => dispatchEditorViewNoopUpdate(this.editorRuntimeState.editorViews),
        refreshFloatingPreviewLabels: () => refreshFloatingPreviewLabelsFlow(this.createBiblePreviewPluginFlowInput()),
        refreshBiblePreviewLocalizedLabels: () => refreshBiblePreviewLocalizedLabelsFlow({
            app: this.app,
            previewControllers: this.editorRuntimeState.previewControllers.values(),
            readingModePreviewController: this.readingModePreviewController,
            refreshFloatingPreviewLabels: () => refreshFloatingPreviewLabelsFlow(this.createBiblePreviewPluginFlowInput()),
            createBiblePreviewPaneViewInput: () => createBiblePreviewPaneViewInputFlow(this.createBiblePreviewPluginFlowInput()),
        }),
        hideFloatingBiblePreview: (resetPosition) => hideFloatingBiblePreviewFlow(this.createBiblePreviewPluginFlowInput(), resetPosition),
        closeBiblePreviewPane: (options) => this.closeBiblePreviewPane(options),
        updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
    });
    private readonly translations = new TranslationService(this.context, {
        refreshVisibleBiblePreviewContent: () => this.refreshVisibleBiblePreviewContent(),
    });
    private readonly library = new BibleLibraryService(this.context, this.translations);
    private readingModePreviewController: BibleReadingModePreviewController | null = null;
    private floatingPreviewWindow: FloatingBiblePreviewWindow | null = null;
    private lastPanePreviewContent: BiblePreviewContent | null = null;
    private biblePreviewChapterState: BiblePreviewChapterState | null = null;
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
        this.context.onBookMappingChanged(() => refreshBibleReferenceLinksFlow(this.createEditorPluginFlowInput()));
        await initializePluginStartupFlow(this.createPluginStartupFlowInput());
    }

    onunload() { }

    private createPluginStartupFlowInput(): PluginStartupFlowInput {
        return {
            loadPluginSettings: () => this.context.loadSettings(),
            loadBibleIndex: () => this.library.loadBibleIndex(),
            loadReferenceUsageIndex: () => this.loadReferenceUsageIndex(),
            initializePluginLifecycle: () => initializePluginLifecycleFlow(this.createPluginLifecycleFlowInput()),
        };
    }

    private createSettingTabServices(): BiblePluginSettingTabServices {
        return {
            context: this.context,
            settings: this.settingsService,
            translations: this.translations,
            library: this.library,
            referenceUsage: {
                isReferenceUsageIndexingEnabled: () => this.isReferenceUsageIndexingEnabled(),
                setReferenceUsageIndexingEnabled: (value) => this.setReferenceUsageIndexingEnabled(value),
                shouldAutoUpdateReferenceUsageIndex: () => this.shouldAutoUpdateReferenceUsageIndex(),
                setReferenceUsageAutoUpdate: (value) => this.setReferenceUsageAutoUpdate(value),
                getReferenceUsageExcludedFoldersText: () => this.getReferenceUsageExcludedFoldersText(),
                setReferenceUsageExcludedFoldersText: (value) => this.setReferenceUsageExcludedFoldersText(value),
                buildReferenceUsageIndex: () => this.buildReferenceUsageIndex(),
                rebuildReferenceUsageIndex: () => this.rebuildReferenceUsageIndex(),
                showReferenceUsageIndexStats: () => this.showReferenceUsageIndexStats(),
                clearReferenceUsageIndex: () => this.clearReferenceUsageIndex(),
            },
        };
    }

    private createPluginLifecycleFlowInput(): PluginLifecycleFlowInput {
        return {
            addCommand: (command) => this.addCommand(command),
            addRibbonIcon: (icon, title, callback) => this.addRibbonIcon(icon, title, callback),
            addSettingTab: (tab) => this.addSettingTab(tab),
            analyzeReferenceText: (referenceText) => analyzeReferenceTextFlow(this.createEditorPluginFlowInput(), referenceText),
            buildReferenceUsageIndex: () => this.buildReferenceUsageIndex(),
            clearReferenceUsageIndex: () => this.clearReferenceUsageIndex(),
            createBiblePreviewPaneViewInput: () => createBiblePreviewPaneViewInputFlow(this.createBiblePreviewPluginFlowInput()),
            createCursorExtension: () => createCursorExtensionFlow(this.createEditorPluginFlowInput()),
            createFloatingPreviewWindowInput: () => createFloatingBiblePreviewWindowInputFlow(this.createBiblePreviewPluginFlowInput()),
            createReferenceUsagePaneViewInput: () => createReferenceUsagePaneFlowInputFlow(this.createReferenceUsagePluginFlowInput()).createReferenceUsagePaneViewInput(),
            findReferenceUsagesUnderCursor: () => this.findReferenceUsagesUnderCursor(),
            getLastPanePreviewContent: () => this.lastPanePreviewContent,
            getPluginActiveRibbonTitle: () => this.settingsService.getPluginActiveRibbonTitle(),
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            hideFloatingBiblePreview: () => hideFloatingBiblePreviewFlow(this.createBiblePreviewPluginFlowInput()),
            isFloatingPreviewTarget: (target) => isFloatingPreviewTargetFlow(this.createBiblePreviewPluginFlowInput(), target),
            isBiblePreviewChapterModeActive: () => this.isBiblePreviewChapterModeActive(),
            onActiveLeafChange: (activeLeaf) => this.handlePreviewActiveLeafChange(activeLeaf),
            openBibleIndexFolder: () => this.library.openBibleIndexFolder(),
            openBibleReferenceUnderCursorFromActiveEditor: (showNotice) => this.openBibleReferenceUnderCursorFromActiveEditor(showNotice),
            openEpubFilePicker: () => this.library.openEpubFilePicker(),
            openReferenceUsagesPanelUnderCursor: () => this.openReferenceUsagesPanelUnderCursor(),
            panelEscapeKeydownHandler: (event) => this.panelEscapeKeydownHandler(event),
            ownerPlugin: this,
            settingsTabInput: this.createSettingTabServices(),
            processReadingModeBibleReferences: (element, context) => this.processReadingModeBibleReferences(element, context),
            refreshFloatingPreviewLabels: () => refreshFloatingPreviewLabelsFlow(this.createBiblePreviewPluginFlowInput()),
            rebuildReferenceUsageIndex: () => this.rebuildReferenceUsageIndex(),
            registerDisposer: (disposer) => this.register(disposer),
            registerEditorExtension: (extension) => this.registerEditorExtension(extension),
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerGlobalLinkOpenShortcutHandler: () => this.registerGlobalLinkOpenShortcutHandler(),
            registerMarkdownPostProcessor: (postProcessor) => this.registerMarkdownPostProcessor(postProcessor),
            registerReferenceUsageIndexEvents: () => this.registerReferenceUsageIndexEvents(),
            registerView: (viewType, viewCreator) => this.registerView(viewType, viewCreator),
            reloadBibleIndex: () => this.library.reloadBibleIndex(),
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
            setSettingsTab: (settingsTab) => this.context.setSettingsTab(settingsTab),
            shouldAutoOpenPreviewOnVerseChange: () => this.settingsService.shouldAutoOpenPreviewOnVerseChange(),
            showBibleIndexStats: () => this.library.showBibleIndexStats(),
            showBiblePreviewContent: (content, anchor, options) => this.showBiblePreviewContent(content, anchor, options),
            showNoImportedTranslationsNotice: () => new Notice(this.context.t("notice.noImportedTranslations"), 2500),
            showReferenceUsageIndexStats: () => this.showReferenceUsageIndexStats(),
            togglePluginActive: () => this.settingsService.togglePluginActive(),
            translate: (key) => this.context.t(key),
            updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
        };
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
            interfaceLanguage: this.context.settings.interfaceLanguage,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: this.context.settings.previewPanelSide,
            isMobile: Platform.isMobileApp,
            getBibleIndexDataDirectoryPath: () => this.context.dataDirectoryPath,
            parseMatches: (text) => this.context.parseMatches(text),
            getReferenceUsageExcludedFolders: () => this.context.settings.referenceUsageExcludedFolders,
            isIndexingEnabled: () => this.context.settings.referenceUsageIndexingEnabled,
            isAutoUpdateEnabled: () => this.context.settings.referenceUsageAutoUpdate,
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            getReferenceUnderCursor: () => getBibleReferenceMatchUnderCursorFromActiveEditor(this.createEditorReferenceUnderCursorInput(true)),
            getReferenceUsageIndexService: () => this.getReferenceUsageIndexService(),
            getReferenceUsageController: () => this.getReferenceUsageController(),
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerDisposer: (disposer) => this.register(disposer),
            translate: (key, params) => this.context.t(key, params),
            refreshSettings: () => this.context.refreshSettingsTab(),
            waitForNextAnimationFrame: () => waitForNextAnimationFrameFlow(),
            setSuppressPreviewActiveLeafChange: (value) => {
                this.suppressPreviewActiveLeafChange = value;
            },
            onReferenceUsageIndexChanged: () => refreshChapterUsageCounts(
                activeDocument,
                (location) => countReferenceUsagesInChapterFlow(createReferenceUsagePreviewBlockFlowInputFlow(this.createReferenceUsagePluginFlowInput()), location),
            ),
        };
    }

    private async refreshVisibleBiblePreviewContent(): Promise<void> {
        const content = this.getCurrentBiblePreviewContent();
        if (content === null) {
            return;
        }

        const nextContent = await rebuildBiblePreviewContentFlow(this.createEditorPluginFlowInput(), content);
        if (nextContent !== null) {
            this.showBiblePreviewContent(nextContent, { type: "default" }, { reveal: false });
        }
    }

    private getCurrentBiblePreviewContent(): BiblePreviewContent | null {
        if (this.context.settings.previewDisplayMode === "side-panel") {
            return this.lastPanePreviewContent;
        }
        return this.floatingPreviewWindow?.getContent() ?? null;
    }

    private shouldRunBiblePreviewForEditor(_view?: unknown): boolean {
        // Central runtime gate. Future folder/file/frontmatter filters should be added here
        // so hot paths can keep a single early-exit check.
        return this.settingsService.isPluginActive();
    }

    private updatePluginActiveRibbonIcon(): void {
        if (this.pluginActiveRibbonIconEl === null) {
            return;
        }
        const isPluginActive = this.context.settings.isPluginActive;
        this.pluginActiveRibbonIconEl.setAttribute("aria-label", this.settingsService.getPluginActiveRibbonTitle());
        this.pluginActiveRibbonIconEl.classList.toggle("is-active", isPluginActive);
        this.pluginActiveRibbonIconEl.classList.toggle("is-muted", !isPluginActive);
    }

    private createReferenceUsageSettingsFlowInput(): ReferenceUsageSettingsFlowInput {
        const settings = this.context.settings;
        return {
            referenceUsageIndexingEnabled: settings.referenceUsageIndexingEnabled,
            referenceUsageAutoUpdate: settings.referenceUsageAutoUpdate,
            referenceUsageExcludedFolders: settings.referenceUsageExcludedFolders,
            setReferenceUsageIndexingEnabled: (referenceUsageIndexingEnabled) => this.context.updateSettings({ referenceUsageIndexingEnabled }),
            setReferenceUsageAutoUpdate: (referenceUsageAutoUpdate) => this.context.updateSettings({ referenceUsageAutoUpdate }),
            setReferenceUsageExcludedFolders: (referenceUsageExcludedFolders) => this.context.updateSettings({ referenceUsageExcludedFolders }),
            saveSettings: () => this.context.saveSettings(),
            refreshSettings: () => this.context.refreshSettingsTab(),
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
        await findReferenceUsagesUnderCursorFlow(createReferenceUsageUnderCursorFlowInputFlow(this.createReferenceUsagePluginFlowInput()));
    }

    public async openReferenceUsagesPanelUnderCursor(): Promise<void> {
        await openReferenceUsagesPanelUnderCursorFlow(createReferenceUsageUnderCursorFlowInputFlow(this.createReferenceUsagePluginFlowInput()));
    }

    private createEditorReferenceUnderCursorInput(showNotice: boolean): EditorReferenceUnderCursorInput {
        return {
            editorRuntimeState: this.editorRuntimeState,
            showNotice,
            isPluginActive: () => this.settingsService.isPluginActive(),
            parseMatches: (text) => this.context.parseMatches(text),
            parseReferenceMatches: (text) => this.context.parseMatches(text),
            translate: (key) => this.context.t(key),
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

    private createReadingModePluginFlowInput(): ReadingModePluginFlowInput {
        return {
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            parseMatches: (text) => this.context.parseMatches(text),
            getBibleReferenceLinkColor: () => this.settingsService.getBibleReferenceLinkColor(),
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
            isPluginActive: () => this.settingsService.isPluginActive(),
            shouldInterceptLinkOpenShortcut: () => this.settingsService.shouldInterceptLinkOpenShortcut(),
            getBibleLinkOpenShortcut: () => this.settingsService.getBibleLinkOpenShortcut(),
            translate: (key) => this.context.t(key),
        };
    }

    private handleLinkOpenShortcutKeydown(event: KeyboardEvent): void {
        handleLinkOpenShortcutKeydownFlow(this.createEditorLinkOpenShortcutFlowInput(), event);
    }

    private openBibleReferenceUnderCursorFromActiveEditor(showNotice: boolean): boolean {
        return openBibleReferenceUnderCursorFromActiveEditorFlow(this.createEditorLinkOpenShortcutFlowInput(), showNotice);
    }

    private createBiblePreviewPluginFlowInput(): BiblePreviewPluginFlowInput {
        return {
            app: this.app,
            isMobile: Platform.isMobileApp,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            getPreviewPanelSide: () => this.context.settings.previewPanelSide,
            getPreviewDisplayMode: () => this.context.settings.previewDisplayMode,
            setPreviewDisplayMode: (previewDisplayMode) => this.context.updateSettings({ previewDisplayMode }),
            saveSettings: () => this.context.saveSettings(),
            refreshSettings: () => this.context.refreshSettingsTab(),
            getActiveTranslationPreviewTitle: () => this.translations.getActiveTranslationPreviewTitle(),
            translate: (key, params) => this.context.t(key, params),
            getFloatingPreviewBackgroundColor: () => this.settingsService.getFloatingPreviewBackgroundColor(),
            isPreviewComparisonEnabled: () => this.context.settings.previewComparisonEnabled,
            getPreviewComparisonTranslationOptions: () => this.translations.getPreviewComparisonTranslationOptions(),
            showReferenceUsagesForPreviewBlock: (block) => void showReferenceUsagesForPreviewBlockFlow(createReferenceUsagePreviewBlockFlowInputFlow(this.createReferenceUsagePluginFlowInput()), block),
            getChapterUsageCount: (location) => countReferenceUsagesInChapterFlow(createReferenceUsagePreviewBlockFlowInputFlow(this.createReferenceUsagePluginFlowInput()), location),
            showReferenceUsagesForChapter: (location, title) => void showReferenceUsagesForChapterFlow(createReferenceUsagePreviewBlockFlowInputFlow(this.createReferenceUsagePluginFlowInput()), location, title),
            setComparisonTranslationEnabled: (translationId, enabled) => void this.translations.setComparisonTranslationEnabled(translationId, enabled),
            toggleBiblePreviewComparison: (content) => void toggleBiblePreviewComparisonFlow(this.createEditorPluginFlowInput(), content),
            openBiblePreviewChapter: (target, returnContent, returnScrollTop) => void this.openBiblePreviewChapter(target, returnContent, returnScrollTop),
            navigateBiblePreviewChapter: (location) => void this.navigateBiblePreviewChapter(location),
            backFromBiblePreviewChapter: () => backFromBiblePreviewChapterFlow(this.createBiblePreviewChapterFlowInput()),
            isBiblePreviewChapterHighlightHidden: () => isBiblePreviewChapterHighlightHiddenFlow(this.biblePreviewChapterState),
            setBiblePreviewChapterHighlightHidden: (hidden) => setBiblePreviewChapterHighlightHiddenFlow(this.createBiblePreviewChapterFlowInput(), hidden),
            showFloatingBiblePreview: (content, anchor, options) => this.floatingPreviewWindow?.show(content, anchor, options),
            scrollFloatingBiblePreview: (command) => {
                this.floatingPreviewWindow?.scrollPreview(command);
            },
            waitForNextFrame: () => waitForNextAnimationFrameFlow(),
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
            isClosePreviewOnActiveLeafChangeEnabled: () => this.context.settings.closePreviewOnActiveLeafChange,
            isPluginActive: () => this.settingsService.isPluginActive(),
            hideFloatingBiblePreview: (resetPosition) => this.floatingPreviewWindow?.hide(resetPosition),
            refreshFloatingPreviewLabels: (input) => this.floatingPreviewWindow?.refreshLabels(input),
            isFloatingPreviewTarget: (target) => this.floatingPreviewWindow?.containsTarget(target) ?? false,
        };
    }

    public showBiblePreviewContent(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        this.biblePreviewChapterState = trackShownBiblePreviewContentFlow(this.biblePreviewChapterState, content);
        showBiblePreviewContentFlow(this.createBiblePreviewPluginFlowInput(), content, anchor, options);
    }

    private async openBiblePreviewChapter(target: BibleChapterTarget, returnContent: BiblePreviewContent, returnScrollTop: number): Promise<void> {
        await openBiblePreviewChapterFlow(this.createBiblePreviewChapterFlowInput(), target, returnContent, returnScrollTop);
    }

    private async navigateBiblePreviewChapter(location: BibleChapterLocation): Promise<void> {
        await navigateBiblePreviewChapterFlow(this.createBiblePreviewChapterFlowInput(), location);
    }

    private createBiblePreviewChapterFlowInput(): BiblePreviewChapterFlowInput {
        return {
            getState: () => this.biblePreviewChapterState,
            setState: (state) => {
                this.biblePreviewChapterState = state;
            },
            buildChapterContent: (target) => buildBibleChapterContentFlow(this.createEditorPluginFlowInput(), target),
            showBiblePreviewContent: (content) => this.showBiblePreviewContent(content, { type: "default" }, { reveal: true }),
        };
    }

    private isBiblePreviewChapterModeActive(): boolean {
        const isPreviewVisible = this.context.settings.previewDisplayMode === "side-panel"
            ? getFirstWorkspaceLeafOfType(this.app, BIBLE_PREVIEW_VIEW_TYPE) !== null
            : this.floatingPreviewWindow?.isVisible() === true;
        return isPreviewVisible
            && isBiblePreviewChapterModeActiveFlow(this.biblePreviewChapterState, this.getCurrentBiblePreviewContent());
    }

    private async scrollBiblePreview(command: BiblePreviewScrollCommand): Promise<void> {
        await scrollBiblePreviewFlow(this.createBiblePreviewPluginFlowInput(), command);
    }

    private async closeBiblePreviewPane(options: { collapseSideDock?: boolean; requireActivePreview?: boolean } = {}): Promise<void> {
        await closeBiblePreviewPaneFlow(this.createBiblePreviewPluginFlowInput(), options);
    }
    private handlePanelEscapeKeydown(event: KeyboardEvent): void {
        handleBiblePreviewPanelEscapeKeydownFlow(this.createBiblePreviewPluginFlowInput(), event);
    }

    private handlePreviewActiveLeafChange(activeLeaf: WorkspaceLeaf | null): void {
        handleBiblePreviewActiveLeafChangeFlow(this.createBiblePreviewPluginFlowInput(), activeLeaf, {
            suppressPreviewActiveLeafChange: this.suppressPreviewActiveLeafChange,
        });
    }
    private createEditorPluginFlowInput(): EditorPluginFlowInput {
        return {
            app: this.app,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            editorRuntimeState: this.editorRuntimeState,
            getBibleIndex: () => this.context.bibleIndex,
            getBookMapping: () => this.context.bookMapping,
            getActiveV2Data: () => this.context.v2Data,
            getTranslationControllerState: () => this.translations.getControllerState(),
            getActiveTranslationId: () => this.context.activeTranslationId,
            getBibleReferenceLinkColor: () => this.settingsService.getBibleReferenceLinkColor(),
            shouldRunBiblePreviewForEditor: (view) => this.shouldRunBiblePreviewForEditor(view),
            getBiblePreviewTriggerMode: () => this.settingsService.getBiblePreviewTriggerMode(),
            getBiblePreviewDisplayMode: () => this.settingsService.getBiblePreviewDisplayMode(),
            shouldAutoOpenPreviewOnVerseChange: () => this.settingsService.shouldAutoOpenPreviewOnVerseChange(),
            isPreviewComparisonEnabled: () => this.context.settings.previewComparisonEnabled,
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            parseMatches: (text) => this.context.parseMatches(text),
            findBibleReferenceMatchAtPosition: (view, position) => findEditorBibleReferenceMatchAtPosition(view, position, (text) => this.context.parseMatches(text)),
            getCurrentParagraph: getCurrentEditorParagraph,
            setPreviewComparisonEnabled: (enabled) => this.settingsService.setPreviewComparisonEnabled(enabled),
            showBiblePreviewContent: (content, options) => this.showBiblePreviewContent(content, { type: "default" }, options),
            refreshFloatingPreviewLabels: () => refreshFloatingPreviewLabelsFlow(this.createBiblePreviewPluginFlowInput()),
            hideFloatingBiblePreview: () => hideFloatingBiblePreviewFlow(this.createBiblePreviewPluginFlowInput()),
            isBiblePreviewChapterModeActive: () => this.isBiblePreviewChapterModeActive(),
            getMissingVerseText: () => this.context.t("preview.missingVerse"),
            translate: (key) => this.context.t(key),
        };
    }


}




