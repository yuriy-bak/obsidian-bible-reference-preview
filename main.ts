
import { Notice, Plugin, type MarkdownPostProcessorContext } from "obsidian";
import { PluginContext } from "./src/core/PluginContext";
import { SettingsService } from "./src/settings/SettingsService";
import { TranslationService } from "./src/translations/TranslationService";
import { BibleLibraryService } from "./src/import/BibleLibraryService";
import type { BiblePluginSettingTabServices } from "./src/ui/BiblePluginSettingTab";
import { BIBLE_PREVIEW_VIEW_TYPE } from "./src/ui/BiblePreviewPaneView";
import { BiblePreviewService } from "./src/ui/BiblePreviewService";
import { ReferenceUsageService } from "./src/reference-usage/ReferenceUsageService";
import { refreshEditorPreviewControllerLocalizedLabels } from "./src/editor/EditorPreviewControllerRegistration";

import type { BibleReadingModePreviewController } from "./src/ui/BibleReadingModePreviewController";
import { initializePluginLifecycle as initializePluginLifecycleFlow, type PluginLifecycleFlowInput } from "./src/lifecycle/PluginLifecycleFlow";
import { initializePluginStartup as initializePluginStartupFlow, type PluginStartupFlowInput } from "./src/lifecycle/PluginStartupFlow";
import { processReadingModeBibleReferences as processReadingModeBibleReferenceLinks, type ReadingModePluginFlowInput } from "./src/reading-mode/ReadingModePluginFlow";
import { findBibleReferenceMatchAtPosition as findEditorBibleReferenceMatchAtPosition, getCurrentParagraph as getCurrentEditorParagraph } from "./src/editor/EditorTextAnalysis";
import { getBibleReferenceMatchUnderCursorFromActiveEditor, type EditorReferenceUnderCursorInput } from "./src/editor/EditorReferenceUnderCursor";
import { analyzeReferenceText as analyzeReferenceTextFlow, buildBibleChapterContent as buildBibleChapterContentFlow, clearBibleReferenceLinks as clearBibleReferenceLinksFlow, createCursorExtension as createCursorExtensionFlow, rebuildBiblePreviewContent as rebuildBiblePreviewContentFlow, refreshBibleReferenceLinks as refreshBibleReferenceLinksFlow, toggleBiblePreviewComparison as toggleBiblePreviewComparisonFlow, type EditorPluginFlowInput } from "./src/editor/EditorPluginFlow";
import { createEditorRuntimeState } from "./src/editor/EditorRuntimeState";
import { dispatchEditorViewNoopUpdate } from "./src/editor/EditorViewFocus";
import { handleLinkOpenShortcutKeydown as handleLinkOpenShortcutKeydownFlow, openBibleReferenceUnderCursorFromActiveEditor as openBibleReferenceUnderCursorFromActiveEditorFlow, type EditorLinkOpenShortcutFlowInput } from "./src/editor/EditorLinkOpenShortcutFlow";




