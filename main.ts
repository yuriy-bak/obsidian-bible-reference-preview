
import { App, MarkdownView, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, type TAbstractFile, type MarkdownPostProcessorContext, type WorkspaceLeaf } from "obsidian";
import type { BibleIndex } from "./src/infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import type { BibleReference } from "./src/domain/BibleReference";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, type DecorationSet } from "@codemirror/view";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createBookMapping } from "./src/parsing/BookMapping";
import { getBibleTextBlocks } from "./src/application/getBibleTexts";
import { BiblePreviewContent, BiblePreviewReferenceBlock, formatBibleTextBlocks } from "./src/application/formatBibleTexts";
import { importBibleFromEpub } from "./src/application/importBibleFromEpub";
import { EpubBibleSourceMetadata } from "./src/infrastructure/EpubBibleImporter";
import { JsZipEpubBibleImporter } from "./src/infrastructure/epub/JsZipEpubBibleImporter";
import { ObsidianBibleIndexV2Repository } from "./src/infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "./src/infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { BiblePluginLocale, I18nKey, normalizeBiblePluginLocale, t } from "./src/i18n/I18n";
import { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow, FloatingBiblePreviewWindowInput } from "./src/ui/FloatingBiblePreviewWindow";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, BiblePreviewPaneViewInput, type BiblePreviewScrollCommand } from "./src/ui/BiblePreviewPaneView";
import { REFERENCE_USAGE_VIEW_TYPE, ReferenceUsagePaneView, ReferenceUsagePaneViewInput } from "./src/ui/ReferenceUsagePaneView";
import { ReferenceUsageIndexService, type ReferenceUsageIndexStats, type ReferenceUsageSearchResult, normalizeReferenceUsageExcludedFolders } from "./src/reference-usage/ReferenceUsageIndexService";


const setBibleReferenceLinkDecorationsEffect = StateEffect.define<DecorationSet>();

const bibleReferenceLinkDecorationsField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },

    update(decorations, transaction) {
        let nextDecorations = decorations.map(transaction.changes);

        for (const effect of transaction.effects) {
            if (effect.is(setBibleReferenceLinkDecorationsEffect)) {
                nextDecorations = effect.value;
            }
        }

        return nextDecorations;
    },

    provide: (field) => EditorView.decorations.from(field),
});

const bibleReferenceLinkTheme = EditorView.baseTheme({
    ".bible-reference-link": {
        textDecoration: "underline",
        textDecorationStyle: "dotted",
        cursor: "pointer",
    },
});

function dispatchBibleReferenceLinkDecorations(view: EditorView, decorations: DecorationSet): void {
    window.setTimeout(() => {
        if (view.state.field(bibleReferenceLinkDecorationsField, false) === undefined) {
            return;
        }

        view.dispatch({
            effects: setBibleReferenceLinkDecorationsEffect.of(decorations),
        });
    }, 0);
}

const EMPTY_BIBLE_INDEX: BibleIndex = {
    async getBibleText() {
        return null;
    },
};

type BiblePreviewTriggerMode = "current-paragraph" | "clicked-reference";
type BiblePreviewDisplayMode = "floating" | "side-panel";
type BiblePreviewPanelSide = "right" | "left";
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
type BibleLinkOpenShortcut = "alt-enter" | "ctrl-enter" | "ctrl-alt-enter";

type BiblePreviewController = {
    openBibleReferenceUnderCursor(showNotice?: boolean): boolean;
    refreshLocalizedLabels(): void;
};

type BiblePluginSettings = {
    isPluginActive: boolean;
    interfaceLanguage: BiblePluginLocale;
    translationOrder: string[];
    bibleReferenceLinkColor: string;
    floatingPreviewBackgroundColor: string;
    previewTriggerMode: BiblePreviewTriggerMode;
    previewDisplayMode: BiblePreviewDisplayMode;
    previewPanelSide: BiblePreviewPanelSide;
    closePreviewOnActiveLeafChange: boolean;
    interceptLinkOpenShortcut: boolean;
    linkOpenShortcut: BibleLinkOpenShortcut;
    referenceUsageIndexingEnabled: boolean;
    referenceUsageAutoUpdate: boolean;
    referenceUsageExcludedFolders: string[];
};

const DEFAULT_BIBLE_REFERENCE_LINK_COLOR = "var(--link-color)";
const DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR = "#7c3aed";
const DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR = "color-mix(in srgb, var(--background-primary) 92%, black 8%)";
const DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR = "#e6e2d8";

const MAX_ANALYZED_PARAGRAPH_LINES = 40;
const MAX_ANALYZED_PARAGRAPH_CHARACTERS = 2000;
const DEFAULT_REFERENCE_USAGE_EXCLUDED_FOLDERS = ["Attachments/", "Templates/", "Archive/", "Bible/"];
const REFERENCE_USAGE_FILE_UPDATE_DELAY_MS = 1500;


const DEFAULT_SETTINGS: BiblePluginSettings = {
    isPluginActive: true,
    interfaceLanguage: "ru",
    translationOrder: [],
    bibleReferenceLinkColor: DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
    floatingPreviewBackgroundColor: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
    previewTriggerMode: "current-paragraph",
    previewDisplayMode: "floating",
    previewPanelSide: "right",
    closePreviewOnActiveLeafChange: true,
    interceptLinkOpenShortcut: true,
    linkOpenShortcut: "alt-enter",
    referenceUsageIndexingEnabled: false,
    referenceUsageAutoUpdate: !Platform.isMobileApp,
    referenceUsageExcludedFolders: DEFAULT_REFERENCE_USAGE_EXCLUDED_FOLDERS,
};

