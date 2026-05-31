
import { App, MarkdownView, Notice, Platform, Plugin, TFile, type MarkdownPostProcessorContext, type WorkspaceLeaf } from "obsidian";
import type { BibleIndex } from "./src/infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import type { BibleReference } from "./src/domain/BibleReference";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createBookMapping } from "./src/parsing/BookMapping";
import { getBibleTextBlocks } from "./src/application/getBibleTexts";
import { BiblePreviewComparisonBlock, BiblePreviewComparisonInput, BiblePreviewContent, BiblePreviewReferenceBlock, formatBibleComparisonTextBlocks, formatBibleTextBlocks } from "./src/application/formatBibleTexts";
import { isEpubImportAbortError } from "./src/infrastructure/epub/JsZipEpubBibleImporter";
import { ObsidianBibleIndexV2Repository } from "./src/infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "./src/infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { BiblePluginLocale, I18nKey, t } from "./src/i18n/I18n";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow, FloatingBiblePreviewWindowInput } from "./src/ui/FloatingBiblePreviewWindow";
import { DEFAULT_BIBLE_REFERENCE_LINK_COLOR, DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR, normalizeBibleReferenceLinkColor, normalizeFloatingPreviewBackgroundColor } from "./src/ui/cssColorValidation";
import { CssColorDialog, createBackgroundColorPresets, type CssColorDialogInput } from "./src/ui/CssColorDialog";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, BiblePreviewPaneViewInput, type BiblePreviewScrollCommand } from "./src/ui/BiblePreviewPaneView";
import { REFERENCE_USAGE_VIEW_TYPE, ReferenceUsagePaneView, ReferenceUsagePaneViewInput } from "./src/ui/ReferenceUsagePaneView";
import type { BiblePluginSettingTab } from "./src/ui/BiblePluginSettingTab";

import { ReferenceUsageResultsModal } from "./src/ui/ReferenceUsageResultsModal";
import type { BibleReadingModePreviewController } from "./src/ui/BibleReadingModePreviewController";
import { ReferenceUsageController } from "./src/reference-usage/ReferenceUsageController";
import { findReferenceUsagesUnderCursor as findReferenceUsagesUnderCursorFlow, openReferenceUsagesPanelUnderCursor as openReferenceUsagesPanelUnderCursorFlow, type ReferenceUsageUnderCursorFlowInput } from "./src/reference-usage/ReferenceUsageUnderCursorFlow";
import { ReferenceUsageIndexService, REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES, REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES, type ReferenceUsageIndexServiceOptions, type ReferenceUsageSearchResult, normalizeReferenceUsageExcludedFolders } from "./src/reference-usage/ReferenceUsageIndexService";
import { TranslationController, type TranslationControllerState } from "./src/translations/TranslationController";
import type { PreviewComparisonTranslationOption, TranslationSettingsItem } from "./src/translations/TranslationModels";
import { BiblePreviewAnalyzer, type BiblePreviewAnalyzerInput } from "./src/application/BiblePreviewAnalyzer";
import { DEFAULT_SETTINGS, normalizePluginSettings, type BibleLinkOpenShortcut, type BiblePluginSettings, type BiblePreviewDisplayMode, type BiblePreviewPanelSide, type BiblePreviewTriggerMode } from "./src/settings/PluginSettings";
import { executePreparedEpubImport, prepareEpubImportSettings } from "./src/import/EpubImportFlow";
import { formatBibleIndexV2StatsNotice, formatEpubImportSuccessNotice, formatLastImportReportNotice, localizeImportErrorMessage } from "./src/import/EpubImportMessages";
import { ensureVaultDirectoryExists } from "./src/infrastructure/VaultPathUtils";
import { registerPluginActiveRibbonIcon, registerPluginCommands } from "./src/lifecycle/PluginCommandRegistration";
import { registerPluginViews } from "./src/lifecycle/PluginViewRegistration";
import { initializeFloatingPreviewWindow, initializeReadingModePreviewController } from "./src/lifecycle/PluginPreviewInitialization";
import { initializeSettingsTab, registerWorkspaceAndKeyboardHandlers } from "./src/lifecycle/PluginUiInitialization";
import { registerContentProcessingExtensions } from "./src/lifecycle/PluginContentRegistration";
import { processReadingModeBibleReferences as processReadingModeBibleReferenceLinks } from "./src/reading-mode/ReadingModeBibleReferenceProcessor";
import { findBibleReferenceMatchAtPosition as findEditorBibleReferenceMatchAtPosition, getCurrentParagraph as getCurrentEditorParagraph } from "./src/editor/EditorTextAnalysis";
import { getBibleReferenceMatchUnderCursorFromActiveEditor, type EditorReferenceUnderCursorInput } from "./src/editor/EditorReferenceUnderCursor";
import { clearEditorReferenceLinks, createEditorReferenceLinkDecorations, type EditorReferenceLinkDecorationFlowInput, refreshEditorReferenceLinks } from "./src/editor/EditorReferenceLinkDecorationFlow";
import { refreshEditorPreviewControllerLocalizedLabels } from "./src/editor/EditorPreviewControllerRegistration";
import { createEditorCursorExtension } from "./src/editor/EditorCursorExtension";
import { createEditorRuntimeState } from "./src/editor/EditorRuntimeState";
import { dispatchEditorViewNoopUpdate, findFocusedEditorPreviewController } from "./src/editor/EditorViewFocus";


const EMPTY_BIBLE_INDEX: BibleIndex = {
    async getBibleText() {
        return null;
    },
};

type BiblePreviewSideDock = {
    collapsed?: boolean;
    collapse?(): void;
    expand?(): void;
    activeLeaf?: WorkspaceLeaf;
    activeTab?: { leaf?: WorkspaceLeaf };
    setActiveLeaf?(leaf: WorkspaceLeaf): void;
};
type BiblePreviewWorkspaceReveal = {
    revealLeaf?(leaf: WorkspaceLeaf): Promise<void> | void;
};
type BiblePreviewWorkspaceFocus = {
    setActiveLeaf?(leaf: WorkspaceLeaf, params?: { focus?: boolean }): void;
};
type BiblePreviewWorkspaceLeafIterator = {
    iterateAllLeaves?(callback: (leaf: WorkspaceLeaf) => void): void;
};

const DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR = "#7c3aed";
const DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR = "#e6e2d8";


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
            createReferenceUsagePaneViewInput: () => this.createReferenceUsagePaneViewInput(),
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

    private getReferenceUsageIndexServiceOptions(): ReferenceUsageIndexServiceOptions {
        return Platform.isMobileApp
            ? {
                maxMarkdownFileSizeBytes: REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
                buildYieldEveryFiles: REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES,
            }
            : {};
    }

    private async loadReferenceUsageIndex(): Promise<void> {
        this.referenceUsageIndexService = new ReferenceUsageIndexService(
            this.app,
            () => this.getBibleIndexDataDirectoryPath(),
            (text) => this.bibleReferenceParser.parseMatches(text),
            () => this.settings.referenceUsageExcludedFolders,
            this.getReferenceUsageIndexServiceOptions(),
        );
        try {
            await this.referenceUsageIndexService.load();
        } catch (error) {
            console.warn("Bible reference usage index load failed", error);
            new Notice(this.t("notice.referenceUsageIndexLoadFailed"), 5000);
        }
    }

    private getReferenceUsageIndexService(): ReferenceUsageIndexService {
        if (this.referenceUsageIndexService === null) {
            this.referenceUsageIndexService = new ReferenceUsageIndexService(
                this.app,
                () => this.getBibleIndexDataDirectoryPath(),
                (text) => this.bibleReferenceParser.parseMatches(text),
                () => this.settings.referenceUsageExcludedFolders,
                this.getReferenceUsageIndexServiceOptions(),
            );
        }
        return this.referenceUsageIndexService;
    }

    private updateBookMapping(v2Data: BibleIndexV2Data | null): void {
        this.bookMapping = v2Data !== null && this.activeTranslationId !== null
            ? createBookMappingFromBibleIndexV2Data(v2Data, this.activeTranslationId)
            : createBookMapping([]);
        this.bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
        this.refreshBibleReferenceLinks();
    }

    private createTranslationControllerState(v2Data: BibleIndexV2Data | null = this.activeV2Data): TranslationControllerState {
        return {
            v2Data,
            activeTranslationId: this.activeTranslationId,
            translationOrder: this.settings.translationOrder,
            comparisonTranslationIds: this.settings.comparisonTranslationIds,
        };
    }

    private selectActiveTranslationId(v2Data: BibleIndexV2Data | null): string | null {
        return TranslationController.selectActiveTranslationId(this.createTranslationControllerState(v2Data));
    }

    private async syncTranslationOrder(
        v2Data: BibleIndexV2Data | null,
        preferredTranslationId?: string,
    ): Promise<void> {
        const nextOrder = TranslationController.syncTranslationOrder(this.createTranslationControllerState(v2Data), preferredTranslationId);
        if (nextOrder === null) {
            return;
        }
        this.settings = { ...this.settings, translationOrder: nextOrder };
        await this.savePluginSettings();
    }

    private async promoteTranslationToTop(translationId: string): Promise<void> {
        this.settings = { ...this.settings, translationOrder: TranslationController.promoteTranslationToTop(this.createTranslationControllerState(), translationId) };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data, translationId);
    }

    public getTranslationSettingsItems(): TranslationSettingsItem[] {
        return TranslationController.getTranslationSettingsItems(this.createTranslationControllerState());
    }

    public async moveTranslation(translationId: string, direction: -1 | 1): Promise<void> {
        const nextOrder = TranslationController.moveTranslation(this.createTranslationControllerState(), translationId, direction);
        if (nextOrder === null) {
            return;
        }
        this.settings = { ...this.settings, translationOrder: nextOrder };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data);
        this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
        this.updateBookMapping(this.activeV2Data);
        new Notice(this.t("notice.currentTranslation", { translationName: this.getActiveTranslationDisplayName() }), 4000);
    }

    public async setTranslationOrder(nextOrder: string[]): Promise<void> {
        const normalizedOrder = TranslationController.normalizeTranslationOrder(this.createTranslationControllerState(), nextOrder);
        if (areStringArraysEqual(this.settings.translationOrder, normalizedOrder)) {
            return;
        }

        this.settings = { ...this.settings, translationOrder: normalizedOrder };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data);
        this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
        this.updateBookMapping(this.activeV2Data);
        new Notice(this.t("notice.currentTranslation", { translationName: this.getActiveTranslationDisplayName() }), 4000);
    }

    public async setComparisonTranslationEnabled(translationId: string, enabled: boolean): Promise<void> {
        const normalized = TranslationController.normalizeComparisonTranslationIds(this.createTranslationControllerState(), translationId, enabled);
        if (normalized === null || areStringArraysEqual(this.settings.comparisonTranslationIds, normalized)) {
            return;
        }

        this.settings = { ...this.settings, comparisonTranslationIds: normalized };
        await this.savePluginSettings();
        this.refreshSettingsTab();
        await this.refreshVisibleBiblePreviewContent();
    }

    public getPreviewComparisonTranslationOptions(): PreviewComparisonTranslationOption[] {
        return TranslationController.getPreviewComparisonTranslationOptions(this.createTranslationControllerState());
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
        return isHexColor(this.settings.bibleReferenceLinkColor)
            ? this.settings.bibleReferenceLinkColor
            : DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR;
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
        return isHexColor(this.settings.floatingPreviewBackgroundColor)
            ? this.settings.floatingPreviewBackgroundColor
            : DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR;
    }

    public isFloatingPreviewBackgroundColorDefault(): boolean {
        return this.settings.floatingPreviewBackgroundColor === DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
    }

    public openCssColorDialog(input: CssColorDialogInput): void {
        new CssColorDialog(this.app, this.settings.interfaceLanguage, input).open();
    }

    public openFloatingPreviewBackgroundColorDialog(): void {
        this.openCssColorDialog({
            title: this.t("settings.previewBackgroundColor.name"),
            description: this.t("settings.previewBackgroundColor.desc"),
            value: this.getFloatingPreviewBackgroundColor(),
            defaultValue: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
            previewText: this.t("settings.previewBackgroundColor.preview"),
            presets: createBackgroundColorPresets(),
            normalize: normalizeFloatingPreviewBackgroundColor,
            onApply: (color) => void this.setFloatingPreviewBackgroundColor(color),
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

    public isReferenceUsageIndexingEnabled(): boolean {
        return this.settings.referenceUsageIndexingEnabled;
    }

    public shouldAutoUpdateReferenceUsageIndex(): boolean {
        return this.settings.referenceUsageAutoUpdate;
    }

    public getReferenceUsageExcludedFoldersText(): string {
        return this.settings.referenceUsageExcludedFolders.join("\n");
    }

    public async setReferenceUsageIndexingEnabled(referenceUsageIndexingEnabled: boolean): Promise<void> {
        if (this.settings.referenceUsageIndexingEnabled === referenceUsageIndexingEnabled) return;
        this.settings = { ...this.settings, referenceUsageIndexingEnabled };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public async setReferenceUsageAutoUpdate(referenceUsageAutoUpdate: boolean): Promise<void> {
        if (this.settings.referenceUsageAutoUpdate === referenceUsageAutoUpdate) return;
        this.settings = { ...this.settings, referenceUsageAutoUpdate };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public async setReferenceUsageExcludedFoldersText(value: string): Promise<void> {
        const referenceUsageExcludedFolders = normalizeReferenceUsageExcludedFolders(value);
        if (areStringArraysEqual(this.settings.referenceUsageExcludedFolders, referenceUsageExcludedFolders)) return;
        this.settings = { ...this.settings, referenceUsageExcludedFolders };
        await this.savePluginSettings();
        this.refreshSettingsTab();
    }

    public async buildReferenceUsageIndex(): Promise<void> {
        await this.getReferenceUsageController().buildIndex(false);
    }

    public async rebuildReferenceUsageIndex(): Promise<void> {
        await this.getReferenceUsageController().buildIndex(true);
    }

    public async clearReferenceUsageIndex(): Promise<void> {
        await this.getReferenceUsageController().clearIndex();
    }

    public async showReferenceUsageIndexStats(): Promise<void> {
        this.getReferenceUsageController().showStats();
    }

    public async findReferenceUsagesUnderCursor(): Promise<void> {
        await findReferenceUsagesUnderCursorFlow(this.createReferenceUsageUnderCursorFlowInput());
    }

    public async openReferenceUsagesPanelUnderCursor(): Promise<void> {
        await openReferenceUsagesPanelUnderCursorFlow(this.createReferenceUsageUnderCursorFlowInput());
    }

    private createReferenceUsageUnderCursorFlowInput(): ReferenceUsageUnderCursorFlowInput {
        return {
            isIndexingEnabled: () => this.settings.referenceUsageIndexingEnabled,
            showIndexingDisabledNotice: () => new Notice(this.t("notice.referenceUsageIndexDisabled"), 4000),
            getReferenceUnderCursor: () => getBibleReferenceMatchUnderCursorFromActiveEditor(this.createEditorReferenceUnderCursorInput(true)),
            findUsages: (references) => this.getReferenceUsageIndexService().findUsages(references),
            formatTitle: (referenceText) => this.t("modal.referenceUsages.title", { reference: referenceText }),
            openResultsModal: (titleText, results) => {
                new ReferenceUsageResultsModal(
                    this.app,
                    this.settings.interfaceLanguage,
                    titleText,
                    results,
                    (result) => void this.openReferenceUsageResult(result),
                ).open();
            },
            showResultsInPanel: (titleText, results) => this.showReferenceUsageResultsInPanel(titleText, results),
        };
    }

    private async showReferenceUsagesForPreviewBlock(block: BiblePreviewReferenceBlock): Promise<void> {
        if (!this.settings.referenceUsageIndexingEnabled) {
            new Notice(this.t("notice.referenceUsageIndexDisabled"), 4000);
            return;
        }

        const results = this.getReferenceUsageIndexService().findUsages(block.references);
        await this.showReferenceUsageResultsInPanel(this.t("modal.referenceUsages.title", { reference: block.title }), results);
    }

    private async showReferenceUsageResultsInPanel(titleText: string, results: ReferenceUsageSearchResult[]): Promise<void> {
        const view = await this.getOrCreateReferenceUsagePaneView();
        if (view === null) {
            return;
        }
        view.refreshInput(this.createReferenceUsagePaneViewInput());
        view.setResults(titleText, results);
    }

    private async getOrCreateReferenceUsagePaneView(): Promise<ReferenceUsagePaneView | null> {
        const existingLeaf = this.getFirstWorkspaceLeafOfType(REFERENCE_USAGE_VIEW_TYPE);
        if (existingLeaf !== null) {
            const existingView = existingLeaf.view;
            if (existingView instanceof ReferenceUsagePaneView) {
                await this.revealLeafWithoutStealingEditorFocus(existingLeaf, { focus: true });
                await this.detachDuplicateWorkspaceLeavesOfType(REFERENCE_USAGE_VIEW_TYPE, existingLeaf);
                existingView.refreshInput(this.createReferenceUsagePaneViewInput());
                return existingView;
            }
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf === null) {
            return null;
        }
        await leaf.setViewState({ type: REFERENCE_USAGE_VIEW_TYPE, active: true });
        await this.revealLeafWithoutStealingEditorFocus(leaf, { focus: true });
        const createdLeaf = this.getFirstWorkspaceLeafOfType(REFERENCE_USAGE_VIEW_TYPE) ?? leaf;
        await this.detachDuplicateWorkspaceLeavesOfType(REFERENCE_USAGE_VIEW_TYPE, createdLeaf);
        const view = createdLeaf.view;
        return view instanceof ReferenceUsagePaneView ? view : null;
    }

    private async openReferenceUsageResult(result: ReferenceUsageSearchResult): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(result.filePath);

        if (!(file instanceof TFile)) {
            new Notice(`File not found: ${result.filePath}`, 4000);
            return;
        }

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file, {
            active: true,
            eState: {
                line: result.line,
            },
        });

        await this.waitForNextAnimationFrame();

        const openedView = leaf.view;
        const markdownView = openedView instanceof MarkdownView
            ? openedView
            : this.app.workspace.getActiveViewOfType(MarkdownView);

        if (markdownView === null || markdownView.file?.path !== file.path) {
            return;
        }

        const line = Math.max(0, result.line - 1);
        const from = {
            line,
            ch: Math.max(0, result.chStart),
        };
        const to = {
            line,
            ch: Math.max(from.ch, result.chEnd),
        };

        markdownView.editor.focus();
        markdownView.editor.setSelection(from, to);
        markdownView.editor.scrollIntoView({ from, to }, true);
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
            this.referenceUsageController = new ReferenceUsageController({
                app: this.app,
                getService: () => this.getReferenceUsageIndexService(),
                isIndexingEnabled: () => this.settings.referenceUsageIndexingEnabled,
                shouldAutoProcessEvents: () => this.shouldAutoProcessReferenceUsageIndexEvents(),
                hasImportedTranslations: () => this.hasImportedTranslations(),
                translate: (key, params) => this.t(key, params),
                refreshSettings: () => this.refreshSettingsTab(),
            });
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

    public async deleteImportedTranslation(translationId: string): Promise<void> {
        if (this.activeV2Data?.translations[translationId] === undefined) {
            return;
        }

        const translationName = this.activeV2Data.translations[translationId].name || translationId;
        const confirmed = window.confirm([
            this.t("confirm.deleteTranslation.title", { translationName }),
            "",
            this.t("confirm.deleteTranslation.filesWillBeDeleted"),
            this.t("confirm.deleteTranslation.reimportHint"),
        ].join("\n"));

        if (!confirmed) {
            return;
        }

        const repository = this.createObsidianBibleIndexRepository();
        await repository.load();
        await repository.deleteTranslation(translationId);

        this.bibleIndex = repository.getIndex();
        this.activeV2Data = repository.getV2Data();
        this.settings = {
            ...this.settings,
            translationOrder: this.settings.translationOrder.filter((existingTranslationId) => existingTranslationId !== translationId),
        };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data);
        this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
        this.updateBookMapping(this.activeV2Data);
        new Notice(this.t("notice.translationDeleted", { translationName }), 5000);
    }

    public getActiveTranslationDisplayName(): string {
        if (this.activeTranslationId === null) {
            return this.t("translation.noImported");
        }

        const translation = this.activeV2Data?.translations[this.activeTranslationId];
        return translation === undefined ? this.activeTranslationId : `${translation.name} (${translation.language})`;
    }

    public getActiveTranslationPreviewTitle(): string {
        if (this.activeTranslationId === null) {
            return this.t("preview.titleFallback");
        }

        return this.activeV2Data?.translations[this.activeTranslationId]?.name ?? this.activeTranslationId;
    }

    private refreshSettingsTab(): void {
        this.settingsTab?.display();
    }

    private getBibleIndexDataDirectoryPath(): string { return `${this.getPluginDirectoryPath()}/data`; }
    private getPluginDirectoryPath(): string { const manifestWithDirectory = this.manifest as { dir?: string }; return manifestWithDirectory.dir ?? `.obsidian/plugins/${this.manifest.id}`; }

    private createFloatingPreviewWindowInput(): FloatingBiblePreviewWindowInput {
        return {
            getTitle: () => `📖 ${this.getActiveTranslationPreviewTitle()}`,
            getCopyNoticeText: () => this.t("notice.bibleTextCopied"),
            getCopyAria: () => this.t("preview.copyAria"),
            getCollapseAria: () => this.t("preview.collapseAria"),
            getExpandAria: () => this.t("preview.expandAria"),
            getBackgroundColor: () => this.getFloatingPreviewBackgroundColor(),
            getFindUsagesButtonText: () => this.t("preview.findUsagesIcon"),
            getFindUsagesButtonAria: (block) => this.t("preview.findUsagesAria", { reference: block.title }),
            onFindUsages: (block) => void this.showReferenceUsagesForPreviewBlock(block),
            getComparisonButtonText: () => this.settings.previewComparisonEnabled ? "1" : "⇄",
            getComparisonButtonAria: () => this.settings.previewComparisonEnabled ? this.t("preview.comparisonOffAria") : this.t("preview.comparisonOnAria"),
            getComparisonTranslationsTitle: () => this.t("preview.comparisonTranslationsTitle"),
            getComparisonTranslations: () => this.settings.previewComparisonEnabled ? this.getPreviewComparisonTranslationOptions() : [],
            onToggleComparisonTranslation: (translationId, enabled) => void this.setComparisonTranslationEnabled(translationId, enabled),
            onToggleComparison: (content) => void this.toggleBiblePreviewComparison(content),
            getCloseAria: () => this.t("preview.closeAria"),
            getOpenInPanelAria: () => this.t("preview.openInPanelAria"),
            getOpenInPanelIcon: () => this.t("preview.openInPanelIcon"),
            onOpenInPanel: (content) => void this.switchBiblePreviewToPanel(content),
        };
    }
    private createBiblePreviewPaneViewInput(): BiblePreviewPaneViewInput {
        return {
            getTitle: () => `📖 ${this.getActiveTranslationPreviewTitle()}`,
            getOpenFloatingAria: () => this.t("preview.openFloatingAria"),
            getOpenFloatingIcon: () => this.t("preview.openFloatingIcon"),
            getCopyAria: () => this.t("preview.copyAria"),
            getCopyIcon: () => this.t("preview.copyIcon"),
            getCopyNoticeText: () => this.t("notice.bibleTextCopied"),
            getFindUsagesButtonText: () => this.t("preview.findUsagesIcon"),
            getFindUsagesButtonAria: (block) => this.t("preview.findUsagesAria", { reference: block.title }),
            onFindUsages: (block) => void this.showReferenceUsagesForPreviewBlock(block),
            getComparisonButtonText: () => this.settings.previewComparisonEnabled ? "1" : "⇄",
            getComparisonButtonAria: () => this.settings.previewComparisonEnabled ? this.t("preview.comparisonOffAria") : this.t("preview.comparisonOnAria"),
            getComparisonTranslationsTitle: () => this.t("preview.comparisonTranslationsTitle"),
            getComparisonTranslations: () => this.settings.previewComparisonEnabled ? this.getPreviewComparisonTranslationOptions() : [],
            onToggleComparisonTranslation: (translationId, enabled) => void this.setComparisonTranslationEnabled(translationId, enabled),
            onToggleComparison: (content) => void this.toggleBiblePreviewComparison(content),
            onOpenFloating: (content) => void this.switchBiblePreviewToFloating(content),
        };
    }

    private createReferenceUsagePaneViewInput(): ReferenceUsagePaneViewInput {
        return {
            getTitle: () => this.t("referenceUsages.panel.titleFallback"),
            getEmptyText: () => this.t("modal.referenceUsages.empty"),
            getCountText: (count) => this.t("modal.referenceUsages.count", { count }),
            getOpenResultAria: (result) => this.t("referenceUsages.openResultAria", { filePath: result.filePath, line: result.line }),
            onOpenResult: (result) => void this.openReferenceUsageResult(result),
        };
    }
    public showBiblePreviewContent(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        const reveal = options.reveal !== false;
        if (this.settings.previewDisplayMode === "side-panel") {
            void this.showBiblePreviewInPanel(content, { reveal });
            this.hideFloatingBiblePreview();
            return;
        }

        this.showFloatingBiblePreview(content, anchor, { reveal });
    }
    public showFloatingBiblePreview(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        this.floatingPreviewWindow?.show(content, anchor, { reveal: options.reveal !== false });
    }
    private async switchBiblePreviewToPanel(content: BiblePreviewContent): Promise<void> {
        if (this.settings.previewDisplayMode !== "side-panel") {
            this.settings = { ...this.settings, previewDisplayMode: "side-panel" };
            await this.savePluginSettings();
            this.refreshSettingsTab();
        }
        await this.showBiblePreviewInPanel(content);
        this.hideFloatingBiblePreview();
    }
    private async switchBiblePreviewToFloating(content: BiblePreviewContent): Promise<void> {
        if (this.settings.previewDisplayMode !== "floating") {
            this.settings = { ...this.settings, previewDisplayMode: "floating" };
            await this.savePluginSettings();
            this.refreshSettingsTab();
        }
        await this.closeBiblePreviewPane({ collapseSideDock: true, requireActivePreview: true });
        this.showFloatingBiblePreview(content, { type: "default" });
    }
    private async showBiblePreviewInPanel(content: BiblePreviewContent, options: { reveal?: boolean } = {}): Promise<void> {
        this.lastPanePreviewContent = content;
        const reveal = options.reveal !== false;
        const activeLeafBeforeOpen = this.app.workspace.activeLeaf;
        const restoreActiveLeaf = reveal && !Platform.isMobileApp && activeLeafBeforeOpen?.view instanceof MarkdownView ? activeLeafBeforeOpen : null;
        const view = await this.getOrCreateBiblePreviewPaneView({ restoreActiveLeaf, reveal });
        if (view === null) {
            return;
        }
        this.applyContentToPaneView(view, content);
    }

    private applyContentToPaneView(view: BiblePreviewPaneView, content: BiblePreviewContent): void {
        view.setContent(content);
    }

    private async getOrCreateBiblePreviewPaneView(options: { restoreActiveLeaf?: WorkspaceLeaf | null; reveal?: boolean } = {}): Promise<BiblePreviewPaneView | null> {
        const reveal = options.reveal !== false;
        const existingLeaf = this.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE);
        if (existingLeaf !== null) {
            const existingView = existingLeaf.view;
            if (existingView instanceof BiblePreviewPaneView) {
                if (reveal) {
                    this.biblePreviewPaneIsActiveInSideDock = true;
                    this.expandBiblePreviewSideDock();
                    await this.revealLeafWithoutStealingEditorFocus(existingLeaf, {
                        restoreActiveLeaf: options.restoreActiveLeaf ?? null,
                        focus: false,
                    });
                }
                await this.detachDuplicateWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE, existingLeaf);
                existingView.refreshInput(this.createBiblePreviewPaneViewInput());
                return existingView;
            }
        }

        const leaf = this.settings.previewPanelSide === "left"
            ? this.app.workspace.getLeftLeaf(false)
            : this.app.workspace.getRightLeaf(false);
        if (leaf === null) {
            return null;
        }

        this.suppressPreviewActiveLeafChange = true;
        try {
            if (reveal) {
                this.expandBiblePreviewSideDock();
            }
            await leaf.setViewState({ type: BIBLE_PREVIEW_VIEW_TYPE, active: reveal });
            if (reveal) {
                this.biblePreviewPaneIsActiveInSideDock = true;
                this.expandBiblePreviewSideDock();
                await this.revealLeafWithoutStealingEditorFocus(leaf, {
                    restoreActiveLeaf: options.restoreActiveLeaf ?? null,
                    focus: false,
                });
            }
            await this.waitForNextFrame();
            await this.waitForNextFrame();
            const createdLeaf = this.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE) ?? leaf;
            await this.detachDuplicateWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE, createdLeaf);
            const view = createdLeaf.view;
            if (view instanceof BiblePreviewPaneView) {
                view.refreshInput(this.createBiblePreviewPaneViewInput());
                return view;
            }
            return null;
        } finally {
            window.setTimeout(() => {
                this.suppressPreviewActiveLeafChange = false;
            }, 100);
        }
    }

    private async scrollBiblePreview(command: BiblePreviewScrollCommand): Promise<void> {
        if (!this.isPluginActive()) {
            return;
        }

        this.floatingPreviewWindow?.scrollPreview(command);

        if (this.settings.previewDisplayMode !== "side-panel") {
            return;
        }

        const leaf = this.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE);
        if (leaf === null || !(leaf.view instanceof BiblePreviewPaneView)) {
            return;
        }

        const activeLeafBeforeScroll = this.app.workspace.activeLeaf;
        await this.revealLeafWithoutStealingEditorFocus(leaf, {
            restoreActiveLeaf: !Platform.isMobileApp && activeLeafBeforeScroll?.view instanceof MarkdownView ? activeLeafBeforeScroll : null,
            focus: false,
        });
        leaf.view.scrollPreview(command);
    }

    private getWorkspaceLeavesOfType(viewType: string): WorkspaceLeaf[] {
        const leaves: WorkspaceLeaf[] = [...this.app.workspace.getLeavesOfType(viewType)];
        const workspaceWithIterator = this.app.workspace as typeof this.app.workspace & BiblePreviewWorkspaceLeafIterator;

        if (typeof workspaceWithIterator.iterateAllLeaves === "function") {
            workspaceWithIterator.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === viewType && !leaves.includes(leaf)) {
                    leaves.push(leaf);
                }
            });
        }

        return leaves;
    }

    private getFirstWorkspaceLeafOfType(viewType: string): WorkspaceLeaf | null {
        return this.getWorkspaceLeavesOfType(viewType)[0] ?? null;
    }

    private async detachDuplicateWorkspaceLeavesOfType(viewType: string, keepLeaf: WorkspaceLeaf): Promise<void> {
        const duplicateLeaves = this.getWorkspaceLeavesOfType(viewType).filter((leaf) => leaf !== keepLeaf);
        if (duplicateLeaves.length === 0) {
            return;
        }
        await Promise.all(duplicateLeaves.map((leaf) => leaf.detach()));
    }

    private async revealLeafWithoutStealingEditorFocus(
        leaf: WorkspaceLeaf,
        options: {
            restoreActiveLeaf?: WorkspaceLeaf | null;
            focus?: boolean;
        } = {},
    ): Promise<void> {
        const workspace = this.app.workspace as typeof this.app.workspace & BiblePreviewWorkspaceFocus & BiblePreviewWorkspaceReveal;
        const shouldSuppressPreviewLeafChange = leaf.view.getViewType() === BIBLE_PREVIEW_VIEW_TYPE;
        const restoreActiveLeaf = options.restoreActiveLeaf ?? null;
        const focus = options.focus === true;

        if (shouldSuppressPreviewLeafChange) {
            this.suppressPreviewActiveLeafChange = true;
        }

        try {
            this.expandSideDockForLeaf(leaf);
            this.activateLeafInSideDock(leaf);

            if (typeof workspace.revealLeaf === "function") {
                await workspace.revealLeaf(leaf);
            }

            this.expandSideDockForLeaf(leaf);
            this.activateLeafInSideDock(leaf);

            if (typeof workspace.setActiveLeaf === "function") {
                workspace.setActiveLeaf(leaf, { focus });
            }

            this.expandSideDockForLeaf(leaf);
            this.activateLeafInSideDock(leaf);
        } finally {
            if (restoreActiveLeaf !== null && !focus && !Platform.isMobileApp) {
                window.setTimeout(() => this.restoreActiveLeafAfterPreviewOpen(restoreActiveLeaf), 0);
                window.setTimeout(() => this.restoreActiveLeafAfterPreviewOpen(restoreActiveLeaf), 50);
            }
            if (shouldSuppressPreviewLeafChange) {
                window.setTimeout(() => {
                    this.suppressPreviewActiveLeafChange = false;
                }, 100);
            }
        }
    }

    private activateLeafInSideDock(leaf: WorkspaceLeaf): void {
        this.activateLeafInSplit(leaf);
        const sideDock = this.getSideDockForLeaf(leaf);
        if (sideDock === undefined) {
            return;
        }
        if (typeof sideDock.setActiveLeaf === "function") {
            sideDock.setActiveLeaf(leaf);
        }
        sideDock.activeLeaf = leaf;
        if (sideDock.activeTab !== undefined) {
            sideDock.activeTab.leaf = leaf;
        }
    }

    private activateLeafInSplit(leaf: WorkspaceLeaf): void {
        let parent: unknown = leaf;
        const visitedParents = new Set<unknown>();

        while (typeof parent === "object" && parent !== null && !Array.isArray(parent) && !visitedParents.has(parent)) {
            visitedParents.add(parent);
            const parentRecord = parent as Record<string, unknown>;
            const setActiveLeaf = parentRecord["setActiveLeaf"];
            if (typeof setActiveLeaf === "function") {
                setActiveLeaf.call(parent, leaf);
            }
            parent = parentRecord["parent"];
        }
    }

    private expandSideDockForLeaf(leaf: WorkspaceLeaf): void {
        const sideDock = this.getSideDockForLeaf(leaf);
        if (sideDock !== undefined && sideDock.collapsed === true && typeof sideDock.expand === "function") {
            sideDock.expand();
        }
    }

    private getSideDockForLeaf(leaf: WorkspaceLeaf): BiblePreviewSideDock | undefined {
        const workspaceWithSideDocks = this.app.workspace as typeof this.app.workspace & {
            leftSplit?: BiblePreviewSideDock;
            rightSplit?: BiblePreviewSideDock;
        };
        const leftSplit = workspaceWithSideDocks.leftSplit;
        const rightSplit = workspaceWithSideDocks.rightSplit;
        const leafContainer = (leaf.view as typeof leaf.view & { containerEl?: HTMLElement }).containerEl;

        if (this.getSideDockActiveLeaf(leftSplit) === leaf || (leafContainer?.closest(".workspace-sidedock.mod-left-split") ?? null) !== null) {
            return leftSplit;
        }
        if (this.getSideDockActiveLeaf(rightSplit) === leaf || (leafContainer?.closest(".workspace-sidedock.mod-right-split") ?? null) !== null) {
            return rightSplit;
        }

        if (leaf.view.getViewType() === BIBLE_PREVIEW_VIEW_TYPE) {
            return this.getBiblePreviewSideDock();
        }
        return rightSplit ?? leftSplit;
    }

    private restoreActiveLeafAfterPreviewOpen(activeLeaf: WorkspaceLeaf | null): void {
        if (activeLeaf === null || activeLeaf.view.getViewType() === BIBLE_PREVIEW_VIEW_TYPE) {
            return;
        }
        const workspaceWithFocus = this.app.workspace as typeof this.app.workspace & BiblePreviewWorkspaceFocus;
        if (typeof workspaceWithFocus.setActiveLeaf !== "function") {
            return;
        }
        workspaceWithFocus.setActiveLeaf(activeLeaf, { focus: true });
    }
    private async closeBiblePreviewPane(options: { collapseSideDock?: boolean; requireActivePreview?: boolean } = {}): Promise<void> {
        const shouldCloseActivePreview = this.isBiblePreviewPaneActiveInSideDock();
        if (options.requireActivePreview === true && !shouldCloseActivePreview) {
            return;
        }
        const shouldCollapseSideDock = options.collapseSideDock === true && shouldCloseActivePreview;
        const previewLeaves = this.getWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE);
        if (previewLeaves.length === 0) {
            this.lastPanelEscapeTime = 0;
            return;
        }
        await Promise.all(previewLeaves.map((leaf) => leaf.detach()));
        this.lastPanelEscapeTime = 0;
        this.biblePreviewPaneIsActiveInSideDock = false;
        if (shouldCollapseSideDock) {
            this.collapseBiblePreviewSideDock();
            window.setTimeout(() => this.collapseBiblePreviewSideDock(), 0);
        }
    }
    private getBiblePreviewSideDock(): BiblePreviewSideDock | undefined {
        const workspaceWithSideDocks = this.app.workspace as typeof this.app.workspace & {
            leftSplit?: BiblePreviewSideDock;
            rightSplit?: BiblePreviewSideDock;
        };
        return this.settings.previewPanelSide === "left"
            ? workspaceWithSideDocks.leftSplit
            : workspaceWithSideDocks.rightSplit;
    }
    private getSideDockActiveLeaf(sideDock: BiblePreviewSideDock | undefined): WorkspaceLeaf | undefined {
        return sideDock?.activeLeaf ?? sideDock?.activeTab?.leaf;
    }
    private isBiblePreviewPaneActiveInSideDock(): boolean {
        const activeSideDockLeaf = this.getSideDockActiveLeaf(this.getBiblePreviewSideDock());
        if (activeSideDockLeaf !== undefined) {
            return activeSideDockLeaf.view.getViewType() === BIBLE_PREVIEW_VIEW_TYPE;
        }
        if (this.biblePreviewPaneIsActiveInSideDock) {
            return this.getWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE).length > 0;
        }
        return this.getWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE).some((leaf) => {
            const viewWithContainer = leaf.view as typeof leaf.view & { containerEl?: HTMLElement };
            return viewWithContainer.containerEl?.closest(".workspace-leaf.mod-active") !== null;
        });
    }
    private isSideDockUtilityLeaf(activeLeaf: WorkspaceLeaf | null): boolean {
        if (activeLeaf === null) {
            return false;
        }
        const viewType = activeLeaf.view.getViewType();
        return viewType !== "markdown" && viewType !== BIBLE_PREVIEW_VIEW_TYPE;
    }
    private expandBiblePreviewSideDock(): void {
        const sideDock = this.getBiblePreviewSideDock();
        if (sideDock === undefined || sideDock.collapsed !== true || typeof sideDock.expand !== "function") {
            return;
        }
        sideDock.expand();
    }
    private collapseBiblePreviewSideDock(): void {
        const sideDock = this.getBiblePreviewSideDock();
        if (sideDock === undefined || sideDock.collapsed === true || typeof sideDock.collapse !== "function") {
            return;
        }
        sideDock.collapse();
    }
    private handlePanelEscapeKeydown(event: KeyboardEvent): void {
        if (event.key !== "Escape") {
            return;
        }
        if (this.floatingPreviewWindow?.isVisible() === true) {
            this.lastPanelEscapeTime = 0;
            return;
        }
        const panelLeaf = this.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE) ?? undefined;
        if (panelLeaf === undefined || !this.isBiblePreviewPaneActiveInSideDock()) {
            this.lastPanelEscapeTime = 0;
            return;
        }
        const now = Date.now();
        const isSecondEscape = now - this.lastPanelEscapeTime <= 1200;
        this.lastPanelEscapeTime = now;
        event.preventDefault();
        event.stopPropagation();
        if (!isSecondEscape) {
            return;
        }
        void this.closeBiblePreviewPane({ collapseSideDock: true, requireActivePreview: true });
    }
    private handlePreviewActiveLeafChange(activeLeaf: WorkspaceLeaf | null): void {
        if (this.suppressPreviewActiveLeafChange) {
            return;
        }
        if (activeLeaf?.view.getViewType() === BIBLE_PREVIEW_VIEW_TYPE) {
            this.biblePreviewPaneIsActiveInSideDock = true;
            return;
        }
        if (this.isSideDockUtilityLeaf(activeLeaf)) {
            this.biblePreviewPaneIsActiveInSideDock = false;
            return;
        }
        if (!this.settings.closePreviewOnActiveLeafChange) {
            return;
        }
        this.hideFloatingBiblePreview();
        void this.closeBiblePreviewPane({ collapseSideDock: true, requireActivePreview: true });
    }
    private waitForNextFrame(): Promise<void> {
        return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    public hideFloatingBiblePreview(resetPosition = false): void {
        this.floatingPreviewWindow?.hide(resetPosition);
    }
    public refreshFloatingPreviewLabels(): void {
        this.floatingPreviewWindow?.refreshLabels(this.createFloatingPreviewWindowInput());
    }
    public isFloatingPreviewTarget(target: Node): boolean {
        return this.floatingPreviewWindow?.containsTarget(target) ?? false;
    }


    createCursorExtension() {
        return createEditorCursorExtension({
            getActiveTranslationId: () => this.activeTranslationId,
            editorViews: this.editorRuntimeState.editorViews,
            previewControllers: this.editorRuntimeState.previewControllers,
            bibleReferenceLinkDecorationCache: this.editorRuntimeState.bibleReferenceLinkDecorationCache,
            shouldRunBiblePreviewForEditor: (view) => this.shouldRunBiblePreviewForEditor(view),
            getBiblePreviewTriggerMode: () => this.getBiblePreviewTriggerMode(),
            getBiblePreviewDisplayMode: () => this.getBiblePreviewDisplayMode(),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            hasBiblePreviewPane: () => this.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE) !== null,
            findBibleReferenceMatchAtPosition: (view, position) => findEditorBibleReferenceMatchAtPosition(view, position, (text) => this.bibleReferenceParser.parseMatches(text)),
            getCurrentParagraph: getCurrentEditorParagraph,
            analyzeParagraph: (paragraph) => this.analyzeParagraphAsync(paragraph),
            analyzeReferenceText: (text) => this.analyzeReferenceTextAsync(text),
            showBiblePreviewContent: (content) => this.showBiblePreviewContent(content, { type: "default" }, { reveal: this.shouldAutoOpenPreviewOnVerseChange() }),
            refreshFloatingPreviewLabels: () => this.refreshFloatingPreviewLabels(),
            hideFloatingBiblePreview: () => this.hideFloatingBiblePreview(),
            createBibleReferenceLinkDecorations: (view) => createEditorReferenceLinkDecorations(this.createEditorReferenceLinkDecorationFlowInput(), view),
            translate: (key) => this.t(key),
        });
    }


    private hasImportedTranslations(): boolean {
        return this.activeV2Data !== null
            && this.activeTranslationId !== null
            && this.activeV2Data.translations[this.activeTranslationId] !== undefined;
    }

    private createEditorReferenceLinkDecorationFlowInput(): EditorReferenceLinkDecorationFlowInput {
        return {
            editorRuntimeState: this.editorRuntimeState,
            activeTranslationId: this.activeTranslationId,
            linkColor: this.getBibleReferenceLinkColor(),
            shouldRunBiblePreviewForEditor: (editorView) => this.shouldRunBiblePreviewForEditor(editorView),
            hasImportedTranslations: () => this.hasImportedTranslations(),
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
        };
    }

    private refreshBibleReferenceLinks(): void {
        refreshEditorReferenceLinks(this.createEditorReferenceLinkDecorationFlowInput());
    }

    private clearBibleReferenceLinks(): void {
        clearEditorReferenceLinks(this.createEditorReferenceLinkDecorationFlowInput());
    }

    private createBiblePreviewAnalyzerInput(): BiblePreviewAnalyzerInput {
        return {
            hasImportedTranslations: () => this.hasImportedTranslations(),
            getActiveTranslationId: () => this.activeTranslationId,
            isPreviewComparisonEnabled: () => this.settings.previewComparisonEnabled,
            parseMatches: (text) => this.bibleReferenceParser.parseMatches(text),
            getBibleTextBlocks: (references, translationId, sourceText) => getBibleTextBlocks(references, this.bibleIndex, translationId, sourceText),
            formatBibleTextBlocks: (blocks) => formatBibleTextBlocks(blocks, this.bookMapping, this.t("preview.missingVerse")),
            formatBibleComparisonTextBlocks: (inputs) => formatBibleComparisonTextBlocks(inputs, this.bookMapping, this.t("preview.missingVerse")),
            getComparisonTranslationIds: () => this.getComparisonTranslationIds(),
            getTranslationPreviewTitle: (translationId) => this.getTranslationPreviewTitle(translationId),
            getComparisonMapping: (translationId) => this.activeV2Data === null
                ? this.bookMapping
                : createBookMappingFromBibleIndexV2Data(this.activeV2Data, translationId),
        };
    }

    async analyzeParagraphAsync(text: string): Promise<BiblePreviewContent | null> {
        return new BiblePreviewAnalyzer(this.createBiblePreviewAnalyzerInput()).analyzeParagraph(text);
    }

    async analyzeReferenceTextAsync(text: string): Promise<BiblePreviewContent | null> {
        return this.analyzeParagraphAsync(text);
    }

    private async toggleBiblePreviewComparison(content: BiblePreviewContent): Promise<void> {
        await this.setPreviewComparisonEnabled(!this.settings.previewComparisonEnabled);
        const nextContent = await this.rebuildBiblePreviewContent(content);
        if (nextContent !== null) {
            this.showBiblePreviewContent(nextContent, { type: "default" }, { reveal: true });
        }
    }

    private async rebuildBiblePreviewContent(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        return new BiblePreviewAnalyzer(this.createBiblePreviewAnalyzerInput()).rebuildContent(content);
    }

    private getComparisonTranslationIds(): string[] {
        return TranslationController.getComparisonTranslationIds(this.createTranslationControllerState());
    }

    private getTranslationPreviewTitle(translationId: string): string {
        return TranslationController.getTranslationPreviewTitle(this.createTranslationControllerState(), translationId);
    }

    async openBibleIndexFolder(): Promise<void> {
        const directoryPath = this.getBibleIndexDataDirectoryPath();
        await ensureVaultDirectoryExists(this.app.vault.adapter, directoryPath);

        if (Platform.isMobileApp) {
            new Notice([
                this.t("notice.mobileFolderUnavailable"),
                this.t("notice.indexFolder", { directoryPath }),
            ].join("\n"), 12000);
            return;
        }

        const appWithShowInFolder = this.app as App & { showInFolder?: (path: string) => void };
        if (typeof appWithShowInFolder.showInFolder === "function") {
            appWithShowInFolder.showInFolder(directoryPath);
            return;
        }

        new Notice(this.t("notice.indexFolder", { directoryPath }), 10000);
    }

    async showBibleIndexStats(): Promise<void> {
        const repository = this.createObsidianBibleIndexRepository();
        await repository.load();
        const report = await repository.readLastImportReport();

        if (report !== null) {
            new Notice(formatLastImportReportNotice(
                report,
                (key, params) => this.t(key, params),
            ), 15000);
            return;
        }

        if (this.activeV2Data !== null) {
            const translationCount = Object.keys(this.activeV2Data.translations).length;
            new Notice(formatBibleIndexV2StatsNotice(
                translationCount,
                this.activeTranslationId ?? this.t("notice.none"),
                (key, params) => this.t(key, params),
            ), 10000);
            return;
        }

        new Notice(this.t("notice.noImportedTranslations"), 5000);
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
        this.refreshFloatingPreviewLabels();
        refreshEditorPreviewControllerLocalizedLabels(this.editorRuntimeState.previewControllers.values());
        this.readingModePreviewController?.refreshLocalizedLabels();
        for (const leaf of this.getWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE)) {
            if (leaf.view instanceof BiblePreviewPaneView) {
                leaf.view.refreshInput(this.createBiblePreviewPaneViewInput());
            }
        }
        new Notice(this.t("notice.restartPluginForCommandNames"), 6000);
    }


}



function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}


