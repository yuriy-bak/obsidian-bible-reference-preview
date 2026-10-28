import { Notice, Plugin } from "obsidian";
import { BiblePreviewContentBuilder } from "./src/application/BiblePreviewContentBuilder";
import { PluginContext } from "./src/core/PluginContext";
import { EditorService } from "./src/editor/EditorService";
import { BibleLibraryService } from "./src/import/BibleLibraryService";
import { registerPluginCommands } from "./src/lifecycle/PluginCommandRegistration";
import { processReadingModeBibleReferences } from "./src/reading-mode/ReadingModeBibleReferenceProcessor";
import { ReferenceUsageService } from "./src/reference-usage/ReferenceUsageService";
import { SettingsService } from "./src/settings/SettingsService";
import { TranslationService } from "./src/translations/TranslationService";
import { BiblePluginSettingTab } from "./src/ui/BiblePluginSettingTab";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView } from "./src/ui/BiblePreviewPaneView";
import { BiblePreviewService } from "./src/ui/BiblePreviewService";
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
            this.editor.refreshLocalizedLabels();
            this.readingModePreviewController?.refreshLocalizedLabels();
        },
        hideFloatingBiblePreview: (resetPosition) => this.preview.hideFloating(resetPosition),
        closeBiblePreviewPane: (options) => this.preview.closePane(options),
        updatePluginActiveRibbonIcon: () => this.updatePluginActiveRibbonIcon(),
    });
    private readonly translations = new TranslationService(this.context, {
        refreshVisibleBiblePreviewContent: () => this.preview.refreshVisibleContent(),
    });
    private readonly contentBuilder = new BiblePreviewContentBuilder(this.context, this.translations);
    private readonly library = new BibleLibraryService(this.context, this.translations);
    private readonly preview: BiblePreviewService = new BiblePreviewService(this.context, this.settingsService, this.translations, this.contentBuilder, {
        showReferenceUsagesForPreviewBlock: (block) => void this.referenceUsage.showUsagesForPreviewBlock(block),
        getChapterUsageCount: (location) => this.referenceUsage.countUsagesInChapter(location),
        showReferenceUsagesForChapter: (location, title) => void this.referenceUsage.showUsagesForChapter(location, title),
    });
    private readonly editor = new EditorService(this.context, this.settingsService, this.contentBuilder, this.preview);
    private readonly referenceUsage = new ReferenceUsageService(this.context, this.editor, this.preview);
    private readingModePreviewController: BibleReadingModePreviewController | null = null;
    private pluginActiveRibbonIconEl: HTMLElement | null = null;

    async onload() {
        this.context.onBookMappingChanged(() => this.editor.refreshLinks());
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
            referenceUsage: this.referenceUsage,
            editor: this.editor,
        });

        this.pluginActiveRibbonIconEl = this.addRibbonIcon(
            "book-open",
            this.settingsService.getPluginActiveRibbonTitle(),
            () => void this.settingsService.togglePluginActive(),
        );
        this.updatePluginActiveRibbonIcon();

        const readingModePreviewController = this.createReadingModePreviewController();
        this.register(() => readingModePreviewController.destroy());
        this.readingModePreviewController = readingModePreviewController;

        const settingsTab = new BiblePluginSettingTab(this.app, this, {
            context: this.context,
            settings: this.settingsService,
            translations: this.translations,
            library: this.library,
            referenceUsage: this.referenceUsage,
        });
        this.addSettingTab(settingsTab);
        this.context.setSettingsTab(settingsTab);

        this.registerEvent(this.app.workspace.on("active-leaf-change", (activeLeaf) => this.preview.handleActiveLeafChange(activeLeaf)));
        // Capture phase, so the plugin sees the keys before the editor handles them.
        const escapeKeydownHandler = (event: KeyboardEvent) => this.preview.handleEscapeKeydown(event);
        document.addEventListener("keydown", escapeKeydownHandler, true);
        this.register(() => document.removeEventListener("keydown", escapeKeydownHandler, true));
        const linkOpenShortcutKeydownHandler = (event: KeyboardEvent) => this.editor.handleLinkOpenShortcutKeydown(event);
        window.addEventListener("keydown", linkOpenShortcutKeydownHandler, true);
        this.register(() => window.removeEventListener("keydown", linkOpenShortcutKeydownHandler, true));

        this.registerMarkdownPostProcessor((element) => processReadingModeBibleReferences({
            element,
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            parseMatches: (text) => this.context.parseMatches(text),
            getBibleReferenceLinkColor: () => this.settingsService.getBibleReferenceLinkColor(),
            openBibleReference: (anchorEl, referenceText) => this.readingModePreviewController?.open(anchorEl, referenceText),
        }));
        this.registerEditorExtension(this.editor.createExtension());
        this.referenceUsage.registerVaultEvents(this);
    }

    onunload() { }

    private registerViews(): void {
        this.registerView(BIBLE_PREVIEW_VIEW_TYPE, (leaf) => {
            const view = new BiblePreviewPaneView(leaf, this.preview.createPaneViewInput());
            const lastPaneContent = this.preview.getLastPaneContent();
            if (lastPaneContent !== null) {
                window.setTimeout(() => view.setContent(lastPaneContent), 0);
            }
            return view;
        });
        this.registerView(REFERENCE_USAGE_VIEW_TYPE, (leaf) => new ReferenceUsagePaneView(leaf, this.referenceUsage.createPaneViewInput()));
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
            isBiblePreviewChapterModeActive: () => this.preview.isChapterModeActive(),
        });
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