type TranslationSettingsItem = {
    id: string;
    name: string;
    language: string;
    sourceFileName: string;
    bookCount: number;
    isActive: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
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
    private readingModePreviewRequestId = 0;
    private floatingPreviewWindow: FloatingBiblePreviewWindow | null = null;
    private lastPanePreviewContent: BiblePreviewContent | null = null;
    private lastPanelEscapeTime = 0;
    private suppressPreviewActiveLeafChange = false;
    private biblePreviewPaneIsActiveInSideDock = false;
    private pluginActiveRibbonIconEl: HTMLElement | null = null;
    private referenceUsageIndexService: ReferenceUsageIndexService | null = null;
    private referenceUsageIndexingInProgress = false;
    private readonly referenceUsageFileUpdateTimeouts = new Map<string, number>();
    private readonly editorViews = new Set<EditorView>();
    private readonly previewControllers = new Map<EditorView, BiblePreviewController>();
    private readonly linkOpenShortcutKeydownHandler = (event: KeyboardEvent) => this.handleLinkOpenShortcutKeydown(event);
    private readonly panelEscapeKeydownHandler = (event: KeyboardEvent) => this.handlePanelEscapeKeydown(event);

    async onload() {
        await this.loadPluginSettings();
        await this.loadBibleIndex();
        await this.loadReferenceUsageIndex();
        this.floatingPreviewWindow = new FloatingBiblePreviewWindow(this.createFloatingPreviewWindowInput());
        this.register(() => this.floatingPreviewWindow?.destroy());
        this.registerView(BIBLE_PREVIEW_VIEW_TYPE, (leaf) => {
            const view = new BiblePreviewPaneView(leaf, this.createBiblePreviewPaneViewInput());
            if (this.lastPanePreviewContent !== null) {
                window.setTimeout(() => view.setContent(this.lastPanePreviewContent!), 0);
            }
            return view;
        });
        this.registerView(REFERENCE_USAGE_VIEW_TYPE, (leaf) => new ReferenceUsagePaneView(leaf, this.createReferenceUsagePaneViewInput()));
        this.addCommand({ id: "import-epub-bible", name: this.t("command.importEpubBible"), callback: () => this.openEpubFilePicker() });
        this.addCommand({ id: "reload-bible-index", name: this.t("command.reloadBibleIndex"), callback: () => void this.reloadBibleIndex() });
        this.addCommand({ id: "open-bible-index-folder", name: this.t("command.openBibleIndexFolder"), callback: () => void this.openBibleIndexFolder() });
        this.addCommand({ id: "show-bible-index-stats", name: this.t("command.showBibleIndexStats"), callback: () => void this.showBibleIndexStats() });
        this.addCommand({ id: "build-reference-usage-index", name: this.t("command.buildReferenceUsageIndex"), callback: () => void this.buildReferenceUsageIndex() });
        this.addCommand({ id: "rebuild-reference-usage-index", name: this.t("command.rebuildReferenceUsageIndex"), callback: () => void this.rebuildReferenceUsageIndex() });
        this.addCommand({ id: "clear-reference-usage-index", name: this.t("command.clearReferenceUsageIndex"), callback: () => void this.clearReferenceUsageIndex() });
        this.addCommand({ id: "show-reference-usage-index-stats", name: this.t("command.showReferenceUsageIndexStats"), callback: () => void this.showReferenceUsageIndexStats() });
        this.addCommand({ id: "find-reference-usages-under-cursor", name: this.t("command.findReferenceUsagesUnderCursor"), callback: () => void this.findReferenceUsagesUnderCursor() });
        this.addCommand({ id: "open-reference-usages-panel-under-cursor", name: this.t("command.openReferenceUsagesPanelUnderCursor"), callback: () => void this.openReferenceUsagesPanelUnderCursor() });
        this.addCommand({
            id: "scroll-bible-preview-panel-page-down",
            name: this.t("command.scrollBiblePreviewPanelPageDown"),
            hotkeys: [{ modifiers: ["Alt"], key: "PageDown" }],
            callback: () => void this.scrollBiblePreview("page-down"),
        });
        this.addCommand({
            id: "scroll-bible-preview-panel-page-up",
            name: this.t("command.scrollBiblePreviewPanelPageUp"),
            hotkeys: [{ modifiers: ["Alt"], key: "PageUp" }],
            callback: () => void this.scrollBiblePreview("page-up"),
        });
        this.addCommand({
            id: "scroll-bible-preview-panel-top",
            name: this.t("command.scrollBiblePreviewPanelTop"),
            hotkeys: [{ modifiers: ["Alt"], key: "Home" }],
            callback: () => void this.scrollBiblePreview("top"),
        });
        this.addCommand({
            id: "scroll-bible-preview-panel-bottom",
            name: this.t("command.scrollBiblePreviewPanelBottom"),
            hotkeys: [{ modifiers: ["Alt"], key: "End" }],
            callback: () => void this.scrollBiblePreview("bottom"),
        });
        this.addCommand({
            id: "toggle-bible-preview-active",
            name: this.t("command.togglePluginActive"),
            callback: () => void this.togglePluginActive(),
        });
        this.pluginActiveRibbonIconEl = this.addRibbonIcon(
            "book-open",
            this.getPluginActiveRibbonTitle(),
            () => void this.togglePluginActive(),
        );
        this.updatePluginActiveRibbonIcon();
        this.addCommand({
            id: "open-bible-reference-under-cursor",
            name: this.t("command.openBibleReferenceUnderCursor"),
            callback: () => this.openBibleReferenceUnderCursorFromActiveEditor(true),
        });
        this.readingModePreviewController = new BibleReadingModePreviewController(this);
        this.register(() => this.readingModePreviewController?.destroy());
        this.settingsTab = new BiblePluginSettingTab(this.app, this);
        this.addSettingTab(this.settingsTab);
        this.registerEvent(this.app.workspace.on("active-leaf-change", (activeLeaf) => this.handlePreviewActiveLeafChange(activeLeaf)));
        document.addEventListener("keydown", this.panelEscapeKeydownHandler, true);
        this.register(() => document.removeEventListener("keydown", this.panelEscapeKeydownHandler, true));
        this.registerGlobalLinkOpenShortcutHandler();
        this.registerReadingModeBibleReferenceLinks();
        this.registerEditorExtension(this.createCursorExtension());
        this.registerReferenceUsageIndexEvents();
    }

    onunload() { }

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
        input.accept = ".epub,.tsv,application/epub+zip,application/zip";
        input.onchange = () => { const file = input.files?.[0]; if (file !== undefined) void this.importEpubFile(file); };
        input.click();
    }

    public async importEpubFile(file: File): Promise<void> {
        try {
            const content = await this.readAndValidateEpubFile(file);
            const importer = new JsZipEpubBibleImporter();
            const sourceMetadata = await importer.readMetadata(content);
            const defaults = createImportSettingsDefaults(file.name, sourceMetadata);
            const existingRepository = this.createObsidianBibleIndexRepository();
            await existingRepository.load();
            const translationAlreadyExists = existingRepository.getV2Data()?.translations[defaults.translationId] !== undefined;
            const importSettings = await this.openImportSettingsModal(defaults, translationAlreadyExists);

            if (importSettings === null) {
                return;
            }

            const progressNotice = new Notice(this.t("notice.importStarted", { fileName: file.name }), 0);

            try {
                const repository = this.createObsidianBibleIndexRepository();
                await repository.load();

                const result = await importBibleFromEpub({
                    epub: {
                        fileName: file.name,
                        content,
                        translationId: importSettings.translationId,
                        translationName: importSettings.translationName,
                        language: importSettings.language,
                    },
                    importer,
                    repository,
                });

                this.bibleIndex = repository.getIndex();
                this.activeV2Data = repository.getV2Data();
                await this.promoteTranslationToTop(result.translationId);
                this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
                this.updateBookMapping(this.activeV2Data);
                this.refreshSettingsTab();
                progressNotice.hide();

                if (result.warnings.length > 0) console.warn("EPUB import warnings", result.warnings);
                const warningsText = result.warnings.length === 0 ? "" : `\n${this.t("notice.importWarnings", { count: result.warnings.length })}`;
                new Notice([
                    this.t("notice.epubImported"),
                    this.t("import.summary.translation", { translationName: result.translationName }),
                    this.t("import.summary.language", { language: result.language }),
                    this.t("import.summary.books", { count: result.report.books }),
                    this.t("import.summary.chapters", { count: result.report.chapters }),
                    this.t("import.summary.verses", { count: result.report.verses }),
                    this.t("import.summary.footnotes", { count: result.report.footnotes }),
                    this.t("import.summary.metadataSize", { size: formatKilobytes(result.report.metadataBytes) }),
                    this.t("import.summary.booksSize", { size: formatMegabytes(result.report.booksBytes) }),
                ].join("\n") + warningsText, 15000);
            } catch (error) {
                progressNotice.hide();
                throw error;
            }
        } catch (error) {
            console.error("EPUB import failed", error);
            new Notice(this.t("notice.importFailed", { message: this.localizeImportErrorMessage(error) }), 15000);
        }
    }

    private async readAndValidateEpubFile(file: File): Promise<ArrayBuffer> {
        const content = await file.arrayBuffer();

        if (content.byteLength === 0) {
            throw new Error([
                this.t("import.error.emptyFile"),
                this.t("import.error.emptyFileDetails", { fileName: file.name, size: file.size }),
                this.t("import.error.androidPickerHint"),
                this.t("import.error.androidPickerSuggestion"),
            ].join(" "));
        }

        if (content.byteLength < 4) {
            throw new Error(this.t("import.error.fileTooSmall", { size: content.byteLength }));
        }

        const bytes = new Uint8Array(content.slice(0, 4));
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
            throw new Error([
                this.t("import.error.notZip"),
                this.t("import.error.firstBytes", { bytes: Array.from(bytes).join(", ") }),
                this.t("import.error.selectRealEpub"),
            ].join(" "));
        }

        return content;
    }

    private openImportSettingsModal(
        defaults: BibleTranslationImportSettings,
        translationAlreadyExists: boolean,
    ): Promise<BibleTranslationImportSettings | null> {
        return new Promise((resolve) => {
            new BibleTranslationImportModal(this.app, defaults, translationAlreadyExists, this.settings.interfaceLanguage, resolve).open();
        });
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
        this.referenceUsageIndexService = new ReferenceUsageIndexService(
            this.app,
            () => this.getBibleIndexDataDirectoryPath(),
            (text) => this.bibleReferenceParser.parseMatches(text),
            () => this.settings.referenceUsageExcludedFolders,
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

    private selectActiveTranslationId(v2Data: BibleIndexV2Data | null): string | null {
        if (v2Data === null) {
            return null;
        }

        const availableTranslations = new Set(Object.keys(v2Data.translations));
        return this.settings.translationOrder.find((translationId) => availableTranslations.has(translationId))
            ?? Object.keys(v2Data.translations)[0]
            ?? null;
    }

    private async syncTranslationOrder(
        v2Data: BibleIndexV2Data | null,
        preferredTranslationId?: string,
    ): Promise<void> {
        if (v2Data === null) {
            return;
        }

        const availableTranslationIds = Object.keys(v2Data.translations);
        const availableTranslations = new Set(availableTranslationIds);
        const nextOrder: string[] = [];

        if (this.settings.translationOrder.length === 0
            && preferredTranslationId !== undefined
            && availableTranslations.has(preferredTranslationId)) {
            nextOrder.push(preferredTranslationId);
        }

        for (const translationId of this.settings.translationOrder) {
            if (availableTranslations.has(translationId) && !nextOrder.includes(translationId)) {
                nextOrder.push(translationId);
            }
        }

        for (const translationId of availableTranslationIds) {
            if (!nextOrder.includes(translationId)) {
                nextOrder.push(translationId);
            }
        }

        if (!areStringArraysEqual(this.settings.translationOrder, nextOrder)) {
            this.settings = { ...this.settings, translationOrder: nextOrder };
            await this.savePluginSettings();
        }
    }

    private async promoteTranslationToTop(translationId: string): Promise<void> {
        const nextOrder = [
            translationId,
            ...this.settings.translationOrder.filter((existingTranslationId) => existingTranslationId !== translationId),
        ];

        this.settings = { ...this.settings, translationOrder: nextOrder };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data, translationId);
    }

    public getTranslationSettingsItems(): TranslationSettingsItem[] {
        if (this.activeV2Data === null) {
            return [];
        }

        const translations = this.activeV2Data.translations;
        const order = this.settings.translationOrder.filter((translationId) => translations[translationId] !== undefined);

        return order.map((translationId, index) => {
            const translation = translations[translationId];
            return {
                id: translationId,
                name: translation.name,
                language: translation.language,
                sourceFileName: translation.sourceFileName ?? "",
                bookCount: Object.keys(translation.books).length,
                isActive: translationId === this.activeTranslationId,
                canMoveUp: index > 0,
                canMoveDown: index < order.length - 1,
            };
        });
    }

    public async moveTranslation(translationId: string, direction: -1 | 1): Promise<void> {
        const currentIndex = this.settings.translationOrder.indexOf(translationId);
        const nextIndex = currentIndex + direction;

        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= this.settings.translationOrder.length) {
            return;
        }

        const nextOrder = [...this.settings.translationOrder];
        [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
        this.settings = { ...this.settings, translationOrder: nextOrder };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data);
        this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
        this.updateBookMapping(this.activeV2Data);
        new Notice(this.t("notice.currentTranslation", { translationName: this.getActiveTranslationDisplayName() }), 4000);
    }

    public async setTranslationOrder(nextOrder: string[]): Promise<void> {
        const availableTranslations = new Set(Object.keys(this.activeV2Data?.translations ?? {}));
        const currentOrder = this.getTranslationSettingsItems().map((translation) => translation.id);
        const normalizedOrder: string[] = [];

        for (const translationId of nextOrder) {
            if (availableTranslations.has(translationId) && !normalizedOrder.includes(translationId)) {
                normalizedOrder.push(translationId);
            }
        }

        for (const translationId of currentOrder) {
            if (!normalizedOrder.includes(translationId)) {
                normalizedOrder.push(translationId);
            }
        }

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

    public shouldRunBiblePreviewForEditor(_view?: EditorView): boolean {
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
        await this.buildReferenceUsageIndexInternal(false);
    }

    public async rebuildReferenceUsageIndex(): Promise<void> {
        await this.buildReferenceUsageIndexInternal(true);
    }

    private async buildReferenceUsageIndexInternal(forceRebuild: boolean): Promise<void> {
        if (!this.settings.referenceUsageIndexingEnabled) {
            new Notice(this.t("notice.referenceUsageIndexDisabled"), 4000);
            return;
        }
        if (!this.hasImportedTranslations()) {
            new Notice(this.t("notice.noImportedTranslations"), 4000);
            return;
        }
        if (this.referenceUsageIndexingInProgress) {
            new Notice(this.t("notice.referenceUsageIndexAlreadyRunning"), 4000);
            return;
        }
        this.referenceUsageIndexingInProgress = true;
        const progressNotice = new Notice(this.t("notice.referenceUsageIndexBuildStarted"), 0);
        try {
            const result = await this.getReferenceUsageIndexService().build(this.app.vault.getMarkdownFiles(), forceRebuild);
            new Notice(this.t("notice.referenceUsageIndexBuildCompleted", {
                fileCount: result.fileCount,
                updatedFileCount: result.updatedFileCount,
                referenceCount: result.referenceCount,
            }), 8000);
        } catch (error) {
            console.warn("Bible reference usage index build failed", error);
            new Notice(this.t("notice.referenceUsageIndexSaveFailed"), 5000);
        } finally {
            progressNotice.hide();
            this.referenceUsageIndexingInProgress = false;
            this.refreshSettingsTab();
        }
    }

    public async clearReferenceUsageIndex(): Promise<void> {
        try {
            await this.getReferenceUsageIndexService().clear();
            this.refreshSettingsTab();
            new Notice(this.t("notice.referenceUsageIndexCleared"), 4000);
        } catch (error) {
            console.warn("Bible reference usage index clear failed", error);
            new Notice(this.t("notice.referenceUsageIndexSaveFailed"), 5000);
        }
    }

    public async showReferenceUsageIndexStats(): Promise<void> {
        const stats = this.getReferenceUsageIndexService().getStats();
        new Notice(this.formatReferenceUsageIndexStats(stats), 12000);
    }

    private formatReferenceUsageIndexStats(stats: ReferenceUsageIndexStats): string {
        return [
            this.t("notice.referenceUsageIndexStats"),
            this.t("notice.referenceUsageIndexStatsFiles", { count: stats.fileCount }),
            this.t("notice.referenceUsageIndexStatsReferences", { count: stats.referenceCount }),
            this.t("notice.referenceUsageIndexStatsUpdated", { date: stats.updatedAt <= 0 ? this.t("notice.none") : new Date(stats.updatedAt).toLocaleString() }),
            this.t("notice.referenceUsageIndexStatsPath", { path: stats.indexPath }),
        ].join("\n");
    }

    public async findReferenceUsagesUnderCursor(): Promise<void> {
        if (!this.settings.referenceUsageIndexingEnabled) {
            new Notice(this.t("notice.referenceUsageIndexDisabled"), 4000);
            return;
        }
        const match = this.getBibleReferenceMatchUnderCursorFromActiveEditor(true);
        if (match === null) return;
        const results = this.getReferenceUsageIndexService().findUsages(match.references);
        new ReferenceUsageResultsModal(
            this.app,
            this.settings.interfaceLanguage,
            this.t("modal.referenceUsages.title", { reference: match.text }),
            results,
            (result) => void this.openReferenceUsageResult(result),
        ).open();
    }

    public async openReferenceUsagesPanelUnderCursor(): Promise<void> {
        if (!this.settings.referenceUsageIndexingEnabled) {
            new Notice(this.t("notice.referenceUsageIndexDisabled"), 4000);
            return;
        }
        const match = this.getBibleReferenceMatchUnderCursorFromActiveEditor(true);
        if (match === null) return;
        const results = this.getReferenceUsageIndexService().findUsages(match.references);
        await this.showReferenceUsageResultsInPanel(this.t("modal.referenceUsages.title", { reference: match.text }), results);
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

    private getBibleReferenceMatchUnderCursorFromActiveEditor(showNotice: boolean): { text: string; references: BibleReference[] } | null {
        if (!this.isPluginActive()) {
            if (showNotice) new Notice(this.t("notice.pluginInactive"), 2500);
            return null;
        }
        for (const view of this.editorViews) {
            if (view.hasFocus || view.dom.contains(document.activeElement)) {
                const match = this.findBibleReferenceMatchAtPosition(view, view.state.selection.main.head);
                if (match === null) {
                    if (showNotice) new Notice(this.t("notice.referenceUnderCursorNotFound"), 2500);
                    return null;
                }
                const references = this.bibleReferenceParser.parseMatches(match.text).flatMap((parsedMatch) => parsedMatch.references);
                return references.length === 0 ? null : { text: match.text, references };
            }
        }
        if (showNotice) new Notice(this.t("notice.activeEditorNotFound"), 2500);
        return null;
    }

    private registerReferenceUsageIndexEvents(): void {
        this.registerEvent(this.app.vault.on("create", (file) => this.handleReferenceUsageFileCreateOrModify(file)));
        this.registerEvent(this.app.vault.on("modify", (file) => this.handleReferenceUsageFileCreateOrModify(file)));
        this.registerEvent(this.app.vault.on("delete", (file) => this.handleReferenceUsageFileDelete(file)));
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleReferenceUsageFileRename(file, oldPath)));
        this.register(() => this.clearReferenceUsagePendingFileUpdates());
    }

    private handleReferenceUsageFileCreateOrModify(file: TAbstractFile): void {
        if (!(file instanceof TFile) || !this.shouldAutoProcessReferenceUsageIndexEvents()) return;
        const service = this.getReferenceUsageIndexService();
        if (!service.shouldIndexFile(file)) {
            service.removeFile(file.path);
            return;
        }
        this.scheduleReferenceUsageFileUpdate(file);
    }

    private handleReferenceUsageFileDelete(file: TAbstractFile): void {
        if (!this.shouldAutoProcessReferenceUsageIndexEvents()) return;
        this.getReferenceUsageIndexService().removeFile(file.path);
    }

    private handleReferenceUsageFileRename(file: TAbstractFile, oldPath: string): void {
        if (!this.shouldAutoProcessReferenceUsageIndexEvents()) return;
        this.getReferenceUsageIndexService().removeFile(oldPath);
        this.handleReferenceUsageFileCreateOrModify(file);
    }

    private shouldAutoProcessReferenceUsageIndexEvents(): boolean {
        return this.settings.referenceUsageIndexingEnabled && this.settings.referenceUsageAutoUpdate && this.hasImportedTranslations();
    }

    private scheduleReferenceUsageFileUpdate(file: TFile): void {
        const existingTimeout = this.referenceUsageFileUpdateTimeouts.get(file.path);
        if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
        const timeout = window.setTimeout(() => {
            this.referenceUsageFileUpdateTimeouts.delete(file.path);
            void this.getReferenceUsageIndexService().updateFile(file);
        }, REFERENCE_USAGE_FILE_UPDATE_DELAY_MS);
        this.referenceUsageFileUpdateTimeouts.set(file.path, timeout);
    }

    private clearReferenceUsagePendingFileUpdates(): void {
        for (const timeout of this.referenceUsageFileUpdateTimeouts.values()) window.clearTimeout(timeout);
        this.referenceUsageFileUpdateTimeouts.clear();
        this.referenceUsageIndexService?.clearPendingSave();
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

        for (const view of this.editorViews) {
            view.dispatch({});
        }
    }

    public getBibleReferenceLinkColor(): string {
        return normalizeBibleReferenceLinkColor(this.settings.bibleReferenceLinkColor);
    }


    private registerReadingModeBibleReferenceLinks(): void {
        this.registerMarkdownPostProcessor((element, context) => this.processReadingModeBibleReferences(element, context));
    }

    private processReadingModeBibleReferences(element: HTMLElement, _context: MarkdownPostProcessorContext): void {
        if (!this.hasImportedTranslations()) return;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!(node instanceof Text) || node.data.trim().length === 0) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (parent === null || parent.closest("a,code,pre,script,style,textarea,button,input,select,option,.math,.math-block,.math-inline,.cm-inline-code,.bible-reference-reading-link") !== null) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const textNodes: Text[] = [];
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (node instanceof Text) textNodes.push(node);
        }
        for (const textNode of textNodes) this.replaceReadingModeBibleReferencesInTextNode(textNode);
    }

    private replaceReadingModeBibleReferencesInTextNode(textNode: Text): void {
        const sourceText = textNode.data;
        const matches = this.bibleReferenceParser.parseMatches(sourceText);
        if (matches.length === 0 || textNode.parentNode === null) return;
        const fragment = document.createDocumentFragment();
        let currentOffset = 0;
        for (const match of matches) {
            if (match.from < currentOffset) continue;
            if (match.from > currentOffset) fragment.appendChild(document.createTextNode(sourceText.slice(currentOffset, match.from)));
            const linkEl = document.createElement("a");
            linkEl.href = "#";
            linkEl.textContent = sourceText.slice(match.from, match.to);
            linkEl.className = "bible-reference-link bible-reference-reading-link";
            linkEl.dataset.bibleReference = match.text;
            linkEl.style.color = this.getBibleReferenceLinkColor();
            linkEl.style.textDecoration = "underline";
            linkEl.style.textDecorationStyle = "dotted";
            linkEl.style.cursor = "pointer";
            linkEl.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this.openReadingModeBibleReference(linkEl, match.text);
            });
            fragment.appendChild(linkEl);
            currentOffset = match.to;
        }
        if (currentOffset < sourceText.length) fragment.appendChild(document.createTextNode(sourceText.slice(currentOffset)));
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    private async openReadingModeBibleReference(anchorEl: HTMLElement, referenceText: string): Promise<void> {
        if (!this.hasImportedTranslations()) {
            new Notice(this.t("notice.noImportedTranslations"), 2500);
            return;
        }
        const requestId = ++this.readingModePreviewRequestId;
        const content = await this.analyzeReferenceTextAsync(referenceText);
        if (requestId !== this.readingModePreviewRequestId || content === null || content.plainText.length === 0) return;
        this.readingModePreviewController?.show(content, anchorEl);
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
        for (const [view, controller] of this.previewControllers.entries()) {
            if (view.hasFocus || view.dom.contains(document.activeElement)) {
                return controller.openBibleReferenceUnderCursor(showNotice);
            }
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
    public showBiblePreviewContent(content: BiblePreviewContent, anchor: FloatingBiblePreviewAnchor = { type: "default" }): void {
        if (this.settings.previewDisplayMode === "side-panel") {
            void this.showBiblePreviewInPanel(content);
            this.hideFloatingBiblePreview();
            return;
        }

        this.showFloatingBiblePreview(content, anchor);
    }
    public showFloatingBiblePreview(content: BiblePreviewContent, anchor: FloatingBiblePreviewAnchor = { type: "default" }): void {
        this.floatingPreviewWindow?.show(content, anchor);
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
    private async showBiblePreviewInPanel(content: BiblePreviewContent): Promise<void> {
        this.lastPanePreviewContent = content;
        const activeLeafBeforeOpen = this.app.workspace.activeLeaf;
        const restoreActiveLeaf = !Platform.isMobileApp && activeLeafBeforeOpen?.view instanceof MarkdownView ? activeLeafBeforeOpen : null;
        const view = await this.getOrCreateBiblePreviewPaneView({ restoreActiveLeaf });
        if (view === null) {
            return;
        }
        this.applyContentToPaneView(view, content);
    }

    private applyContentToPaneView(view: BiblePreviewPaneView, content: BiblePreviewContent): void {
        view.setContent(content);
        window.requestAnimationFrame(() => view.setContent(content));
        window.setTimeout(() => view.setContent(content), 50);
        window.setTimeout(() => view.setContent(content), 250);
    }

    private async getOrCreateBiblePreviewPaneView(options: { restoreActiveLeaf?: WorkspaceLeaf | null } = {}): Promise<BiblePreviewPaneView | null> {
        const existingLeaf = this.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE);
        if (existingLeaf !== null) {
            const existingView = existingLeaf.view;
            if (existingView instanceof BiblePreviewPaneView) {
                this.biblePreviewPaneIsActiveInSideDock = true;
                this.expandBiblePreviewSideDock();
                await this.revealLeafWithoutStealingEditorFocus(existingLeaf, {
                    restoreActiveLeaf: options.restoreActiveLeaf ?? null,
                    focus: false,
                });
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
            this.expandBiblePreviewSideDock();
            await leaf.setViewState({ type: BIBLE_PREVIEW_VIEW_TYPE, active: true });
            this.biblePreviewPaneIsActiveInSideDock = true;
            this.expandBiblePreviewSideDock();
            await this.revealLeafWithoutStealingEditorFocus(leaf, {
                restoreActiveLeaf: options.restoreActiveLeaf ?? null,
                focus: false,
            });
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

        while (isRecord(parent) && !visitedParents.has(parent)) {
            visitedParents.add(parent);
            const setActiveLeaf = parent["setActiveLeaf"];
            if (typeof setActiveLeaf === "function") {
                setActiveLeaf.call(parent, leaf);
            }
            parent = parent["parent"];
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
        const plugin = this;
        const cursorPlugin = ViewPlugin.fromClass(class {
            lastParagraph = "";
            requestId = 0;
            referenceLinkUpdateTimeout: number | null = null;
            lastActiveTranslationId = plugin.activeTranslationId;
            lastPluginRuntimeEnabled = false;
            private clickedReference: { from: number; to: number; text: string } | null = null;
            private lastPreviewTriggerMode = plugin.getBiblePreviewTriggerMode();
            private readonly outsideInteractionHandler = (event: Event) => this.hideBiblePreviewIfEventIsOutsideEditor(event);
            private readonly editorClickHandler = (event: MouseEvent) => this.handleEditorClick(event);

            constructor(private readonly view: EditorView) {
                plugin.editorViews.add(view);
                plugin.previewControllers.set(view, this);
                this.lastPluginRuntimeEnabled = plugin.shouldRunBiblePreviewForEditor(view);
                this.view.dom.addEventListener("click", this.editorClickHandler);
                this.scheduleReferenceLinkUpdate();
            }

            update(update: ViewUpdate) {
                const pluginRuntimeEnabled = plugin.shouldRunBiblePreviewForEditor(this.view);
                if (this.lastPluginRuntimeEnabled !== pluginRuntimeEnabled) {
                    this.lastPluginRuntimeEnabled = pluginRuntimeEnabled;
                    this.lastParagraph = "";
                    this.clickedReference = null;
                    this.requestId += 1;
                    if (this.referenceLinkUpdateTimeout !== null) {
                        window.clearTimeout(this.referenceLinkUpdateTimeout);
                        this.referenceLinkUpdateTimeout = null;
                    }
                    if (!pluginRuntimeEnabled) {
                        this.hideBiblePreview(true);
                        dispatchBibleReferenceLinkDecorations(this.view, Decoration.none);
                    } else {
                        this.scheduleReferenceLinkUpdate();
                    }
                }
                if (!pluginRuntimeEnabled) {
                    return;
                }

                if (this.lastActiveTranslationId !== plugin.activeTranslationId) {
                    this.lastActiveTranslationId = plugin.activeTranslationId;
                    this.lastParagraph = "";
                    this.clickedReference = null;
                    this.requestId += 1;
                    plugin.refreshFloatingPreviewLabels();
                    this.scheduleReferenceLinkUpdate();
                }

                const previewTriggerMode = plugin.getBiblePreviewTriggerMode();
                if (this.lastPreviewTriggerMode !== previewTriggerMode) {
                    this.lastPreviewTriggerMode = previewTriggerMode;
                    this.clickedReference = null;
                    this.hideBiblePreview(true);
                }

                if (update.docChanged || update.viewportChanged) {
                    this.scheduleReferenceLinkUpdate();
                }

                if (!update.selectionSet && !update.docChanged) {
                    return;
                }

                if (!plugin.hasImportedTranslations()) {
                    this.lastParagraph = "";
                    this.clickedReference = null;
                    this.requestId += 1;
                    this.hideBiblePreview();
                    return;
                }

                if (previewTriggerMode === "clicked-reference") {
                    if (update.docChanged) {
                        this.updateClickedReferenceAfterDocumentChange(update);
                    }
                    return;
                }

                const paragraph = plugin.getCurrentParagraph(update);
                if (paragraph === this.lastParagraph) {
                    return;
                }

                this.lastParagraph = paragraph;
                const currentRequestId = ++this.requestId;
                if (!paragraph) {
                    this.hideBiblePreview();
                    return;
                }

                void plugin.analyzeParagraphAsync(paragraph).then((content) => {
                    if (currentRequestId !== this.requestId || paragraph !== this.lastParagraph) {
                        return;
                    }
                    if (content === null || content.plainText.length === 0) {
                        this.hideBiblePreview();
                        return;
                    }
                    plugin.showBiblePreviewContent(content, { type: "default" });
                });
            }

            destroy() {
                if (this.referenceLinkUpdateTimeout !== null) {
                    window.clearTimeout(this.referenceLinkUpdateTimeout);
                    this.referenceLinkUpdateTimeout = null;
                }
                this.view.dom.removeEventListener("click", this.editorClickHandler);
                plugin.previewControllers.delete(this.view);
                plugin.editorViews.delete(this.view);
            }

            public refreshLocalizedLabels(): void {
                plugin.refreshFloatingPreviewLabels();
            }

            public openBibleReferenceUnderCursor(showNotice = false): boolean {
                if (!plugin.shouldRunBiblePreviewForEditor(this.view)) {
                    if (showNotice) {
                        new Notice(plugin.t("notice.pluginInactive"), 2500);
                    }
                    return false;
                }
                if (!plugin.hasImportedTranslations()) {
                    if (showNotice) {
                        new Notice(plugin.t("notice.noImportedTranslations"), 2500);
                    }
                    return false;
                }
                const position = this.view.state.selection.main.head;
                const match = plugin.findBibleReferenceMatchAtPosition(this.view, position);
                if (match === null) {
                    if (showNotice) {
                        new Notice(plugin.t("notice.referenceUnderCursorNotFound"), 2500);
                    }
                    return false;
                }
                this.openBibleReferenceMatch(match);
                return true;
            }

            private handleEditorClick(event: MouseEvent): void {
                if (!plugin.shouldRunBiblePreviewForEditor(this.view)) {
                    return;
                }
                if (plugin.getBiblePreviewTriggerMode() !== "clicked-reference" || !plugin.hasImportedTranslations()) {
                    return;
                }
                const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (position === null) {
                    return;
                }
                const match = plugin.findBibleReferenceMatchAtPosition(this.view, position);
                if (match === null) {
                    return;
                }
                if (
                    Platform.isMobileApp
                    && plugin.getBiblePreviewDisplayMode() === "side-panel"
                    && plugin.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE) !== null
                    && this.clickedReference?.from === match.from
                    && this.clickedReference.to === match.to
                    && this.clickedReference.text === match.text
                ) {
                    return;
                }
                event.preventDefault();
                this.openBibleReferenceMatch(match);
            }

            private openBibleReferenceMatch(match: { from: number; to: number; text: string }): void {
                this.clickedReference = match;
                this.lastParagraph = "";
                const currentRequestId = ++this.requestId;
                void plugin.analyzeReferenceTextAsync(match.text).then((content) => {
                    if (currentRequestId !== this.requestId || this.clickedReference?.text !== match.text) {
                        return;
                    }
                    if (content === null || content.plainText.length === 0) {
                        this.clickedReference = null;
                        this.hideBiblePreview(true);
                        return;
                    }
                    plugin.showBiblePreviewContent(content, { type: "default" });
                });
            }

            private updateClickedReferenceAfterDocumentChange(update: ViewUpdate): void {
                if (this.clickedReference === null) {
                    return;
                }
                const currentReference = this.clickedReference;
                if (this.didChangesTouchRange(update, currentReference.from, currentReference.to)) {
                    this.clickedReference = null;
                    this.hideBiblePreview(true);
                    return;
                }
                const nextFrom = update.changes.mapPos(currentReference.from, 1);
                const nextTo = update.changes.mapPos(currentReference.to, -1);
                if (nextFrom >= nextTo) {
                    this.clickedReference = null;
                    this.hideBiblePreview(true);
                    return;
                }
                const nextText = update.state.doc.sliceString(nextFrom, nextTo);
                if (nextText !== currentReference.text) {
                    this.clickedReference = null;
                    this.hideBiblePreview(true);
                    return;
                }
                const nextMatch = plugin.findBibleReferenceMatchAtPosition(this.view, nextFrom);
                if (
                    nextMatch === null
                    || nextMatch.from !== nextFrom
                    || nextMatch.to !== nextTo
                    || nextMatch.text !== currentReference.text
                ) {
                    this.clickedReference = null;
                    this.hideBiblePreview(true);
                    return;
                }
                this.clickedReference = {
                    ...currentReference,
                    from: nextFrom,
                    to: nextTo,
                };
            }

            private didChangesTouchRange(update: ViewUpdate, from: number, to: number): boolean {
                let touched = false;
                update.changes.iterChangedRanges((changedFrom, changedTo) => {
                    if (changedFrom === changedTo) {
                        if (changedFrom > from && changedFrom < to) {
                            touched = true;
                        }
                        return;
                    }
                    if (changedFrom < to && changedTo > from) {
                        touched = true;
                    }
                });
                return touched;
            }

            private hideBiblePreview(resetParagraphCache = false): void {
                plugin.hideFloatingBiblePreview();
                if (resetParagraphCache) {
                    this.lastParagraph = "";
                    this.clickedReference = null;
                    this.requestId += 1;
                }
            }

            private registerOutsideInteractionListeners(): void {
                document.addEventListener("pointerdown", this.outsideInteractionHandler, true);
                document.addEventListener("focusin", this.outsideInteractionHandler, true);
            }

            private unregisterOutsideInteractionListeners(): void {
                document.removeEventListener("pointerdown", this.outsideInteractionHandler, true);
                document.removeEventListener("focusin", this.outsideInteractionHandler, true);
            }

            private hideBiblePreviewIfEventIsOutsideEditor(event: Event): void {
                const target = event.target;
                if (!(target instanceof Node)) {
                    return;
                }
                if (this.view.dom.contains(target) || plugin.isFloatingPreviewTarget(target)) {
                    return;
                }
                this.hideBiblePreview(true);
            }

            private scheduleReferenceLinkUpdate(): void {
                if (!plugin.shouldRunBiblePreviewForEditor(this.view)) {
                    return;
                }
                if (this.referenceLinkUpdateTimeout !== null) {
                    window.clearTimeout(this.referenceLinkUpdateTimeout);
                }
                this.referenceLinkUpdateTimeout = window.setTimeout(() => {
                    this.referenceLinkUpdateTimeout = null;
                    dispatchBibleReferenceLinkDecorations(this.view, plugin.createBibleReferenceLinkDecorations(this.view));
                }, 75);
            }
        });

        return [
            bibleReferenceLinkDecorationsField,
            bibleReferenceLinkTheme,
            cursorPlugin,
        ];
    }


    private hasImportedTranslations(): boolean {
        return this.activeV2Data !== null
            && this.activeTranslationId !== null
            && this.activeV2Data.translations[this.activeTranslationId] !== undefined;
    }

    private createBibleReferenceLinkDecorations(view: EditorView): DecorationSet {
        if (!this.shouldRunBiblePreviewForEditor(view)) {
            return Decoration.none;
        }
        if (!this.hasImportedTranslations()) {
            return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();

        for (const range of view.visibleRanges) {
            const text = view.state.doc.sliceString(range.from, range.to);
            const matches = this.bibleReferenceParser.parseMatches(text);

            for (const match of matches) {
                builder.add(
                    range.from + match.from,
                    range.from + match.to,
                    Decoration.mark({
                        class: "bible-reference-link",
                        attributes: { style: `color: ${this.getBibleReferenceLinkColor()};` },
                    }),
                );
            }
        }

        return builder.finish();
    }

    private refreshBibleReferenceLinks(): void {
        for (const view of this.editorViews) {
            dispatchBibleReferenceLinkDecorations(view, this.createBibleReferenceLinkDecorations(view));
        }
    }

    private clearBibleReferenceLinks(): void {
        for (const view of this.editorViews) {
            dispatchBibleReferenceLinkDecorations(view, Decoration.none);
        }
    }

    async analyzeParagraphAsync(text: string): Promise<BiblePreviewContent | null> {
        try {
            if (!this.hasImportedTranslations() || this.activeTranslationId === null) {
                return null;
            }

            const matches = this.bibleReferenceParser.parseMatches(text);
            if (matches.length === 0) return null;
            const bibleTextBlocks = (await Promise.all(matches.map((match) =>
                getBibleTextBlocks(match.references, this.bibleIndex, this.activeTranslationId!, match.text),
            ))).flat();
            if (bibleTextBlocks.length === 0) return null;
            const content = formatBibleTextBlocks(bibleTextBlocks, this.bookMapping, this.t("preview.missingVerse"));
            return content.plainText.length === 0 ? null : content;
        } catch { return null; }
    }

    async analyzeReferenceTextAsync(text: string): Promise<BiblePreviewContent | null> {
        return this.analyzeParagraphAsync(text);
    }

    private findBibleReferenceMatchAtPosition(view: EditorView, position: number): { from: number; to: number; text: string } | null {
        const line = view.state.doc.lineAt(position);
        const offset = position - line.from;
        const matches = this.bibleReferenceParser.parseMatches(line.text);

        for (const match of matches) {
            if (offset >= match.from && offset <= match.to) {
                return {
                    from: line.from + match.from,
                    to: line.from + match.to,
                    text: match.text,
                };
            }
        }

        return null;
    }

    private getCurrentAnalysisFragment(update: ViewUpdate): { text: string; end: number } | null {
        const doc = update.state.doc;
        const cursorPosition = update.state.selection.main.head;
        const line = doc.lineAt(cursorPosition);

        if (line.text.trim() === "") {
            return null;
        }

        if (line.text.length > MAX_ANALYZED_PARAGRAPH_CHARACTERS) {
            return this.getCurrentLineAnalysisFragment(line.text, line.from, cursorPosition);
        }

        const lines: string[] = [line.text];
        let characterCount = line.text.length;
        let topLine = line;
        let bottomLine = line;
        let canExpandUp = true;
        let canExpandDown = true;

        while (lines.length < MAX_ANALYZED_PARAGRAPH_LINES && (canExpandUp || canExpandDown)) {
            let expanded = false;

            if (canExpandUp && lines.length < MAX_ANALYZED_PARAGRAPH_LINES) {
                if (topLine.number <= 1) {
                    canExpandUp = false;
                } else {
                    const previousLine = doc.line(topLine.number - 1);

                    if (previousLine.text.trim() === "") {
                        canExpandUp = false;
                    } else if (characterCount + previousLine.text.length + 1 > MAX_ANALYZED_PARAGRAPH_CHARACTERS) {
                        canExpandUp = false;
                    } else {
                        lines.unshift(previousLine.text);
                        characterCount += previousLine.text.length + 1;
                        topLine = previousLine;
                        expanded = true;
                    }
                }
            }

            if (canExpandDown && lines.length < MAX_ANALYZED_PARAGRAPH_LINES) {
                if (bottomLine.number >= doc.lines) {
                    canExpandDown = false;
                } else {
                    const nextLine = doc.line(bottomLine.number + 1);

                    if (nextLine.text.trim() === "") {
                        canExpandDown = false;
                    } else if (characterCount + nextLine.text.length + 1 > MAX_ANALYZED_PARAGRAPH_CHARACTERS) {
                        canExpandDown = false;
                    } else {
                        lines.push(nextLine.text);
                        characterCount += nextLine.text.length + 1;
                        bottomLine = nextLine;
                        expanded = true;
                    }
                }
            }

            if (!expanded && !canExpandUp && !canExpandDown) {
                break;
            }
        }

        return {
            text: lines.join("\n"),
            end: bottomLine.to,
        };
    }

    private getCurrentLineAnalysisFragment(lineText: string, lineFrom: number, cursorPosition: number): { text: string; end: number } {
        const cursorOffset = cursorPosition - lineFrom;
        const halfLimit = Math.floor(MAX_ANALYZED_PARAGRAPH_CHARACTERS / 2);
        let fromOffset = Math.max(0, cursorOffset - halfLimit);
        let toOffset = Math.min(lineText.length, fromOffset + MAX_ANALYZED_PARAGRAPH_CHARACTERS);

        if (toOffset === lineText.length) {
            fromOffset = Math.max(0, toOffset - MAX_ANALYZED_PARAGRAPH_CHARACTERS);
        }

        return {
            text: lineText.slice(fromOffset, toOffset),
            end: lineFrom + toOffset,
        };
    }

    getCurrentParagraph(update: ViewUpdate): string {
        return this.getCurrentAnalysisFragment(update)?.text ?? "";
    }

    async openBibleIndexFolder(): Promise<void> {
        const directoryPath = this.getBibleIndexDataDirectoryPath();
        await this.ensureVaultDirectoryExists(directoryPath);

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

    private async ensureVaultDirectoryExists(path: string): Promise<void> {
        const normalizedPath = normalizePath(path);
        if (normalizedPath.length === 0 || await this.app.vault.adapter.exists(normalizedPath)) return;
        const parentPath = getDirectoryPath(normalizedPath);
        if (parentPath.length > 0 && parentPath !== normalizedPath) await this.ensureVaultDirectoryExists(parentPath);
        if (!(await this.app.vault.adapter.exists(normalizedPath))) await this.app.vault.adapter.mkdir(normalizedPath);
    }

    async showBibleIndexStats(): Promise<void> {
        const repository = this.createObsidianBibleIndexRepository();
        await repository.load();
        const report = await repository.readLastImportReport();

        if (report !== null) {
            new Notice([
                this.t("notice.lastImport"),
                this.t("import.summary.translation", { translationName: report.translationName }),
                this.t("import.summary.language", { language: report.language }),
                this.t("import.summary.books", { count: report.books }),
                this.t("import.summary.chapters", { count: report.chapters }),
                this.t("import.summary.verses", { count: report.verses }),
                this.t("import.summary.footnotes", { count: report.footnotes }),
                this.t("import.summary.metadataSize", { size: formatKilobytes(report.metadataBytes) }),
                this.t("import.summary.booksSize", { size: formatMegabytes(report.booksBytes) }),
            ].join("\n"), 15000);
            return;
        }

        if (this.activeV2Data !== null) {
            const translationCount = Object.keys(this.activeV2Data.translations).length;
            new Notice([
                this.t("notice.bibleIndexV2"),
                this.t("notice.translationCount", { count: translationCount }),
                this.t("notice.activeTranslationId", { translationId: this.activeTranslationId ?? this.t("notice.none") }),
            ].join("\n"), 10000);
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
        for (const controller of this.previewControllers.values()) {
            controller.refreshLocalizedLabels();
        }
        this.readingModePreviewController?.refreshLocalizedLabels();
        for (const leaf of this.getWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE)) {
            if (leaf.view instanceof BiblePreviewPaneView) {
                leaf.view.refreshInput(this.createBiblePreviewPaneViewInput());
            }
        }
        new Notice(this.t("notice.restartPluginForCommandNames"), 6000);
    }

    private localizeImportErrorMessage(error: unknown): string {
        const message = getErrorMessage(error);
        if (message === "EPUB does not contain XHTML documents.") {
            return this.t("import.error.noXhtml");
        }
        if (message === "EPUB complete 66-book table was not found. Import cannot continue without a validated book table.") {
            return this.t("import.error.noBookTable");
        }
        if (message === "EPUB import completed without extracted verses.") {
            return this.t("import.error.noVerses");
        }
        if (message === "EPUB container.xml does not contain OPF rootfile path.") {
            return this.t("import.error.containerNoRootfile");
        }
        const fileNotFoundMatch = /^EPUB file not found: (.+)$/.exec(message);
        if (fileNotFoundMatch !== null) {
            return this.t("import.error.fileNotFound", { path: fileNotFoundMatch[1] });
        }
        return message;
    }

}




class ReferenceUsageResultsModal extends Modal {
    constructor(
        app: App,
        private readonly locale: BiblePluginLocale,
        private readonly titleText: string,
        private readonly results: ReferenceUsageSearchResult[],
        private readonly openResult: (result: ReferenceUsageSearchResult) => void,
    ) {
        super(app);
    }
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.titleText });
        if (this.results.length === 0) {
            contentEl.createEl("p", { text: t(this.locale, "modal.referenceUsages.empty") });
            return;
        }
        contentEl.createEl("p", { text: t(this.locale, "modal.referenceUsages.count", { count: this.results.length }) });
        const listEl = contentEl.createDiv();
        listEl.style.display = "flex";
        listEl.style.flexDirection = "column";
        listEl.style.gap = "8px";
        for (const result of this.results) {
            const rowEl = listEl.createDiv();
            rowEl.style.border = "1px solid var(--background-modifier-border)";
            rowEl.style.borderRadius = "6px";
            rowEl.style.padding = "8px";
            const buttonEl = rowEl.createEl("button", { text: `${result.filePath}:${result.line}` });
            buttonEl.style.marginBottom = "6px";
            buttonEl.addEventListener("click", (event) => {
                event.preventDefault();
                this.openResult(result);
                this.close();
            });
            rowEl.createDiv({ text: result.sourceText }).style.fontWeight = "600";
            const excerptEl = rowEl.createDiv({ text: result.excerpt });
            excerptEl.style.fontSize = "12px";
            excerptEl.style.color = "var(--text-muted)";
            excerptEl.style.marginTop = "4px";
        }
    }
    onClose(): void {
        this.contentEl.empty();
    }
}

class BibleReadingModePreviewController {
    private readonly outsideInteractionHandler = (event: Event) => this.hideBiblePreviewIfEventIsOutside(event);

    constructor(private readonly plugin: BiblePlugin) { }

    public show(content: BiblePreviewContent, anchorEl: HTMLElement): void {
        this.plugin.showBiblePreviewContent(content, { type: "element", element: anchorEl });
    }

    public destroy(): void { }

    public refreshLocalizedLabels(): void {
        this.plugin.refreshFloatingPreviewLabels();
    }

    private registerListeners(): void {
        document.addEventListener("pointerdown", this.outsideInteractionHandler, true);
        document.addEventListener("focusin", this.outsideInteractionHandler, true);
    }

    private unregisterListeners(): void {
        document.removeEventListener("pointerdown", this.outsideInteractionHandler, true);
        document.removeEventListener("focusin", this.outsideInteractionHandler, true);
    }

    private hideBiblePreviewIfEventIsOutside(event: Event): void {
        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }
        if (this.plugin.isFloatingPreviewTarget(target)) {
            return;
        }
        if (target instanceof HTMLElement && target.closest(".bible-reference-reading-link") !== null) {
            return;
        }
        this.plugin.hideFloatingBiblePreview();
    }
}


type CssColorPreset = {
    label: string;
    value: string;
};

type CssColorDialogInput = {
    title: string;
    description: string;
    value: string;
    defaultValue: string;
    previewText: string;
    presets: CssColorPreset[];
    normalize(value: string): string;
    onApply(value: string): void;
};

class CssColorDialog extends Modal {
    private value: string;
    private hue = 260;
    private saturation = 58;
    private brightness = 93;
    private readonly recentValues: string[] = [];

    constructor(app: App, private readonly locale: BiblePluginLocale, private readonly input: CssColorDialogInput) {
        super(app);
        this.value = input.value;
        this.recentValues = [input.value, input.defaultValue].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
        const hsv = parseCssColorPickerHex(input.value) ?? parseCssColorPickerHex(input.defaultValue);
        if (hsv !== null) {
            this.hue = hsv.h;
            this.saturation = hsv.s;
            this.brightness = hsv.v;
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.input.title });
        contentEl.createEl("p", { text: this.input.description });

        const previewEl = contentEl.createDiv({ text: this.input.previewText });
        previewEl.style.border = "1px solid var(--background-modifier-border)";
        previewEl.style.borderRadius = "6px";
        previewEl.style.padding = "10px";
        previewEl.style.marginBottom = "10px";
        previewEl.style.background = this.input.normalize(this.value);
        previewEl.style.color = "var(--text-normal)";

        const inputEl = contentEl.createEl("input");
        inputEl.type = "text";
        inputEl.value = this.value;
        inputEl.placeholder = "#e6e2d8, var(--background-primary), color-mix(...)";
        inputEl.style.width = "100%";
        inputEl.style.boxSizing = "border-box";
        inputEl.style.marginBottom = "10px";

        const statusEl = contentEl.createDiv();
        statusEl.style.fontSize = "12px";
        statusEl.style.color = "var(--text-muted)";
        statusEl.style.marginBottom = "10px";

        const pickerTitleEl = contentEl.createDiv({ text: t(this.locale, "settings.colorDialog.picker") });
        pickerTitleEl.style.fontWeight = "600";
        pickerTitleEl.style.marginBottom = "6px";

        const pickerWrapEl = contentEl.createDiv();
        pickerWrapEl.style.display = "grid";
        pickerWrapEl.style.gridTemplateColumns = "minmax(180px, 1fr) 24px";
        pickerWrapEl.style.gap = "10px";
        pickerWrapEl.style.alignItems = "stretch";
        pickerWrapEl.style.marginBottom = "12px";

        const saturationEl = pickerWrapEl.createDiv();
        saturationEl.style.position = "relative";
        saturationEl.style.height = "150px";
        saturationEl.style.borderRadius = "8px";
        saturationEl.style.border = "1px solid var(--background-modifier-border)";
        saturationEl.style.cursor = "crosshair";
        saturationEl.style.overflow = "hidden";
        saturationEl.style.touchAction = "none";

        const saturationMarkerEl = saturationEl.createDiv();
        saturationMarkerEl.style.position = "absolute";
        saturationMarkerEl.style.width = "14px";
        saturationMarkerEl.style.height = "14px";
        saturationMarkerEl.style.border = "2px solid white";
        saturationMarkerEl.style.borderRadius = "50%";
        saturationMarkerEl.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.65)";
        saturationMarkerEl.style.pointerEvents = "none";
        saturationMarkerEl.style.transform = "translate(-7px, -7px)";

        const hueEl = pickerWrapEl.createDiv();
        hueEl.style.position = "relative";
        hueEl.style.width = "24px";
        hueEl.style.borderRadius = "8px";
        hueEl.style.border = "1px solid var(--background-modifier-border)";
        hueEl.style.cursor = "ns-resize";
        hueEl.style.touchAction = "none";
        hueEl.style.background = "linear-gradient(to bottom, #ff0000 0%, #ffff00 16.67%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.67%, #ff00ff 83.33%, #ff0000 100%)";

        const hueMarkerEl = hueEl.createDiv();
        hueMarkerEl.style.position = "absolute";
        hueMarkerEl.style.left = "-3px";
        hueMarkerEl.style.right = "-3px";
        hueMarkerEl.style.height = "4px";
        hueMarkerEl.style.borderRadius = "4px";
        hueMarkerEl.style.background = "white";
        hueMarkerEl.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.65)";
        hueMarkerEl.style.pointerEvents = "none";

        const updatePickerUi = (): void => {
            const hueColor = hsvToHex(this.hue, 100, 100);
            saturationEl.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`;
            saturationMarkerEl.style.left = `${this.saturation}%`;
            saturationMarkerEl.style.top = `${100 - this.brightness}%`;
            hueMarkerEl.style.top = `${(this.hue / 360) * 100}%`;
        };

        const applyValue = (value: string, syncPicker: boolean): void => {
            this.value = value.trim();
            inputEl.value = this.value;
            const normalized = this.input.normalize(this.value);
            previewEl.style.background = normalized;
            statusEl.textContent = isCssColor(this.value)
                ? t(this.locale, "settings.colorDialog.valid")
                : t(this.locale, "settings.colorDialog.invalid");
            if (syncPicker) {
                const hsv = parseCssColorPickerHex(this.value);
                if (hsv !== null) {
                    this.hue = hsv.h;
                    this.saturation = hsv.s;
                    this.brightness = hsv.v;
                }
            }
            updatePickerUi();
        };

        const applyPickerValue = (): void => {
            applyValue(hsvToHex(this.hue, this.saturation, this.brightness), false);
        };

        const updateSaturationFromPointer = (event: PointerEvent): void => {
            const rect = saturationEl.getBoundingClientRect();
            const x = clampColorDialogNumber((event.clientX - rect.left) / rect.width, 0, 1);
            const y = clampColorDialogNumber((event.clientY - rect.top) / rect.height, 0, 1);
            this.saturation = Math.round(x * 100);
            this.brightness = Math.round((1 - y) * 100);
            applyPickerValue();
        };

        const updateHueFromPointer = (event: PointerEvent): void => {
            const rect = hueEl.getBoundingClientRect();
            const y = clampColorDialogNumber((event.clientY - rect.top) / rect.height, 0, 1);
            this.hue = Math.round(y * 360) % 360;
            applyPickerValue();
        };

        this.bindColorDialogPointerDrag(saturationEl, updateSaturationFromPointer);
        this.bindColorDialogPointerDrag(hueEl, updateHueFromPointer);

        inputEl.addEventListener("input", () => applyValue(inputEl.value, true));
        applyValue(this.value, true);

        const presetsTitleEl = contentEl.createDiv({ text: t(this.locale, "settings.colorDialog.palette") });
        presetsTitleEl.style.fontWeight = "600";
        presetsTitleEl.style.marginBottom = "6px";

        const presetsEl = contentEl.createDiv();
        presetsEl.style.display = "grid";
        presetsEl.style.gridTemplateColumns = "repeat(auto-fill, minmax(128px, 1fr))";
        presetsEl.style.gap = "6px";
        presetsEl.style.marginBottom = "12px";
        const presets = [...this.input.presets, ...this.recentValues.map((value) => ({ label: t(this.locale, "settings.colorDialog.current"), value }))];
        for (const preset of presets) {
            const buttonEl = presetsEl.createEl("button");
            buttonEl.type = "button";
            buttonEl.style.display = "flex";
            buttonEl.style.alignItems = "center";
            buttonEl.style.gap = "6px";
            buttonEl.style.justifyContent = "flex-start";
            buttonEl.addEventListener("click", (event) => {
                event.preventDefault();
                applyValue(preset.value, true);
            });
            const swatchEl = buttonEl.createSpan();
            swatchEl.style.width = "16px";
            swatchEl.style.height = "16px";
            swatchEl.style.borderRadius = "4px";
            swatchEl.style.border = "1px solid var(--background-modifier-border)";
            swatchEl.style.background = this.input.normalize(preset.value);
            buttonEl.appendChild(swatchEl);
            buttonEl.appendText(preset.label);
        }

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(t(this.locale, "settings.colorDialog.cancel"))
                .onClick(() => this.close()))
            .addButton((button) => button
                .setButtonText(t(this.locale, "settings.colorDialog.default"))
                .onClick(() => applyValue(this.input.defaultValue, true)))
            .addButton((button) => button
                .setButtonText(t(this.locale, "settings.colorDialog.apply"))
                .setCta()
                .onClick(() => {
                    this.input.onApply(this.input.normalize(this.value));
                    this.close();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private bindColorDialogPointerDrag(element: HTMLElement, onPointerMove: (event: PointerEvent) => void): void {
        element.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            element.setPointerCapture(event.pointerId);
            onPointerMove(event);
            const handlePointerMove = (moveEvent: PointerEvent): void => {
                if (moveEvent.pointerId === event.pointerId) {
                    moveEvent.preventDefault();
                    onPointerMove(moveEvent);
                }
            };
            const handlePointerUp = (upEvent: PointerEvent): void => {
                if (upEvent.pointerId !== event.pointerId) {
                    return;
                }
                element.releasePointerCapture(event.pointerId);
                element.removeEventListener("pointermove", handlePointerMove);
                element.removeEventListener("pointerup", handlePointerUp);
                element.removeEventListener("pointercancel", handlePointerUp);
            };
            element.addEventListener("pointermove", handlePointerMove);
            element.addEventListener("pointerup", handlePointerUp);
            element.addEventListener("pointercancel", handlePointerUp);
        });
    }
}

function createTextColorPresets(): CssColorPreset[] {
    return [
        { label: "Theme link", value: DEFAULT_BIBLE_REFERENCE_LINK_COLOR },
        { label: "Violet", value: "#7c3aed" },
        { label: "Blue", value: "#2563eb" },
        { label: "Green", value: "#16a34a" },
        { label: "Orange", value: "#d97706" },
        { label: "Red", value: "#dc2626" },
        { label: "Gray", value: "#6b7280" },
    ];
}

function createBackgroundColorPresets(): CssColorPreset[] {
    return [
        { label: "Theme dark", value: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR },
        { label: "Theme primary", value: "var(--background-primary)" },
        { label: "Theme secondary", value: "var(--background-secondary)" },
        { label: "Paper", value: "#e6e2d8" },
        { label: "Warm", value: "#f3ead7" },
        { label: "Gray", value: "#e5e7eb" },
        { label: "Dark", value: "#1f2937" },
        { label: "Blue gray", value: "#dbe3ea" },
    ];
}

type HsvColor = {
    h: number;
    s: number;
    v: number;
};

function isCssColor(value: string): boolean {
    const color = value.trim();
    if (color.length === 0) {
        return false;
    }
    return typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("color", color) || CSS.supports("background", color);
}

function parseCssColorPickerHex(value: string): HsvColor | null {
    const color = value.trim();
    if (!isHexColor(color)) {
        return null;
    }
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return rgbToHsv(red, green, blue);
}

function hsvToHex(hue: number, saturation: number, brightness: number): string {
    const { red, green, blue } = hsvToRgb(hue, saturation, brightness);
    return `#${toColorDialogHex(red)}${toColorDialogHex(green)}${toColorDialogHex(blue)}`;
}

