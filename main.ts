import { Notice, Plugin } from "obsidian";
import { BiblePreviewContentBuilder } from "./src/application/BiblePreviewContentBuilder";
import { PluginContext } from "./src/core/PluginContext";
import { EditorService } from "./src/editor/EditorService";
import { BibleLibraryService } from "./src/import/BibleLibraryService";
import { registerPluginCommands } from "./src/lifecycle/PluginCommandRegistration";
import { processReadingModeBibleReferences } from "./src/reading-mode/ReadingModeBibleReferenceProcessor";
import { rerenderReadingModeViews } from "./src/reading-mode/ReadingModeRerender";
import { ReferenceUsageService, type ReferenceUsageReturnPoint } from "./src/reference-usage/ReferenceUsageService";
import { SettingsService } from "./src/settings/SettingsService";
import { TranslationService } from "./src/translations/TranslationService";
import { BiblePluginSettingTab } from "./src/ui/BiblePluginSettingTab";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView } from "./src/ui/BiblePreviewPaneView";
import { BiblePreviewService, type BiblePreviewReturnPoint } from "./src/ui/BiblePreviewService";
import { BibleReaderService } from "./src/reader/BibleReaderService";
import { BIBLE_READER_VIEW_TYPE, BibleReaderView } from "./src/ui/BibleReaderView";
import { BibleReadingModePreviewController } from "./src/ui/BibleReadingModePreviewController";
import { FloatingBiblePreviewWindow } from "./src/ui/FloatingBiblePreviewWindow";
import { REFERENCE_USAGE_VIEW_TYPE, ReferenceUsagePaneView } from "./src/ui/ReferenceUsagePaneView";

export default class BiblePlugin extends Plugin {
    private readonly context = new PluginContext(this);
    private readonly settingsService = new SettingsService(this.context, {
        refreshBibleReferenceLinks: () => this.editor.refreshLinks(),
        clearBibleReferenceLinks: () => this.editor.clearLinks(),
        dispatchEditorViewNoopUpdate: () => this.editor.dispatchNoopUpdate(),
        refreshFloatingPreviewLabels: () => this.preview.refreshFloatingLabels(),
        refreshBiblePreviewLocalizedLabels: () => {
            this.preview.refreshLocalizedLabels();
            void this.reader.refreshAll();
            this.editor.refreshLocalizedLabels();
            this.readingModePreviewController?.refreshLocalizedLabels();
        },
        hideFloatingBiblePreview: (resetPosition) => this.preview.hideFloating(resetPosition),
        closeBiblePreviewPane: (options) => this.preview.closePane(options),
        closeReferenceUsagePane: () => this.referenceUsage.closePane(),
        updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
    });
    private readonly translations = new TranslationService(this.context, {
        refreshVisibleBiblePreviewContent: async () => {
            await this.preview.refreshVisibleContent();
            await this.reader.refreshAll();
        },
    });
    private readonly contentBuilder = new BiblePreviewContentBuilder(this.context, this.translations);
    private readonly library = new BibleLibraryService(this.context, this.translations);
    private readonly preview: BiblePreviewService = new BiblePreviewService(this.context, this.settingsService, this.translations, this.contentBuilder, {
        showReferenceUsagesForPreviewBlock: (block, returnPoint) => void this.referenceUsage.showUsagesForPreviewBlock(block, this.toUsagesReturnPoint(returnPoint)),
        openChapterInReader: (target, translationId, newTab) => void this.reader.openChapter(target, translationId, { newTab }),
        refreshReaders: () => void this.reader.refreshAll(),
    });
    private readonly reader: BibleReaderService = new BibleReaderService(this.context, this.settingsService, this.translations, this.contentBuilder, {
        revealPreview: () => void this.preview.reveal(),
        refreshPreview: () => void this.preview.refreshVisibleContent(),
        showUsagesForPreviewBlock: (block, returnPoint) => void this.referenceUsage.showUsagesForPreviewBlock(block, returnPoint),
        getChapterUsageCount: (location) => this.referenceUsage.countUsagesInChapter(location),
        showUsagesForChapter: (location, title, returnPoint) => void this.referenceUsage.showUsagesForChapter(location, title, returnPoint),
    });
    private readonly editor = new EditorService(this.context, this.settingsService, this.contentBuilder, this.preview);
    private readonly referenceUsage = new ReferenceUsageService(this.context, this.editor, this.preview);
    private readingModePreviewController: BibleReadingModePreviewController | null = null;
    private readonly windowListenerDisposers = new Map<Window, () => void>();
    private pluginActiveRibbonIconEl: HTMLElement | null = null;
    private layoutReady = false;
    private parserChangeTimeout: number | null = null;