export default class BiblePlugin extends Plugin {
    private readonly context = new PluginContext(this);
    private readonly settingsService = new SettingsService(this.context, {
        refreshBibleReferenceLinks: () => refreshBibleReferenceLinksFlow(this.createEditorPluginFlowInput()),
        clearBibleReferenceLinks: () => clearBibleReferenceLinksFlow(this.createEditorPluginFlowInput()),
        dispatchEditorViewNoopUpdate: () => dispatchEditorViewNoopUpdate(this.editorRuntimeState.editorViews),
        refreshFloatingPreviewLabels: () => this.preview.refreshFloatingLabels(),
        refreshBiblePreviewLocalizedLabels: () => {
            this.preview.refreshLocalizedLabels();
            refreshEditorPreviewControllerLocalizedLabels(this.editorRuntimeState.previewControllers.values());
            this.readingModePreviewController?.refreshLocalizedLabels();
        },
        hideFloatingBiblePreview: (resetPosition) => this.preview.hideFloating(resetPosition),
        closeBiblePreviewPane: (options) => this.preview.closePane(options),
        updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
    });
    private readonly translations = new TranslationService(this.context, {
        refreshVisibleBiblePreviewContent: () => this.preview.refreshVisibleContent(),
    });
    private readonly library = new BibleLibraryService(this.context, this.translations);
    private readonly preview: BiblePreviewService = new BiblePreviewService(this.context, this.settingsService, this.translations, {
        rebuildContent: (content) => rebuildBiblePreviewContentFlow(this.createEditorPluginFlowInput(), content),
        buildChapterContent: (target) => buildBibleChapterContentFlow(this.createEditorPluginFlowInput(), target),
        toggleComparison: (content) => toggleBiblePreviewComparisonFlow(this.createEditorPluginFlowInput(), content),
        showReferenceUsagesForPreviewBlock: (block) => void this.referenceUsage.showUsagesForPreviewBlock(block),
        getChapterUsageCount: (location) => this.referenceUsage.countUsagesInChapter(location),
        showReferenceUsagesForChapter: (location, title) => void this.referenceUsage.showUsagesForChapter(location, title),
    });
    private readonly referenceUsage: ReferenceUsageService = new ReferenceUsageService(this.context, {
        getReferenceUnderCursor: () => getBibleReferenceMatchUnderCursorFromActiveEditor(this.createEditorReferenceUnderCursorInput(true)),
        setSuppressPreviewActiveLeafChange: (value) => this.preview.setSuppressActiveLeafChange(value),
    });
    private readingModePreviewController: BibleReadingModePreviewController | null = null;
    private pluginActiveRibbonIconEl: HTMLElement | null = null;
    private readonly editorRuntimeState = createEditorRuntimeState();
    private readonly linkOpenShortcutKeydownHandler = (event: KeyboardEvent) => this.handleLinkOpenShortcutKeydown(event);
    private readonly panelEscapeKeydownHandler = (event: KeyboardEvent) => this.preview.handleEscapeKeydown(event);

    async onload() {
        this.context.onBookMappingChanged(() => refreshBibleReferenceLinksFlow(this.createEditorPluginFlowInput()));
        await initializePluginStartupFlow(this.createPluginStartupFlowInput());
    }

    onunload() { }

    private createPluginStartupFlowInput(): PluginStartupFlowInput {
        return {
            loadPluginSettings: () => this.context.loadSettings(),
            loadBibleIndex: () => this.library.loadBibleIndex(),
            loadReferenceUsageIndex: () => this.referenceUsage.load(),
            initializePluginLifecycle: () => initializePluginLifecycleFlow(this.createPluginLifecycleFlowInput()),
        };
    }

    private createSettingTabServices(): BiblePluginSettingTabServices {
        return {
            context: this.context,
            settings: this.settingsService,
            translations: this.translations,
            library: this.library,
            referenceUsage: this.referenceUsage,
        };
    }