function toColorDialogHex(value: number): string {
    return clampColorDialogNumber(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
        if (max === r) {
            hue = 60 * (((g - b) / delta) % 6);
        } else if (max === g) {
            hue = 60 * ((b - r) / delta + 2);
        } else {
            hue = 60 * ((r - g) / delta + 4);
        }
    }
    if (hue < 0) {
        hue += 360;
    }
    return {
        h: Math.round(hue),
        s: max === 0 ? 0 : Math.round((delta / max) * 100),
        v: Math.round(max * 100),
    };
}

function hsvToRgb(hue: number, saturation: number, brightness: number): { red: number; green: number; blue: number } {
    const h = ((hue % 360) + 360) % 360;
    const s = clampColorDialogNumber(saturation, 0, 100) / 100;
    const v = clampColorDialogNumber(brightness, 0, 100) / 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    return {
        red: Math.round((r + m) * 255),
        green: Math.round((g + m) * 255),
        blue: Math.round((b + m) * 255),
    };
}

function clampColorDialogNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

type BibleTranslationImportSettings = {
    translationName: string;
    translationNamePlaceholder: string;
    language: string;
    translationId: string;
};

class BibleTranslationImportModal extends Modal {
    private value: BibleTranslationImportSettings;
    private resolved = false;

    constructor(
        app: App,
        defaults: BibleTranslationImportSettings,
        private readonly translationAlreadyExists: boolean,
        private readonly locale: BiblePluginLocale,
        private readonly resolve: (value: BibleTranslationImportSettings | null) => void,
    ) {
        super(app);
        this.value = { ...defaults };
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: t(this.locale, "modal.import.title") });

        if (this.translationAlreadyExists) {
            contentEl.createEl("p", {
                text: t(this.locale, "modal.import.replaceWarning"),
                cls: "mod-warning",
            });
        } else {
            contentEl.createEl("p", {
                text: t(this.locale, "modal.import.description"),
            });
        }


        const translationNameSetting = new Setting(contentEl)
            .setName(t(this.locale, "modal.import.translationName"));

        translationNameSetting.settingEl.style.flexDirection = "column";
        translationNameSetting.settingEl.style.alignItems = "stretch";
        translationNameSetting.controlEl.style.width = "100%";

        translationNameSetting.addText((text) => {
            text
                .setPlaceholder(this.value.translationNamePlaceholder || t(this.locale, "defaults.translationNamePlaceholder"))
                .setValue(this.value.translationName)
                .onChange((value) => {
                    this.value.translationName = value.trim();
                });

            text.inputEl.style.width = "100%";
        });


        new Setting(contentEl)
            .setName(t(this.locale, "modal.import.language"))
            .setDesc(this.value.language || t(this.locale, "modal.import.undefined"));

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(t(this.locale, "modal.import.cancel"))
                .onClick(() => this.finish(null)))
            .addButton((button) => button
                .setButtonText(t(this.locale, "modal.import.import"))
                .setCta()
                .onClick(() => this.finish(this.value)));
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.resolved) {
            this.finish(null);
        }
    }

    private finish(value: BibleTranslationImportSettings | null): void {
        if (this.resolved) return;

        if (value === null) {
            this.resolved = true;
            this.resolve(null);
            this.close();
            return;
        }

        const translationName = value.translationName.trim();

        if (translationName.length === 0) {
            new Notice(t(this.locale, "modal.import.translationNameRequired"), 5000);
            return;
        }

        this.resolved = true;

        const normalizedValue = {
            translationName,
            translationNamePlaceholder: value.translationNamePlaceholder,
            language: normalizeLanguageInput(value.language) || "und",
            translationId: value.translationId,
        };

        this.resolve(normalizedValue);
        this.close();
    }
}

class BiblePluginSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: BiblePlugin) { super(app, plugin); }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: this.plugin.t("settings.title") });

        new Setting(containerEl)
            .setName(this.plugin.t("settings.pluginActive.name"))
            .setDesc(this.plugin.t("settings.pluginActive.desc"))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.isPluginActive())
                .onChange(async (value) => {
                    await this.plugin.setPluginActive(value);
                }));

        new Setting(containerEl)
            .setName(this.plugin.t("settings.interfaceLanguage.name"))
            .setDesc(this.plugin.t("settings.interfaceLanguage.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("ru", this.plugin.t("settings.interfaceLanguage.ru"))
                    .addOption("en", this.plugin.t("settings.interfaceLanguage.en"))
                    .setValue(this.plugin.getInterfaceLanguage())
                    .onChange((value) => void this.plugin.setInterfaceLanguage(value as BiblePluginLocale));
            });

        new Setting(containerEl)
            .setName(this.plugin.t("settings.import.name"))
            .setDesc(this.plugin.t("settings.import.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.import.button")).setCta().onClick(() => this.plugin.openEpubFilePicker()));

        this.renderTranslationsSection(containerEl);
        this.renderReferenceUsageIndexSection(containerEl);

        new Setting(containerEl)
            .setName(this.plugin.t("settings.previewMode.name"))
            .setDesc(this.plugin.t("settings.previewMode.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("current-paragraph", this.plugin.t("settings.previewMode.currentParagraph"))
                    .addOption("clicked-reference", this.plugin.t("settings.previewMode.clickedReference"))
                    .setValue(this.plugin.getBiblePreviewTriggerMode())
                    .onChange((value) => void this.plugin.setBiblePreviewTriggerMode(value as BiblePreviewTriggerMode));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.previewDisplayMode.name"))
            .setDesc(this.plugin.t("settings.previewDisplayMode.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("floating", this.plugin.t("settings.previewDisplayMode.floating"))
                    .addOption("side-panel", this.plugin.t("settings.previewDisplayMode.sidePanel"))
                    .setValue(this.plugin.getBiblePreviewDisplayMode())
                    .onChange((value) => void this.plugin.setBiblePreviewDisplayMode(value as BiblePreviewDisplayMode));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.previewPanelSide.name"))
            .setDesc(this.plugin.t("settings.previewPanelSide.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("right", this.plugin.t("settings.previewPanelSide.right"))
                    .addOption("left", this.plugin.t("settings.previewPanelSide.left"))
                    .setValue(this.plugin.getBiblePreviewPanelSide())
                    .onChange((value) => void this.plugin.setBiblePreviewPanelSide(value as BiblePreviewPanelSide));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.closePreviewOnTabChange.name"))
            .setDesc(this.plugin.t("settings.closePreviewOnTabChange.desc"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.shouldClosePreviewOnActiveLeafChange())
                    .onChange((value) => void this.plugin.setClosePreviewOnActiveLeafChange(value));
            });

        new Setting(containerEl)
            .setName(this.plugin.t("settings.hotkey.name"))
            .setDesc(this.plugin.t("settings.hotkey.desc"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.shouldInterceptLinkOpenShortcut())
                    .onChange((value) => void this.plugin.setInterceptLinkOpenShortcut(value));
            })
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("alt-enter", "Alt+Enter")
                    .addOption("ctrl-enter", "Ctrl+Enter")
                    .addOption("ctrl-alt-enter", "Ctrl+Alt+Enter")
                    .setValue(this.plugin.getBibleLinkOpenShortcut())
                    .onChange((value) => void this.plugin.setBibleLinkOpenShortcut(value as BibleLinkOpenShortcut));
            });

        const bibleReferenceLinkColorSetting = new Setting(containerEl)
            .setName(this.plugin.t("settings.linkColor.name"))
            .setDesc(this.plugin.t("settings.linkColor.desc"));
        const openBibleReferenceLinkColorDialog = () => this.plugin.openCssColorDialog({
            title: this.plugin.t("settings.linkColor.name"),
            description: this.plugin.t("settings.linkColor.desc"),
            value: this.plugin.getBibleReferenceLinkColor(),
            defaultValue: DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
            previewText: this.plugin.t("settings.linkColor.preview"),
            presets: createTextColorPresets(),
            normalize: normalizeBibleReferenceLinkColor,
            onApply: (color) => void this.plugin.setBibleReferenceLinkColor(color),
        });
        const previewEl = bibleReferenceLinkColorSetting.controlEl.createSpan({ text: this.plugin.t("settings.linkColor.preview") });
        previewEl.style.color = this.plugin.isBibleReferenceLinkColorDefault()
            ? "var(--link-color)"
            : this.plugin.getBibleReferenceLinkColorPickerValue();
        previewEl.style.textDecoration = "underline";
        previewEl.style.textDecorationStyle = "dotted";
        previewEl.style.border = "1px solid var(--background-modifier-border)";
        previewEl.style.borderRadius = "6px";
        previewEl.style.boxShadow = "var(--input-shadow)";
        previewEl.style.background = "var(--interactive-normal)";
        previewEl.style.padding = "4px 10px";
        previewEl.style.marginLeft = "8px";
        previewEl.style.whiteSpace = "nowrap";
        previewEl.style.cursor = "pointer";
        previewEl.tabIndex = 0;
        previewEl.setAttribute("role", "button");
        previewEl.setAttribute("aria-label", this.plugin.t("settings.linkColor.name"));
        previewEl.addEventListener("click", openBibleReferenceLinkColorDialog);
        previewEl.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            event.preventDefault();
            openBibleReferenceLinkColorDialog();
        });
        const resetButton = bibleReferenceLinkColorSetting.controlEl.createEl("button", { text: this.plugin.t("settings.reset") });
        resetButton.disabled = this.plugin.isBibleReferenceLinkColorDefault();
        resetButton.style.marginLeft = "8px";
        resetButton.addEventListener("click", async (event) => {
            event.preventDefault();
            await this.plugin.resetBibleReferenceLinkColor();
            this.display();
        });

        const floatingPreviewBackgroundColorSetting = new Setting(containerEl)
            .setName(this.plugin.t("settings.previewBackgroundColor.name"))
            .setDesc(this.plugin.t("settings.previewBackgroundColor.desc"));
        const openFloatingPreviewBackgroundColorDialog = () => this.plugin.openFloatingPreviewBackgroundColorDialog();
        const previewBackgroundSampleEl = floatingPreviewBackgroundColorSetting.controlEl.createSpan({
            // text: this.plugin.t("settings.previewBackgroundColor.preview")
            text: "..."
        });
        previewBackgroundSampleEl.style.background = this.plugin.getFloatingPreviewBackgroundColor();
        previewBackgroundSampleEl.style.color = "var(--text-normal)";
        previewBackgroundSampleEl.style.border = "1px solid var(--background-modifier-border)";
        previewBackgroundSampleEl.style.borderRadius = "6px";
        previewBackgroundSampleEl.style.boxShadow = "var(--input-shadow)";
        previewBackgroundSampleEl.style.marginLeft = "8px";
        previewBackgroundSampleEl.style.padding = "4px 10px";
        previewBackgroundSampleEl.style.whiteSpace = "nowrap";
        previewBackgroundSampleEl.style.cursor = "pointer";
        previewBackgroundSampleEl.tabIndex = 0;
        previewBackgroundSampleEl.setAttribute("role", "button");
        previewBackgroundSampleEl.setAttribute("aria-label", this.plugin.t("settings.previewBackgroundColor.name"));
        previewBackgroundSampleEl.addEventListener("click", openFloatingPreviewBackgroundColorDialog);
        previewBackgroundSampleEl.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            event.preventDefault();
            openFloatingPreviewBackgroundColorDialog();
        });
        const resetPreviewBackgroundButton = floatingPreviewBackgroundColorSetting.controlEl.createEl("button", { text: this.plugin.t("settings.reset") });
        resetPreviewBackgroundButton.disabled = this.plugin.isFloatingPreviewBackgroundColorDefault();
        resetPreviewBackgroundButton.style.marginLeft = "8px";
        resetPreviewBackgroundButton.addEventListener("click", async (event) => {
            event.preventDefault();
            await this.plugin.resetFloatingPreviewBackgroundColor();
            this.display();
        });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.openIndexFolder.name"))
            .setDesc(this.plugin.t("settings.openIndexFolder.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.openIndexFolder.button")).onClick(() => void this.plugin.openBibleIndexFolder()));

        new Setting(containerEl)
            .setName(this.plugin.t("settings.showStats.name"))
            .setDesc(this.plugin.t("settings.showStats.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.showStats.button")).onClick(() => void this.plugin.showBibleIndexStats()));
    }


    private renderReferenceUsageIndexSection(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: this.plugin.t("settings.referenceUsageIndex.title") });
        containerEl.createEl("p", { text: this.plugin.t("settings.referenceUsageIndex.desc") });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.referenceUsageIndex.enabled.name"))
            .setDesc(this.plugin.t("settings.referenceUsageIndex.enabled.desc"))
            .addToggle((toggle) => toggle.setValue(this.plugin.isReferenceUsageIndexingEnabled()).onChange((value) => void this.plugin.setReferenceUsageIndexingEnabled(value)));
        new Setting(containerEl)
            .setName(this.plugin.t("settings.referenceUsageIndex.autoUpdate.name"))
            .setDesc(this.plugin.t("settings.referenceUsageIndex.autoUpdate.desc"))
            .addToggle((toggle) => toggle.setValue(this.plugin.shouldAutoUpdateReferenceUsageIndex()).onChange((value) => void this.plugin.setReferenceUsageAutoUpdate(value)));
        new Setting(containerEl)
            .setName(this.plugin.t("settings.referenceUsageIndex.excludedFolders.name"))
            .setDesc(this.plugin.t("settings.referenceUsageIndex.excludedFolders.desc"))
            .addTextArea((textArea) => {
                textArea.setPlaceholder("Attachments/\nTemplates/\nArchive/\nBible/")
                    .setValue(this.plugin.getReferenceUsageExcludedFoldersText())
                    .onChange((value) => void this.plugin.setReferenceUsageExcludedFoldersText(value));
                textArea.inputEl.rows = 4;
                textArea.inputEl.style.width = "100%";
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.referenceUsageIndex.actions.name"))
            .setDesc(this.plugin.t("settings.referenceUsageIndex.actions.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.referenceUsageIndex.build.button")).onClick(() => void this.plugin.buildReferenceUsageIndex()))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.referenceUsageIndex.rebuild.button")).onClick(() => void this.plugin.rebuildReferenceUsageIndex()))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.referenceUsageIndex.stats.button")).onClick(() => void this.plugin.showReferenceUsageIndexStats()))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.referenceUsageIndex.clear.button")).onClick(() => void this.plugin.clearReferenceUsageIndex()));
    }

    private renderTranslationsSection(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: this.plugin.t("settings.translations.title") });
        containerEl.createEl("p", {
            text: this.plugin.t("settings.translations.desc"),
        });

        const translations = this.plugin.getTranslationSettingsItems();

        if (translations.length === 0) {
            containerEl.createEl("p", { text: this.plugin.t("settings.translations.empty") });
            return;
        }

        const listEl = containerEl.createDiv();
        listEl.style.display = "flex";
        listEl.style.flexDirection = "column";
        listEl.style.gap = "6px";
        listEl.style.marginBottom = "12px";

        let draggedTranslationId: string | null = null;
        const rows: HTMLElement[] = [];

        const clearDropStyles = (): void => {
            for (const row of rows) {
                row.style.borderTop = "1px solid var(--background-modifier-border)";
                row.style.borderBottom = "1px solid var(--background-modifier-border)";
            }
        };

        for (const translation of translations) {
            const row = listEl.createDiv();
            rows.push(row);
            row.draggable = true;
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "8px";
            row.style.padding = "8px";
            row.style.border = "1px solid var(--background-modifier-border)";
            row.style.borderRadius = "6px";
            row.style.background = translation.isActive ? "var(--background-secondary)" : "var(--background-primary)";
            row.style.cursor = "grab";

            const dragHandle = row.createSpan({ text: "☰" });
            dragHandle.style.opacity = "0.7";
            dragHandle.style.fontSize = "18px";
            dragHandle.style.lineHeight = "1";

            const textEl = row.createDiv();
            textEl.style.flex = "1";
            textEl.style.minWidth = "0";

            const titleEl = textEl.createDiv({ text: `${translation.isActive ? "✓ " : ""}${translation.name || translation.id}` });
            titleEl.style.fontWeight = translation.isActive ? "600" : "500";

            const description = [
                `ID: ${translation.id}`,
                this.plugin.t("settings.translations.language", { language: translation.language || "und" }),
                this.plugin.t("settings.translations.books", { count: translation.bookCount }),
                translation.sourceFileName.length === 0 ? "" : this.plugin.t("settings.translations.file", { fileName: translation.sourceFileName }),
            ].filter((part) => part.length > 0).join(" · ");

            const descriptionEl = textEl.createDiv({ text: description });
            descriptionEl.style.fontSize = "12px";
            descriptionEl.style.color = "var(--text-muted)";
            descriptionEl.style.overflow = "hidden";
            descriptionEl.style.textOverflow = "ellipsis";
            descriptionEl.style.whiteSpace = "nowrap";

            const deleteButton = row.createEl("button", { text: "🗑" });
            deleteButton.setAttribute("aria-label", this.plugin.t("settings.translations.deleteAria", { translationName: translation.name || translation.id }));
            deleteButton.style.cursor = "pointer";
            deleteButton.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await this.plugin.deleteImportedTranslation(translation.id);
                this.display();
            });

            row.addEventListener("dragstart", (event) => {
                draggedTranslationId = translation.id;
                row.style.opacity = "0.5";

                if (event.dataTransfer !== null) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", translation.id);
                }
            });

            row.addEventListener("dragend", () => {
                draggedTranslationId = null;
                row.style.opacity = "1";
                clearDropStyles();
            });

            row.addEventListener("dragover", (event) => {
                const sourceTranslationId = event.dataTransfer?.getData("text/plain") || draggedTranslationId;
                if (sourceTranslationId === null || sourceTranslationId === translation.id) {
                    return;
                }

                event.preventDefault();
                clearDropStyles();

                const rect = row.getBoundingClientRect();
                const insertAfter = event.clientY > rect.top + rect.height / 2;
                if (insertAfter) {
                    row.style.borderBottom = "2px solid var(--color-accent)";
                } else {
                    row.style.borderTop = "2px solid var(--color-accent)";
                }
            });

            row.addEventListener("dragleave", () => {
                row.style.borderTop = "1px solid var(--background-modifier-border)";
                row.style.borderBottom = "1px solid var(--background-modifier-border)";
            });

            row.addEventListener("drop", async (event) => {
                event.preventDefault();
                const sourceTranslationId = event.dataTransfer?.getData("text/plain") || draggedTranslationId;
                clearDropStyles();

                if (sourceTranslationId === null || sourceTranslationId === translation.id) {
                    return;
                }

                const nextOrder = this.plugin.getTranslationSettingsItems().map((item) => item.id);
                const sourceIndex = nextOrder.indexOf(sourceTranslationId);
                let targetIndex = nextOrder.indexOf(translation.id);

                if (sourceIndex < 0 || targetIndex < 0) {
                    return;
                }

                const rect = row.getBoundingClientRect();
                const insertAfter = event.clientY > rect.top + rect.height / 2;
                nextOrder.splice(sourceIndex, 1);

                if (sourceIndex < targetIndex) {
                    targetIndex -= 1;
                }

                if (insertAfter) {
                    targetIndex += 1;
                }

                nextOrder.splice(targetIndex, 0, sourceTranslationId);
                await this.plugin.setTranslationOrder(nextOrder);
                this.display();
            });
        }
    }
}