    async onload() {
        // Enabled in a running app (or reloaded after an update): open reading views were rendered without the plugin.
        const enabledAfterLayoutReady = this.app.workspace.layoutReady;
        this.context.onBookMappingChanged(() => {
            this.editor.refreshLinks();
            this.scheduleParserChangeHandling();
        });
        await this.context.loadSettings();
        await this.library.loadBibleIndex();
        await this.referenceUsage.load();

        const floatingWindow = new FloatingBiblePreviewWindow(this.preview.createFloatingWindowInput());
        this.register(() => floatingWindow.destroy());
        this.preview.setFloatingWindow(floatingWindow);

        this.registerViews();
        registerPluginCommands(this, {
            context: this.context,
            settings: this.settingsService,
            library: this.library,
            preview: this.preview,
            reader: this.reader,
            referenceUsage: this.referenceUsage,
            editor: this.editor,
        });
        this.addRibbonIcon("book-open-text", this.context.t("command.openBibleReader"), () => void this.reader.openReader());

        this.pluginActiveRibbonIconEl = this.addRibbonIcon(
            "book-open",
            this.settingsService.getPluginActiveRibbonTitle(),
            () => void this.settingsService.togglePluginActive(),
        );
        this.updatePluginActiveRibbonIcon();

        this.readingModePreviewController = this.createReadingModePreviewController();

        const settingsTab = new BiblePluginSettingTab(this.app, this, {
            context: this.context,
            settings: this.settingsService,
            translations: this.translations,
            library: this.library,
            referenceUsage: this.referenceUsage,
        });
        this.addSettingTab(settingsTab);
        this.context.setSettingsTab(settingsTab);

        this.registerEvent(this.app.workspace.on("active-leaf-change", (activeLeaf) => {
            this.reader.handleActiveLeafChange(activeLeaf);
            this.preview.handleActiveLeafChange(activeLeaf);
        }));
        // The main window and every popout window get the same keyboard and pointer listeners.
        this.registerWindowListeners(window);
        this.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, popoutWindow) => this.registerWindowListeners(popoutWindow)));
        this.registerEvent(this.app.workspace.on("window-close", (_workspaceWindow, popoutWindow) => {
            this.unregisterWindowListeners(popoutWindow);
            this.preview.handleWindowClose(popoutWindow);
        }));
        this.register(() => {
            for (const dispose of this.windowListenerDisposers.values()) dispose();
            this.windowListenerDisposers.clear();
        });

        this.registerMarkdownPostProcessor((element) => processReadingModeBibleReferences({
            element,
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            parseMatches: (text) => this.context.parseMatches(text),
            getBibleReferenceLinkColor: () => this.settingsService.getBibleReferenceLinkColor(),
            openBibleReference: (anchorEl, referenceText) => this.readingModePreviewController?.open(anchorEl, referenceText),
        }));
        this.registerEditorExtension(this.editor.createExtension());
        this.referenceUsage.registerVaultEvents(this);
        this.register(() => {
            if (this.parserChangeTimeout !== null) window.clearTimeout(this.parserChangeTimeout);
        });
        this.app.workspace.onLayoutReady(() => {
            this.layoutReady = true;
            if (enabledAfterLayoutReady) rerenderReadingModeViews(this.app);
            // The index may be outdated after a plugin update that changed the parser.
            this.referenceUsage.handleParserChanged();
        });
    }

    onunload() { }

    // One pass for a burst of changes (an import sets the data, the order and the active translation in a row).
    // Skipped while loading: the startup check runs on layout ready.
    private scheduleParserChangeHandling(): void {
        if (!this.layoutReady || this.parserChangeTimeout !== null) return;
        this.parserChangeTimeout = window.setTimeout(() => {
            this.parserChangeTimeout = null;
            rerenderReadingModeViews(this.app);
            this.referenceUsage.handleParserChanged();
        }, 0);
    }

    private registerViews(): void {
        this.registerView(BIBLE_PREVIEW_VIEW_TYPE, (leaf) => {
            const view = new BiblePreviewPaneView(leaf, this.preview.createPaneViewInput());
            const lastPaneContent = this.preview.getLastPaneContent();
            if (lastPaneContent !== null) {
                window.setTimeout(() => view.setContent(lastPaneContent), 0);
            }
            return view;
        });
        this.registerView(BIBLE_READER_VIEW_TYPE, (leaf) => new BibleReaderView(leaf, this.reader.createViewInput()));
        this.registerView(REFERENCE_USAGE_VIEW_TYPE, (leaf) => new ReferenceUsagePaneView(leaf, this.referenceUsage.createPaneViewInput()));
    }

    private registerWindowListeners(targetWindow: Window): void {
        if (this.windowListenerDisposers.has(targetWindow)) return;
        const targetDocument = targetWindow.document;
        // Capture phase, so the plugin sees the keys before the editor handles them.
        const escapeKeydownHandler = (event: KeyboardEvent) => this.preview.handleEscapeKeydown(event);
        const linkOpenShortcutKeydownHandler = (event: KeyboardEvent) => this.editor.handleLinkOpenShortcutKeydown(event);
        const pointerDownHandler = (event: PointerEvent) => this.readingModePreviewController?.handlePointerDown(event);
        targetDocument.addEventListener("keydown", escapeKeydownHandler, true);
        targetWindow.addEventListener("keydown", linkOpenShortcutKeydownHandler, true);
        targetDocument.addEventListener("pointerdown", pointerDownHandler, true);
        this.windowListenerDisposers.set(targetWindow, () => {
            targetDocument.removeEventListener("keydown", escapeKeydownHandler, true);
            targetWindow.removeEventListener("keydown", linkOpenShortcutKeydownHandler, true);
            targetDocument.removeEventListener("pointerdown", pointerDownHandler, true);
        });
    }

    private unregisterWindowListeners(targetWindow: Window): void {
        this.windowListenerDisposers.get(targetWindow)?.();
        this.windowListenerDisposers.delete(targetWindow);
    }

    private createReadingModePreviewController(): BibleReadingModePreviewController {
        return new BibleReadingModePreviewController({
            showBiblePreviewContent: (content, anchor, options) => this.preview.show(content, anchor, options),
            shouldAutoOpenPreviewOnVerseChange: () => this.settingsService.shouldAutoOpenPreviewOnVerseChange(),
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            analyzeReferenceText: (referenceText) => this.contentBuilder.analyze(referenceText),
            showNoImportedTranslationsNotice: () => new Notice(this.context.t("notice.noImportedTranslations"), 2500),
            refreshFloatingPreviewLabels: () => this.preview.refreshFloatingLabels(),
            isFloatingPreviewTarget: (target) => this.preview.isFloatingTarget(target),
            hideFloatingBiblePreview: () => this.preview.hideFloating(),
        });
    }

    private toUsagesReturnPoint(point: BiblePreviewReturnPoint | null): ReferenceUsageReturnPoint | null {
        return point === null ? null : { kind: "reference", run: () => this.preview.returnTo(point) };
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
}