    private createPluginLifecycleFlowInput(): PluginLifecycleFlowInput {
        return {
            addCommand: (command) => this.addCommand(command),
            addRibbonIcon: (icon, title, callback) => this.addRibbonIcon(icon, title, callback),
            addSettingTab: (tab) => this.addSettingTab(tab),
            analyzeReferenceText: (referenceText) => analyzeReferenceTextFlow(this.createEditorPluginFlowInput(), referenceText),
            buildReferenceUsageIndex: () => this.referenceUsage.buildReferenceUsageIndex(),
            clearReferenceUsageIndex: () => this.referenceUsage.clearReferenceUsageIndex(),
            createBiblePreviewPaneViewInput: () => this.preview.createPaneViewInput(),
            createCursorExtension: () => createCursorExtensionFlow(this.createEditorPluginFlowInput()),
            createFloatingPreviewWindowInput: () => this.preview.createFloatingWindowInput(),
            createReferenceUsagePaneViewInput: () => this.referenceUsage.createPaneViewInput(),
            findReferenceUsagesUnderCursor: () => this.referenceUsage.findUsagesUnderCursor(),
            getLastPanePreviewContent: () => this.preview.getLastPaneContent(),
            getPluginActiveRibbonTitle: () => this.settingsService.getPluginActiveRibbonTitle(),
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            hideFloatingBiblePreview: () => this.preview.hideFloating(),
            isFloatingPreviewTarget: (target) => this.preview.isFloatingTarget(target),
            isBiblePreviewChapterModeActive: () => this.preview.isChapterModeActive(),
            onActiveLeafChange: (activeLeaf) => this.preview.handleActiveLeafChange(activeLeaf),
            openBibleIndexFolder: () => this.library.openBibleIndexFolder(),
            openBibleReferenceUnderCursorFromActiveEditor: (showNotice) => this.openBibleReferenceUnderCursorFromActiveEditor(showNotice),
            openEpubFilePicker: () => this.library.openEpubFilePicker(),
            openReferenceUsagesPanelUnderCursor: () => this.referenceUsage.openUsagesPanelUnderCursor(),
            panelEscapeKeydownHandler: (event) => this.panelEscapeKeydownHandler(event),
            ownerPlugin: this,
            settingsTabInput: this.createSettingTabServices(),
            processReadingModeBibleReferences: (element, context) => this.processReadingModeBibleReferences(element, context),
            refreshFloatingPreviewLabels: () => this.preview.refreshFloatingLabels(),
            rebuildReferenceUsageIndex: () => this.referenceUsage.rebuildReferenceUsageIndex(),
            registerDisposer: (disposer) => this.register(disposer),
            registerEditorExtension: (extension) => this.registerEditorExtension(extension),
            registerEvent: (eventRef) => this.registerEvent(eventRef),
            registerGlobalLinkOpenShortcutHandler: () => this.registerGlobalLinkOpenShortcutHandler(),
            registerMarkdownPostProcessor: (postProcessor) => this.registerMarkdownPostProcessor(postProcessor),
            registerReferenceUsageIndexEvents: () => this.referenceUsage.registerVaultEvents(this),
            registerView: (viewType, viewCreator) => this.registerView(viewType, viewCreator),
            reloadBibleIndex: () => this.library.reloadBibleIndex(),
            scrollBiblePreview: (command) => this.preview.scroll(command),
            setFloatingPreviewWindow: (floatingPreviewWindow) => this.preview.setFloatingWindow(floatingPreviewWindow),
            setPluginActiveRibbonIcon: (pluginActiveRibbonIconEl) => {
                this.pluginActiveRibbonIconEl = pluginActiveRibbonIconEl;
            },
            setReadingModePreviewController: (readingModePreviewController) => {
                this.readingModePreviewController = readingModePreviewController;
            },
            setSettingsTab: (settingsTab) => this.context.setSettingsTab(settingsTab),
            shouldAutoOpenPreviewOnVerseChange: () => this.settingsService.shouldAutoOpenPreviewOnVerseChange(),
            showBibleIndexStats: () => this.library.showBibleIndexStats(),
            showBiblePreviewContent: (content, anchor, options) => this.preview.show(content, anchor, options),
            showNoImportedTranslationsNotice: () => new Notice(this.context.t("notice.noImportedTranslations"), 2500),
            showReferenceUsageIndexStats: () => this.referenceUsage.showReferenceUsageIndexStats(),
            togglePluginActive: () => this.settingsService.togglePluginActive(),
            translate: (key) => this.context.t(key),
            updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
        };
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
            showBiblePreviewContent: (content, options) => this.preview.show(content, { type: "default" }, options),
            refreshFloatingPreviewLabels: () => this.preview.refreshFloatingLabels(),
            hideFloatingBiblePreview: () => this.preview.hideFloating(),
            isBiblePreviewChapterModeActive: () => this.preview.isChapterModeActive(),
            getMissingVerseText: () => this.context.t("preview.missingVerse"),
            translate: (key) => this.context.t(key),
        };
    }


}