function createImportSettingsDefaults(fileName: string, sourceMetadata: EpubBibleSourceMetadata): BibleTranslationImportSettings {
    const fileNameWithoutExtension = fileName.replace(/\.(epub|tsv)$/i, "").trim();
    const detectedTranslationName = sourceMetadata.title?.trim() ?? "";
    const translationNameForId = detectedTranslationName || fileNameWithoutExtension || "Imported EPUB Bible";
    const language = normalizeLanguageInput(sourceMetadata.language ?? "") || "und";

    return {
        translationName: detectedTranslationName,
        translationNamePlaceholder: fileNameWithoutExtension || "",
        language,
        translationId: createTranslationId(language, translationNameForId),
    };
}

function createTranslationId(language: string, translationName: string): string {
    const normalizedLanguage = normalizeLanguageInput(language) || "und";
    const namePart = sanitizeTranslationId(transliterateToAscii(translationName)) || "translation";
    return sanitizeTranslationId(`${normalizedLanguage}-${namePart}`);
}

function sanitizeTranslationId(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/_/g, "-")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function normalizeLanguageInput(value: string): string {
    return value.trim().toLowerCase().replace(/_/g, "-");
}

function transliterateToAscii(value: string): string {
    const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
        к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
        х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
        ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    };

    return value.toLowerCase().replace(/[а-яёçğıöşü]/g, (char) => map[char] ?? char);
}

function normalizePluginSettings(value: unknown): BiblePluginSettings {
    if (!isRecord(value)) {
        return { ...DEFAULT_SETTINGS };
    }

    const translationOrder = Array.isArray(value.translationOrder)
        ? value.translationOrder.filter((translationId): translationId is string => typeof translationId === "string")
        : [];

    return {
        isPluginActive: typeof value.isPluginActive === "boolean" ? value.isPluginActive : DEFAULT_SETTINGS.isPluginActive,
        interfaceLanguage: normalizeBiblePluginLocale(value.interfaceLanguage),
        translationOrder: [...new Set(translationOrder)],
        bibleReferenceLinkColor: typeof value.bibleReferenceLinkColor === "string"
            ? normalizeBibleReferenceLinkColor(value.bibleReferenceLinkColor)
            : DEFAULT_SETTINGS.bibleReferenceLinkColor,
        floatingPreviewBackgroundColor: typeof value.floatingPreviewBackgroundColor === "string"
            ? normalizeFloatingPreviewBackgroundColor(value.floatingPreviewBackgroundColor)
            : DEFAULT_SETTINGS.floatingPreviewBackgroundColor,
        previewTriggerMode: typeof value.previewTriggerMode === "string" && isBiblePreviewTriggerMode(value.previewTriggerMode)
            ? value.previewTriggerMode
            : DEFAULT_SETTINGS.previewTriggerMode,
        previewDisplayMode: typeof value.previewDisplayMode === "string" && isBiblePreviewDisplayMode(value.previewDisplayMode)
            ? value.previewDisplayMode
            : DEFAULT_SETTINGS.previewDisplayMode,
        previewPanelSide: typeof value.previewPanelSide === "string" && isBiblePreviewPanelSide(value.previewPanelSide)
            ? value.previewPanelSide
            : DEFAULT_SETTINGS.previewPanelSide,
        closePreviewOnActiveLeafChange: typeof value.closePreviewOnActiveLeafChange === "boolean"
            ? value.closePreviewOnActiveLeafChange
            : DEFAULT_SETTINGS.closePreviewOnActiveLeafChange,
        interceptLinkOpenShortcut: typeof value.interceptLinkOpenShortcut === "boolean"
            ? value.interceptLinkOpenShortcut
            : DEFAULT_SETTINGS.interceptLinkOpenShortcut,
        linkOpenShortcut: typeof value.linkOpenShortcut === "string" && isBibleLinkOpenShortcut(value.linkOpenShortcut)
            ? value.linkOpenShortcut
            : DEFAULT_SETTINGS.linkOpenShortcut,
        referenceUsageIndexingEnabled: typeof value.referenceUsageIndexingEnabled === "boolean"
            ? value.referenceUsageIndexingEnabled
            : DEFAULT_SETTINGS.referenceUsageIndexingEnabled,
        referenceUsageAutoUpdate: typeof value.referenceUsageAutoUpdate === "boolean"
            ? value.referenceUsageAutoUpdate
            : DEFAULT_SETTINGS.referenceUsageAutoUpdate,
        referenceUsageExcludedFolders: Array.isArray(value.referenceUsageExcludedFolders)
            ? normalizeReferenceUsageExcludedFolders(
                value.referenceUsageExcludedFolders
                    .filter((folder): folder is string => typeof folder === "string")
                    .join("\n"),
            )
            : DEFAULT_SETTINGS.referenceUsageExcludedFolders,

    };
}

function normalizeBibleReferenceLinkColor(value: string): string {
    const color = value.trim();

    if (color.length === 0) {
        return DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
    }

    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("color", color)) {
        return DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
    }

    return color;
}

function normalizeFloatingPreviewBackgroundColor(value: string): string {
    const color = value.trim();
    if (color.length === 0) {
        return DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
    }
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("background", color) && !CSS.supports("color", color)) {
        return DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
    }
    return color;
}

function isBiblePreviewTriggerMode(value: string): value is BiblePreviewTriggerMode {
    return value === "current-paragraph" || value === "clicked-reference";
}

function isBiblePreviewDisplayMode(value: string): value is BiblePreviewDisplayMode {
    return value === "floating" || value === "side-panel";
}

function isBiblePreviewPanelSide(value: string): value is BiblePreviewPanelSide {
    return value === "right" || value === "left";
}

function isBibleLinkOpenShortcut(value: string): value is BibleLinkOpenShortcut {
    return value === "alt-enter" || value === "ctrl-enter" || value === "ctrl-alt-enter";
}

function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function formatKilobytes(bytes: number): string { return `${(bytes / 1024).toFixed(1)} KB`; }
function formatMegabytes(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
function normalizePath(path: string): string { return path.split("\\").join("/").replace(/\/+/g, "/"); }
function getDirectoryPath(path: string): string { const normalizedPath = normalizePath(path); const slashIndex = normalizedPath.lastIndexOf("/"); return slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex); }
