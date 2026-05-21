
import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, type MarkdownPostProcessorContext } from "obsidian";
import type { BibleIndex } from "./src/infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, type DecorationSet } from "@codemirror/view";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createBookMapping } from "./src/parsing/BookMapping";
import { getBibleTextBlocks } from "./src/application/getBibleTexts";
import { BiblePreviewContent, formatBibleTextBlocks, renderBiblePreviewContent } from "./src/application/formatBibleTexts";
import { importBibleFromEpub } from "./src/application/importBibleFromEpub";
import { EpubBibleSourceMetadata } from "./src/infrastructure/EpubBibleImporter";
import { JsZipEpubBibleImporter } from "./src/infrastructure/epub/JsZipEpubBibleImporter";
import { ObsidianBibleIndexV2Repository } from "./src/infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "./src/infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { BiblePluginLocale, I18nKey, normalizeBiblePluginLocale, t } from "./src/i18n/I18n";


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
type BibleLinkOpenShortcut = "alt-enter" | "ctrl-enter" | "ctrl-alt-enter";

type BiblePreviewController = {
    openBibleReferenceUnderCursor(showNotice?: boolean): boolean;
    refreshLocalizedLabels(): void;
};

type BiblePluginSettings = {
    interfaceLanguage: BiblePluginLocale;
    translationOrder: string[];
    bibleReferenceLinkColor: string;
    previewTriggerMode: BiblePreviewTriggerMode;
    interceptLinkOpenShortcut: boolean;
    linkOpenShortcut: BibleLinkOpenShortcut;
};

const DEFAULT_BIBLE_REFERENCE_LINK_COLOR = "var(--link-color)";
const DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR = "#7c3aed";

const MAX_ANALYZED_PARAGRAPH_LINES = 40;
const MAX_ANALYZED_PARAGRAPH_CHARACTERS = 2000;


const DEFAULT_SETTINGS: BiblePluginSettings = {
    interfaceLanguage: "ru",
    translationOrder: [],
    bibleReferenceLinkColor: DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
    previewTriggerMode: "current-paragraph",
    interceptLinkOpenShortcut: true,
    linkOpenShortcut: "alt-enter",
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
    private readonly editorViews = new Set<EditorView>();
    private readonly previewControllers = new Map<EditorView, BiblePreviewController>();
    private readonly linkOpenShortcutKeydownHandler = (event: KeyboardEvent) => this.handleLinkOpenShortcutKeydown(event);

    async onload() {
        await this.loadPluginSettings();
        await this.loadBibleIndex();
        this.addCommand({ id: "import-epub-bible", name: this.t("command.importEpubBible"), callback: () => this.openEpubFilePicker() });
        this.addCommand({ id: "reload-bible-index", name: this.t("command.reloadBibleIndex"), callback: () => void this.reloadBibleIndex() });
        this.addCommand({ id: "open-bible-index-folder", name: this.t("command.openBibleIndexFolder"), callback: () => void this.openBibleIndexFolder() });
        this.addCommand({ id: "show-bible-index-stats", name: this.t("command.showBibleIndexStats"), callback: () => void this.showBibleIndexStats() });
        this.addCommand({
            id: "open-bible-reference-under-cursor",
            name: this.t("command.openBibleReferenceUnderCursor"),
            callback: () => this.openBibleReferenceUnderCursorFromActiveEditor(true),
        });
        this.readingModePreviewController = new BibleReadingModePreviewController(this);
        this.register(() => this.readingModePreviewController?.destroy());
        this.settingsTab = new BiblePluginSettingTab(this.app, this);
        this.addSettingTab(this.settingsTab);
        this.registerGlobalLinkOpenShortcutHandler();
        this.registerReadingModeBibleReferenceLinks();
        this.registerEditorExtension(this.createCursorExtension());
    }

    onunload() {}

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

    public getBibleReferenceLinkColorPickerValue(): string {
        return isHexColor(this.settings.bibleReferenceLinkColor)
            ? this.settings.bibleReferenceLinkColor
            : DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR;
    }

    public isBibleReferenceLinkColorDefault(): boolean {
        return this.settings.bibleReferenceLinkColor === DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
    }

    public getBiblePreviewTriggerMode(): BiblePreviewTriggerMode {
        return this.settings.previewTriggerMode;
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

    createCursorExtension() {
        const plugin = this;
        const cursorPlugin = ViewPlugin.fromClass(class {
            lastParagraph = "";
            requestId = 0;
            referenceLinkUpdateTimeout: number | null = null;
            lastActiveTranslationId = plugin.activeTranslationId;
            private readonly previewPanelEl: HTMLDivElement;
            private readonly previewContentEl: HTMLDivElement;
            private readonly collapsedButtonEl: HTMLButtonElement;
            private previewTitleEl: HTMLDivElement | null = null;
            private copyPreviewButtonEl: HTMLButtonElement | null = null;
            private collapsePreviewButtonEl: HTMLButtonElement | null = null;
            private readonly viewportChangeHandler = () => this.updateBiblePreviewPosition();
            private readonly previewPointerMoveHandler = (event: PointerEvent) => this.dragBiblePreview(event);
            private readonly previewPointerUpHandler = (event: PointerEvent) => this.finishBiblePreviewDrag(event);
            private readonly outsideInteractionHandler = (event: Event) => this.hideBiblePreviewIfEventIsOutsideEditor(event);
            private readonly editorClickHandler = (event: MouseEvent) => this.handleEditorClick(event);
            private previewText = "";
            private previewContent: BiblePreviewContent | null = null;
            private isPreviewCollapsed = false;
            private customPreviewPosition: { left: number; top: number } | null = null;
            private clickedReference: { from: number; to: number; text: string } | null = null;
            private lastPreviewTriggerMode = plugin.getBiblePreviewTriggerMode();
            private collapsedButtonPosition: { left: number; top: number } | null = null;
            private collapsedButtonDragState: {
                pointerId: number;
                startClientX: number;
                startClientY: number;
                startLeft: number;
                startTop: number;
                moved: boolean;
            } | null = null;
            private suppressCollapsedButtonClick = false;
            private previewDragState: {
                pointerId: number;
                startClientX: number;
                startClientY: number;
                startLeft: number;
                startTop: number;
            } | null = null;

            constructor(private readonly view: EditorView) {
                plugin.editorViews.add(view);
                plugin.previewControllers.set(view, this);
                this.previewPanelEl = this.createPreviewPanelElement();
                this.previewContentEl = this.previewPanelEl.createDiv();
                this.collapsedButtonEl = this.createCollapsedButtonElement();
                document.body.appendChild(this.previewPanelEl);
                document.body.appendChild(this.collapsedButtonEl);
                this.configurePreviewContentElement();
                this.registerViewportListeners();
                this.registerPreviewDragListeners();
                this.registerOutsideInteractionListeners();
                this.view.dom.addEventListener("click", this.editorClickHandler);
                this.scheduleReferenceLinkUpdate();
            }

            update(update: ViewUpdate) {
                if (this.lastActiveTranslationId !== plugin.activeTranslationId) {
                    this.lastActiveTranslationId = plugin.activeTranslationId;
                    this.lastParagraph = "";
                    this.clickedReference = null;
                    this.requestId += 1;
                    this.updateBiblePreviewTitle();
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
                    this.updateBiblePreviewPosition();
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

                    this.showBiblePreview(content);
                });
            }

            destroy() {
                if (this.referenceLinkUpdateTimeout !== null) {
                    window.clearTimeout(this.referenceLinkUpdateTimeout);
                    this.referenceLinkUpdateTimeout = null;
                }

                this.unregisterViewportListeners();
                this.unregisterPreviewDragListeners();
                this.unregisterOutsideInteractionListeners();
                this.view.dom.removeEventListener("click", this.editorClickHandler);
                this.previewPanelEl.remove();
                this.collapsedButtonEl.remove();
                plugin.previewControllers.delete(this.view);
                plugin.editorViews.delete(this.view);
            }

            private createPreviewPanelElement(): HTMLDivElement {
                const panelEl = document.createElement("div");
                panelEl.style.position = "fixed";
                panelEl.style.display = "none";
                panelEl.style.flexDirection = "column";
                panelEl.style.boxSizing = "border-box";
                panelEl.style.zIndex = "1000";
                panelEl.style.border = "1px solid var(--color-accent)";
                panelEl.style.borderRadius = "10px";
                panelEl.style.background = "var(--background-secondary)";
                panelEl.style.color = "var(--text-normal)";
                panelEl.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.28)";
                panelEl.style.overflow = "hidden";
                panelEl.style.maxWidth = "720px";
                panelEl.style.minWidth = "240px";
                panelEl.style.pointerEvents = "auto";

                const headerEl = panelEl.createDiv();
                headerEl.style.display = "flex";
                headerEl.style.alignItems = "center";
                headerEl.style.gap = "6px";
                headerEl.style.padding = "6px 8px";
                headerEl.style.borderBottom = "1px solid var(--background-modifier-border)";
                headerEl.style.background = "var(--background-secondary-alt)";
                headerEl.style.cursor = "move";
                headerEl.style.touchAction = "none";
                headerEl.addEventListener("pointerdown", (event) => this.startBiblePreviewDrag(event));

                const titleEl = headerEl.createDiv({ text: `📖 ${plugin.getActiveTranslationPreviewTitle()}` });
                this.previewTitleEl = titleEl;
                titleEl.style.flex = "1";
                titleEl.style.minWidth = "0";
                titleEl.style.fontWeight = "600";
                titleEl.style.whiteSpace = "nowrap";
                titleEl.style.overflow = "hidden";
                titleEl.style.textOverflow = "ellipsis";

                const copyButton = this.createPreviewIconButton("📋", plugin.t("preview.copyAria"));
                this.copyPreviewButtonEl = copyButton;
                copyButton.addEventListener("pointerdown", (event) => event.stopPropagation());
                copyButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void this.copyBiblePreviewText();
                });
                headerEl.appendChild(copyButton);

                const collapseButton = this.createPreviewIconButton("🔽", plugin.t("preview.collapseAria"));
                this.collapsePreviewButtonEl = collapseButton;
                collapseButton.addEventListener("pointerdown", (event) => event.stopPropagation());
                collapseButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.rememberCollapsedButtonPosition(collapseButton);
                    this.isPreviewCollapsed = true;
                    this.renderBiblePreview();
                });
                headerEl.appendChild(collapseButton);

                return panelEl;
            }

            private configurePreviewContentElement(): void {
                this.previewContentEl.style.padding = "8px";
                this.previewContentEl.style.whiteSpace = "pre-wrap";
                this.previewContentEl.style.overflow = "auto";
                this.previewContentEl.style.userSelect = "text";
                this.previewContentEl.style.lineHeight = "1.45";
                this.previewContentEl.style.fontSize = "var(--font-text-size)";
                this.previewContentEl.style.maxHeight = "calc(40vh - 42px)";
            }

            private createCollapsedButtonElement(): HTMLButtonElement {
                const buttonEl = document.createElement("button");
                buttonEl.type = "button";
                buttonEl.textContent = "📖";
                buttonEl.setAttribute("aria-label", plugin.t("preview.expandAria"));
                buttonEl.title = plugin.t("preview.expandAria");
                buttonEl.style.position = "fixed";
                buttonEl.style.display = "none";
                buttonEl.style.zIndex = "1000";
                buttonEl.style.width = "42px";
                buttonEl.style.height = "42px";
                buttonEl.style.borderRadius = "999px";
                buttonEl.style.border = "1px solid var(--color-accent)";
                buttonEl.style.background = "var(--background-secondary)";
                buttonEl.style.color = "var(--text-normal)";
                buttonEl.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.28)";
                buttonEl.style.cursor = "grab";
                buttonEl.style.touchAction = "none";
                buttonEl.style.userSelect = "none";
                buttonEl.style.fontSize = "20px";
                buttonEl.style.lineHeight = "1";
                buttonEl.style.padding = "0";
                buttonEl.addEventListener("pointerdown", (event) => this.startCollapsedButtonDrag(event));
                buttonEl.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (this.suppressCollapsedButtonClick) {
                        this.suppressCollapsedButtonClick = false;
                        return;
                    }

                    this.expandBiblePreviewFromCollapsedButton();
                });
                return buttonEl;
            }

            private createPreviewIconButton(text: string, label: string): HTMLButtonElement {
                const buttonEl = document.createElement("button");
                buttonEl.type = "button";
                buttonEl.textContent = text;
                buttonEl.setAttribute("aria-label", label);
                buttonEl.title = label;
                buttonEl.style.width = "30px";
                buttonEl.style.height = "30px";
                buttonEl.style.display = "inline-flex";
                buttonEl.style.alignItems = "center";
                buttonEl.style.justifyContent = "center";
                buttonEl.style.borderRadius = "6px";
                buttonEl.style.border = "1px solid var(--background-modifier-border)";
                buttonEl.style.background = "var(--background-primary)";
                buttonEl.style.color = "var(--text-normal)";
                buttonEl.style.cursor = "pointer";
                buttonEl.style.fontSize = "16px";
                buttonEl.style.padding = "0";
                return buttonEl;
            }

            private updateBiblePreviewTitle(): void {
                if (this.previewTitleEl === null) {
                    return;
                }

                this.previewTitleEl.textContent = `📖 ${plugin.getActiveTranslationPreviewTitle()}`;
            }

            private showBiblePreview(content: BiblePreviewContent): void {
                this.previewContent = content;
                this.previewText = content.plainText;
                renderBiblePreviewContent(this.previewContentEl, content);
                this.updateBiblePreviewTitle();
                this.renderBiblePreview();
            }

            private hideBiblePreview(resetParagraphCache = false): void {
                this.previewContent = null;
                this.previewText = "";
                this.previewPanelEl.style.display = "none";
                this.collapsedButtonEl.style.display = "none";

                if (this.customPreviewPosition === null) {
                    this.collapsedButtonPosition = null;
                }

                if (resetParagraphCache) {
                    this.lastParagraph = "";
                    this.clickedReference = null;
                    this.requestId += 1;
                }
            }

            private renderBiblePreview(): void {
                if (this.previewText.length === 0) {
                    this.hideBiblePreview();
                    return;
                }

                if (this.isPreviewCollapsed) {
                    this.previewPanelEl.style.display = "none";
                    this.collapsedButtonEl.style.display = "block";
                } else {
                    this.collapsedButtonEl.style.display = "none";
                    this.previewPanelEl.style.display = "flex";
                }

                window.requestAnimationFrame(() => this.updateBiblePreviewPosition());
            }

            private async copyBiblePreviewText(): Promise<void> {
                if (this.previewText.length === 0) {
                    return;
                }

                try {
                    if (navigator.clipboard !== undefined) {
                        await navigator.clipboard.writeText(this.previewText);
                    } else {
                        this.copyBiblePreviewTextFallback();
                    }
                    new Notice(plugin.t("notice.bibleTextCopied"), 2500);
                } catch {
                    this.copyBiblePreviewTextFallback();
                    new Notice(plugin.t("notice.bibleTextCopied"), 2500);
                }
            }

            private copyBiblePreviewTextFallback(): void {
                const textareaEl = document.createElement("textarea");
                textareaEl.value = this.previewText;
                textareaEl.style.position = "fixed";
                textareaEl.style.left = "-9999px";
                textareaEl.style.top = "0";
                document.body.appendChild(textareaEl);
                textareaEl.focus();
                textareaEl.select();
                document.execCommand("copy");
                textareaEl.remove();
            }
            public refreshLocalizedLabels(): void {
                this.updateBiblePreviewTitle();
                this.setPreviewButtonLabel(this.copyPreviewButtonEl, plugin.t("preview.copyAria"));
                this.setPreviewButtonLabel(this.collapsePreviewButtonEl, plugin.t("preview.collapseAria"));
                this.collapsedButtonEl.setAttribute("aria-label", plugin.t("preview.expandAria"));
                this.collapsedButtonEl.title = plugin.t("preview.expandAria");
            }

            private setPreviewButtonLabel(buttonEl: HTMLButtonElement | null, label: string): void {
                if (buttonEl === null) {
                    return;
                }
                buttonEl.setAttribute("aria-label", label);
                buttonEl.title = label;
            }

            public openBibleReferenceUnderCursor(showNotice = false): boolean {
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

                event.preventDefault();
                this.openBibleReferenceMatch(match);
            }

            private openBibleReferenceMatch(match: { from: number; to: number; text: string }): void {
                this.clickedReference = match;
                this.lastParagraph = "";

                if (this.isPreviewCollapsed) {
                    this.isPreviewCollapsed = false;
                    this.setExpandedPreviewPositionFromCollapsedButton();
                } else {
                    this.collapsedButtonPosition = null;
                }

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

                    this.showBiblePreview(content);
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

                if (
                    this.view.dom.contains(target)
                    || this.previewPanelEl.contains(target)
                    || this.collapsedButtonEl.contains(target)
                ) {
                    return;
                }

                this.hideBiblePreview(true);
            }

            private registerViewportListeners(): void {
                window.addEventListener("resize", this.viewportChangeHandler);
                window.visualViewport?.addEventListener("resize", this.viewportChangeHandler);
                window.visualViewport?.addEventListener("scroll", this.viewportChangeHandler);
            }

            private unregisterViewportListeners(): void {
                window.removeEventListener("resize", this.viewportChangeHandler);
                window.visualViewport?.removeEventListener("resize", this.viewportChangeHandler);
                window.visualViewport?.removeEventListener("scroll", this.viewportChangeHandler);
            }

            private registerPreviewDragListeners(): void {
                window.addEventListener("pointermove", this.previewPointerMoveHandler);
                window.addEventListener("pointerup", this.previewPointerUpHandler);
                window.addEventListener("pointercancel", this.previewPointerUpHandler);
            }

            private unregisterPreviewDragListeners(): void {
                window.removeEventListener("pointermove", this.previewPointerMoveHandler);
                window.removeEventListener("pointerup", this.previewPointerUpHandler);
                window.removeEventListener("pointercancel", this.previewPointerUpHandler);
                this.collapsedButtonDragState = null;
                this.previewDragState = null;
                this.collapsedButtonEl.style.cursor = "grab";
                document.body.style.userSelect = "";
            }

            private startBiblePreviewDrag(event: PointerEvent): void {
                if (event.button !== 0 || this.previewText.length === 0 || this.isPreviewCollapsed) {
                    return;
                }

                const rect = this.previewPanelEl.getBoundingClientRect();
                this.previewDragState = {
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startLeft: rect.left,
                    startTop: rect.top,
                };
                document.body.style.userSelect = "none";
                event.preventDefault();
            }

            private startCollapsedButtonDrag(event: PointerEvent): void {
                if (event.button !== 0 || this.previewText.length === 0 || !this.isPreviewCollapsed) {
                    return;
                }

                const rect = this.collapsedButtonEl.getBoundingClientRect();
                this.collapsedButtonDragState = {
                    pointerId: event.pointerId,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    startLeft: rect.left,
                    startTop: rect.top,
                    moved: false,
                };

                this.suppressCollapsedButtonClick = false;
                this.collapsedButtonEl.style.cursor = "grabbing";
                document.body.style.userSelect = "none";
                event.preventDefault();
                event.stopPropagation();
            }

            private dragCollapsedButton(event: PointerEvent): void {
                if (
                    this.collapsedButtonDragState === null
                    || event.pointerId !== this.collapsedButtonDragState.pointerId
                ) {
                    return;
                }

                const deltaX = event.clientX - this.collapsedButtonDragState.startClientX;
                const deltaY = event.clientY - this.collapsedButtonDragState.startClientY;

                if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                    this.collapsedButtonDragState.moved = true;
                }

                const buttonSize = 42;
                const clamped = this.clampBiblePreviewPosition(
                    this.collapsedButtonDragState.startLeft + deltaX,
                    this.collapsedButtonDragState.startTop + deltaY,
                    buttonSize,
                    buttonSize,
                );

                this.collapsedButtonPosition = clamped;
                this.collapsedButtonEl.style.left = `${clamped.left}px`;
                this.collapsedButtonEl.style.top = `${clamped.top}px`;
                event.preventDefault();
                event.stopPropagation();
            }

            private finishCollapsedButtonDrag(event: PointerEvent): boolean {
                if (
                    this.collapsedButtonDragState === null
                    || event.pointerId !== this.collapsedButtonDragState.pointerId
                ) {
                    return false;
                }

                this.suppressCollapsedButtonClick = this.collapsedButtonDragState.moved;
                this.collapsedButtonDragState = null;
                this.collapsedButtonEl.style.cursor = "grab";
                document.body.style.userSelect = "";
                event.preventDefault();
                event.stopPropagation();
                return true;
            }

            private expandBiblePreviewFromCollapsedButton(): void {
                this.isPreviewCollapsed = false;
                this.setExpandedPreviewPositionFromCollapsedButton();
                this.renderBiblePreview();
            }

            private setExpandedPreviewPositionFromCollapsedButton(): void {
                const buttonRect = this.collapsedButtonEl.getBoundingClientRect();
                const viewport = this.getBiblePreviewViewport();
                const panelWidth = this.isMobilePreviewLayout(viewport.width)
                    ? Math.max(240, viewport.width - 16)
                    : Math.min(720, Math.max(320, viewport.width * 0.42));
                const panelHeight = Math.max(120, this.previewPanelEl.offsetHeight || 220);

                const collapsedButtonCenterX = buttonRect.left + buttonRect.width / 2;
                const collapsedButtonCenterY = buttonRect.top + buttonRect.height / 2;
                const expandedCollapseButtonCenterX = panelWidth - 23;
                const expandedCollapseButtonCenterY = 21;
                const preferredLeft = collapsedButtonCenterX - expandedCollapseButtonCenterX;
                const preferredTop = collapsedButtonCenterY - expandedCollapseButtonCenterY;

                this.customPreviewPosition = this.clampBiblePreviewPosition(
                    preferredLeft,
                    preferredTop,
                    panelWidth,
                    panelHeight,
                );
                this.collapsedButtonPosition = null;
            }

            private dragBiblePreview(event: PointerEvent): void {
                if (this.collapsedButtonDragState !== null) {
                    this.dragCollapsedButton(event);
                    return;
                }

                if (this.previewDragState === null || event.pointerId !== this.previewDragState.pointerId) {
                    return;
                }

                const nextLeft = this.previewDragState.startLeft + event.clientX - this.previewDragState.startClientX;
                const nextTop = this.previewDragState.startTop + event.clientY - this.previewDragState.startClientY;
                const clamped = this.clampBiblePreviewPosition(
                    nextLeft,
                    nextTop,
                    this.previewPanelEl.offsetWidth,
                    this.previewPanelEl.offsetHeight,
                );
                this.customPreviewPosition = clamped;
                this.previewPanelEl.style.left = `${clamped.left}px`;
                this.previewPanelEl.style.top = `${clamped.top}px`;
                event.preventDefault();
            }

            private finishBiblePreviewDrag(event: PointerEvent): void {
                if (this.finishCollapsedButtonDrag(event)) {
                    return;
                }

                if (this.previewDragState === null || event.pointerId !== this.previewDragState.pointerId) {
                    return;
                }

                this.previewDragState = null;
                document.body.style.userSelect = "";
                event.preventDefault();
            }

            private updateBiblePreviewPosition(): void {
                const visibleEl = this.isPreviewCollapsed ? this.collapsedButtonEl : this.previewPanelEl;

                if (this.previewText.length === 0 || visibleEl.style.display === "none") {
                    return;
                }

                const viewport = this.getBiblePreviewViewport();
                const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);

                if (this.isPreviewCollapsed) {
                    this.updateCollapsedButtonPosition(viewport, safeMargins);
                    return;
                }

                this.updateExpandedPreviewSize(viewport.width, viewport.height);

                if (this.customPreviewPosition !== null) {
                    const clamped = this.clampBiblePreviewPosition(
                        this.customPreviewPosition.left,
                        this.customPreviewPosition.top,
                        this.previewPanelEl.offsetWidth,
                        this.previewPanelEl.offsetHeight,
                    );
                    this.customPreviewPosition = clamped;
                    this.previewPanelEl.style.left = `${clamped.left}px`;
                    this.previewPanelEl.style.top = `${clamped.top}px`;
                    return;
                }

                if (this.isMobilePreviewLayout(viewport.width)) {
                    const preferredLeft = viewport.left + safeMargins.left;
                    const preferredTop = viewport.top + safeMargins.top;
                    const clamped = this.clampBiblePreviewPosition(
                        preferredLeft,
                        preferredTop,
                        this.previewPanelEl.offsetWidth,
                        this.previewPanelEl.offsetHeight,
                    );

                    this.previewPanelEl.style.left = `${clamped.left}px`;
                    this.previewPanelEl.style.top = `${clamped.top}px`;
                    return;
                }

                const panelWidth = this.previewPanelEl.offsetWidth;
                const panelHeight = this.previewPanelEl.offsetHeight;
                const preferredLeft = viewport.left + viewport.width - panelWidth - safeMargins.right;
                const preferredTop = viewport.top + viewport.height - panelHeight - safeMargins.bottom;
                const clamped = this.clampBiblePreviewPosition(preferredLeft, preferredTop, panelWidth, panelHeight);

                this.previewPanelEl.style.left = `${clamped.left}px`;
                this.previewPanelEl.style.top = `${clamped.top}px`;
            }

            private rememberCollapsedButtonPosition(anchorEl: HTMLElement): void {
                const anchorRect = anchorEl.getBoundingClientRect();
                const buttonSize = 42;
                const preferredLeft = anchorRect.left + anchorRect.width / 2 - buttonSize / 2;
                const preferredTop = anchorRect.top + anchorRect.height / 2 - buttonSize / 2;

                this.collapsedButtonPosition = this.clampBiblePreviewPosition(
                    preferredLeft,
                    preferredTop,
                    buttonSize,
                    buttonSize,
                );
            }

            private updateCollapsedButtonPosition(
                viewport: { left: number; top: number; width: number; height: number },
                safeMargins: { top: number; right: number; bottom: number; left: number },
            ): void {
                const buttonSize = 42;

                if (this.collapsedButtonPosition !== null) {
                    const clamped = this.clampBiblePreviewPosition(
                        this.collapsedButtonPosition.left,
                        this.collapsedButtonPosition.top,
                        buttonSize,
                        buttonSize,
                    );
                    this.collapsedButtonPosition = clamped;
                    this.collapsedButtonEl.style.left = `${clamped.left}px`;
                    this.collapsedButtonEl.style.top = `${clamped.top}px`;
                    return;
                }

                if (this.customPreviewPosition !== null) {
                    const panelWidth = this.getCurrentPreviewPanelWidth();
                    const collapsedLeft = this.customPreviewPosition.left + Math.max(0, panelWidth - buttonSize);
                    const clamped = this.clampBiblePreviewPosition(
                        collapsedLeft,
                        this.customPreviewPosition.top,
                        buttonSize,
                        buttonSize,
                    );
                    this.collapsedButtonEl.style.left = `${clamped.left}px`;
                    this.collapsedButtonEl.style.top = `${clamped.top}px`;
                    return;
                }

                const preferredLeft = viewport.left + viewport.width - buttonSize - safeMargins.right;
                const preferredTop = this.isMobilePreviewLayout(viewport.width)
                    ? viewport.top + safeMargins.top
                    : viewport.top + viewport.height - buttonSize - safeMargins.bottom;
                const clamped = this.clampBiblePreviewPosition(preferredLeft, preferredTop, buttonSize, buttonSize);

                this.collapsedButtonEl.style.left = `${clamped.left}px`;
                this.collapsedButtonEl.style.top = `${clamped.top}px`;
            }

            private getCurrentPreviewPanelWidth(): number {
                const parsedWidth = Number.parseFloat(this.previewPanelEl.style.width);
                return Number.isFinite(parsedWidth) && parsedWidth > 0
                    ? parsedWidth
                    : Math.max(240, this.previewPanelEl.offsetWidth);
            }

            private updateExpandedPreviewSize(viewportWidth: number, viewportHeight: number): void {
                if (this.isMobilePreviewLayout(viewportWidth)) {
                    const width = Math.max(240, viewportWidth - 16);
                    const maxPanelHeight = Math.max(120, Math.floor(viewportHeight * 0.27));
                    this.previewPanelEl.style.width = `${width}px`;
                    this.previewPanelEl.style.maxHeight = `${maxPanelHeight}px`;
                    this.previewContentEl.style.maxHeight = `${Math.max(78, maxPanelHeight - 42)}px`;
                    return;
                }

                const width = Math.min(720, Math.max(320, viewportWidth * 0.42));
                const maxPanelHeight = Math.max(220, Math.floor(viewportHeight * 0.4));
                this.previewPanelEl.style.width = `${width}px`;
                this.previewPanelEl.style.maxHeight = `${maxPanelHeight}px`;
                this.previewContentEl.style.maxHeight = `${Math.max(160, maxPanelHeight - 42)}px`;
            }

            private clampBiblePreviewPosition(left: number, top: number, width: number, height: number): { left: number; top: number } {
                const viewport = this.getBiblePreviewViewport();
                const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);
                const minLeft = viewport.left + safeMargins.left;
                const maxLeft = Math.max(minLeft, viewport.left + viewport.width - width - safeMargins.right);
                const minTop = viewport.top + safeMargins.top;
                const maxTop = Math.max(minTop, viewport.top + viewport.height - height - safeMargins.bottom);

                return {
                    left: Math.min(Math.max(left, minLeft), maxLeft),
                    top: Math.min(Math.max(top, minTop), maxTop),
                };
            }

            private getBiblePreviewViewport(): { left: number; top: number; width: number; height: number } {
                const viewport = window.visualViewport;
                return {
                    left: viewport?.offsetLeft ?? 0,
                    top: viewport?.offsetTop ?? 0,
                    width: viewport?.width ?? window.innerWidth,
                    height: viewport?.height ?? window.innerHeight,
                };
            }

            private getBiblePreviewSafeMargins(viewportWidth: number): { top: number; right: number; bottom: number; left: number } {
                if (this.isMobilePreviewLayout(viewportWidth)) {
                    return {
                        top: Platform.isAndroidApp ? 72 : 56,
                        right: 8,
                        bottom: 12,
                        left: 8,
                    };
                }

                return {
                    top: 12,
                    right: 12,
                    bottom: 46,
                    left: 12,
                };
            }

            private isMobilePreviewLayout(viewportWidth: number): boolean {
                return viewportWidth < 700;
            }

            private scheduleReferenceLinkUpdate(): void {
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
        for (const controller of this.previewControllers.values()) {
            controller.refreshLocalizedLabels();
        }
        this.readingModePreviewController?.refreshLocalizedLabels();
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


class BibleReadingModePreviewController {
    private readonly previewPanelEl: HTMLDivElement;
    private readonly previewContentEl: HTMLDivElement;
    private readonly collapsedButtonEl: HTMLButtonElement;
    private previewTitleEl: HTMLDivElement | null = null;
    private previewText = "";
    private previewContent: BiblePreviewContent | null = null;
    private isPreviewCollapsed = false;
    private customPreviewPosition: { left: number; top: number } | null = null;
    private collapsedButtonPosition: { left: number; top: number } | null = null;
    private previewDragState: { pointerId: number; startClientX: number; startClientY: number; startLeft: number; startTop: number } | null = null;
    private collapsedButtonDragState: { pointerId: number; startClientX: number; startClientY: number; startLeft: number; startTop: number; moved: boolean } | null = null;
    private suppressCollapsedButtonClick = false;
    private readonly viewportChangeHandler = () => this.updateBiblePreviewPosition();
    private readonly pointerMoveHandler = (event: PointerEvent) => this.dragBiblePreview(event);
    private readonly pointerUpHandler = (event: PointerEvent) => this.finishBiblePreviewDrag(event);
    private readonly outsideInteractionHandler = (event: Event) => this.hideBiblePreviewIfEventIsOutside(event);

    constructor(private readonly plugin: BiblePlugin) {
        this.previewPanelEl = this.createPreviewPanelElement();
        this.previewContentEl = this.previewPanelEl.createDiv();
        this.collapsedButtonEl = this.createCollapsedButtonElement();
        document.body.appendChild(this.previewPanelEl);
        document.body.appendChild(this.collapsedButtonEl);
        this.configurePreviewContentElement();
        this.registerListeners();
    }

    public show(content: BiblePreviewContent, anchorEl: HTMLElement): void {
        this.previewContent = content;
        this.previewText = content.plainText;
        renderBiblePreviewContent(this.previewContentEl, content);
        this.updateBiblePreviewTitle();
        if (this.isPreviewCollapsed) {
            this.isPreviewCollapsed = false;
            this.setExpandedPreviewPositionFromCollapsedButton();
        } else if (this.customPreviewPosition === null) {
            this.customPreviewPosition = this.getExpandedPreviewPositionForAnchor(anchorEl);
        }
        this.renderBiblePreview();
    }

    public destroy(): void {
        this.unregisterListeners();
        this.previewPanelEl.remove();
        this.collapsedButtonEl.remove();
    }

    public refreshLocalizedLabels(): void {
        this.updateBiblePreviewTitle();
    }

    private createPreviewPanelElement(): HTMLDivElement {
        const panelEl = document.createElement("div");
        panelEl.style.position = "fixed";
        panelEl.style.display = "none";
        panelEl.style.flexDirection = "column";
        panelEl.style.boxSizing = "border-box";
        panelEl.style.zIndex = "1000";
        panelEl.style.border = "1px solid var(--color-accent)";
        panelEl.style.borderRadius = "10px";
        panelEl.style.background = "var(--background-secondary)";
        panelEl.style.color = "var(--text-normal)";
        panelEl.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.28)";
        panelEl.style.overflow = "hidden";
        panelEl.style.maxWidth = "720px";
        panelEl.style.minWidth = "240px";
        panelEl.style.pointerEvents = "auto";
        const headerEl = panelEl.createDiv();
        headerEl.style.display = "flex";
        headerEl.style.alignItems = "center";
        headerEl.style.gap = "6px";
        headerEl.style.padding = "6px 8px";
        headerEl.style.borderBottom = "1px solid var(--background-modifier-border)";
        headerEl.style.background = "var(--background-secondary-alt)";
        headerEl.style.cursor = "move";
        headerEl.style.touchAction = "none";
        headerEl.addEventListener("pointerdown", (event) => this.startBiblePreviewDrag(event));
        this.previewTitleEl = headerEl.createDiv({ text: `📖 ${this.plugin.getActiveTranslationPreviewTitle()}` });
        this.previewTitleEl.style.flex = "1";
        this.previewTitleEl.style.minWidth = "0";
        this.previewTitleEl.style.fontWeight = "600";
        this.previewTitleEl.style.whiteSpace = "nowrap";
        this.previewTitleEl.style.overflow = "hidden";
        this.previewTitleEl.style.textOverflow = "ellipsis";
        const copyButton = this.createPreviewIconButton("📋", this.plugin.t("preview.copyAria"));
        copyButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        copyButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void this.copyBiblePreviewText(); });
        headerEl.appendChild(copyButton);
        const collapseButton = this.createPreviewIconButton("🔽", this.plugin.t("preview.collapseAria"));
        collapseButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        collapseButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); this.rememberCollapsedButtonPosition(collapseButton); this.isPreviewCollapsed = true; this.renderBiblePreview(); });
        headerEl.appendChild(collapseButton);
        return panelEl;
    }

    private configurePreviewContentElement(): void {
        this.previewContentEl.style.padding = "8px";
        this.previewContentEl.style.whiteSpace = "pre-wrap";
        this.previewContentEl.style.overflow = "auto";
        this.previewContentEl.style.userSelect = "text";
        this.previewContentEl.style.lineHeight = "1.45";
        this.previewContentEl.style.fontSize = "var(--font-text-size)";
        this.previewContentEl.style.maxHeight = "calc(40vh - 42px)";
    }

    private createCollapsedButtonElement(): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.textContent = "📖";
        buttonEl.setAttribute("aria-label", this.plugin.t("preview.expandAria"));
        buttonEl.title = this.plugin.t("preview.expandAria");
        buttonEl.style.position = "fixed";
        buttonEl.style.display = "none";
        buttonEl.style.zIndex = "1000";
        buttonEl.style.width = "42px";
        buttonEl.style.height = "42px";
        buttonEl.style.borderRadius = "999px";
        buttonEl.style.border = "1px solid var(--color-accent)";
        buttonEl.style.background = "var(--background-secondary)";
        buttonEl.style.color = "var(--text-normal)";
        buttonEl.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.28)";
        buttonEl.style.cursor = "grab";
        buttonEl.style.touchAction = "none";
        buttonEl.style.userSelect = "none";
        buttonEl.style.fontSize = "20px";
        buttonEl.style.lineHeight = "1";
        buttonEl.style.padding = "0";
        buttonEl.addEventListener("pointerdown", (event) => this.startCollapsedButtonDrag(event));
        buttonEl.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); if (this.suppressCollapsedButtonClick) { this.suppressCollapsedButtonClick = false; return; } this.expandBiblePreviewFromCollapsedButton(); });
        return buttonEl;
    }

    private createPreviewIconButton(text: string, label: string): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.textContent = text;
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
        buttonEl.style.width = "30px";
        buttonEl.style.height = "30px";
        buttonEl.style.display = "inline-flex";
        buttonEl.style.alignItems = "center";
        buttonEl.style.justifyContent = "center";
        buttonEl.style.borderRadius = "6px";
        buttonEl.style.border = "1px solid var(--background-modifier-border)";
        buttonEl.style.background = "var(--background-primary)";
        buttonEl.style.color = "var(--text-normal)";
        buttonEl.style.cursor = "pointer";
        buttonEl.style.fontSize = "16px";
        buttonEl.style.padding = "0";
        return buttonEl;
    }

    private renderBiblePreview(): void {
        if (this.previewText.length === 0) { this.hideBiblePreview(); return; }
        this.previewPanelEl.style.display = this.isPreviewCollapsed ? "none" : "flex";
        this.collapsedButtonEl.style.display = this.isPreviewCollapsed ? "block" : "none";
        window.requestAnimationFrame(() => this.updateBiblePreviewPosition());
    }

    private hideBiblePreview(): void { this.previewContent = null; this.previewText = ""; this.previewPanelEl.style.display = "none"; this.collapsedButtonEl.style.display = "none"; }
    private hideBiblePreviewIfEventIsOutside(event: Event): void { const target = event.target; if (!(target instanceof Node)) return; if (this.previewPanelEl.contains(target) || this.collapsedButtonEl.contains(target) || (target instanceof HTMLElement && target.closest(".bible-reference-reading-link") !== null)) return; this.hideBiblePreview(); }
    private registerListeners(): void { window.addEventListener("resize", this.viewportChangeHandler); window.visualViewport?.addEventListener("resize", this.viewportChangeHandler); window.visualViewport?.addEventListener("scroll", this.viewportChangeHandler); window.addEventListener("pointermove", this.pointerMoveHandler); window.addEventListener("pointerup", this.pointerUpHandler); window.addEventListener("pointercancel", this.pointerUpHandler); document.addEventListener("pointerdown", this.outsideInteractionHandler, true); document.addEventListener("focusin", this.outsideInteractionHandler, true); }
    private unregisterListeners(): void { window.removeEventListener("resize", this.viewportChangeHandler); window.visualViewport?.removeEventListener("resize", this.viewportChangeHandler); window.visualViewport?.removeEventListener("scroll", this.viewportChangeHandler); window.removeEventListener("pointermove", this.pointerMoveHandler); window.removeEventListener("pointerup", this.pointerUpHandler); window.removeEventListener("pointercancel", this.pointerUpHandler); document.removeEventListener("pointerdown", this.outsideInteractionHandler, true); document.removeEventListener("focusin", this.outsideInteractionHandler, true); document.body.style.userSelect = ""; }
    private startBiblePreviewDrag(event: PointerEvent): void { if (event.button !== 0 || this.previewText.length === 0 || this.isPreviewCollapsed) return; const rect = this.previewPanelEl.getBoundingClientRect(); this.previewDragState = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startLeft: rect.left, startTop: rect.top }; document.body.style.userSelect = "none"; event.preventDefault(); }
    private startCollapsedButtonDrag(event: PointerEvent): void { if (event.button !== 0 || this.previewText.length === 0 || !this.isPreviewCollapsed) return; const rect = this.collapsedButtonEl.getBoundingClientRect(); this.collapsedButtonDragState = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startLeft: rect.left, startTop: rect.top, moved: false }; this.suppressCollapsedButtonClick = false; this.collapsedButtonEl.style.cursor = "grabbing"; document.body.style.userSelect = "none"; event.preventDefault(); event.stopPropagation(); }
    private dragBiblePreview(event: PointerEvent): void { if (this.collapsedButtonDragState !== null) { this.dragCollapsedButton(event); return; } if (this.previewDragState === null || event.pointerId !== this.previewDragState.pointerId) return; const clamped = this.clampBiblePreviewPosition(this.previewDragState.startLeft + event.clientX - this.previewDragState.startClientX, this.previewDragState.startTop + event.clientY - this.previewDragState.startClientY, this.previewPanelEl.offsetWidth, this.previewPanelEl.offsetHeight); this.customPreviewPosition = clamped; this.previewPanelEl.style.left = `${clamped.left}px`; this.previewPanelEl.style.top = `${clamped.top}px`; event.preventDefault(); }
    private dragCollapsedButton(event: PointerEvent): void { if (this.collapsedButtonDragState === null || event.pointerId !== this.collapsedButtonDragState.pointerId) return; const dx = event.clientX - this.collapsedButtonDragState.startClientX; const dy = event.clientY - this.collapsedButtonDragState.startClientY; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.collapsedButtonDragState.moved = true; const clamped = this.clampBiblePreviewPosition(this.collapsedButtonDragState.startLeft + dx, this.collapsedButtonDragState.startTop + dy, 42, 42); this.collapsedButtonPosition = clamped; this.collapsedButtonEl.style.left = `${clamped.left}px`; this.collapsedButtonEl.style.top = `${clamped.top}px`; event.preventDefault(); event.stopPropagation(); }
    private finishBiblePreviewDrag(event: PointerEvent): void { if (this.finishCollapsedButtonDrag(event)) return; if (this.previewDragState === null || event.pointerId !== this.previewDragState.pointerId) return; this.previewDragState = null; document.body.style.userSelect = ""; event.preventDefault(); }
    private finishCollapsedButtonDrag(event: PointerEvent): boolean { if (this.collapsedButtonDragState === null || event.pointerId !== this.collapsedButtonDragState.pointerId) return false; this.suppressCollapsedButtonClick = this.collapsedButtonDragState.moved; this.collapsedButtonDragState = null; this.collapsedButtonEl.style.cursor = "grab"; document.body.style.userSelect = ""; event.preventDefault(); event.stopPropagation(); return true; }
    private expandBiblePreviewFromCollapsedButton(): void { this.isPreviewCollapsed = false; this.setExpandedPreviewPositionFromCollapsedButton(); this.renderBiblePreview(); }
    private setExpandedPreviewPositionFromCollapsedButton(): void {
        const center = this.getCollapsedButtonCenter();
        const viewport = this.getBiblePreviewViewport();
        const width = this.getPreviewPanelWidth(viewport.width);
        const height = Math.max(120, this.previewPanelEl.offsetHeight || 220);
        this.customPreviewPosition = this.clampBiblePreviewPosition(center.x - (width - 23), center.y - 21, width, height);
        this.collapsedButtonPosition = null;
    }

    private getCollapsedButtonCenter(): { x: number; y: number } {
        const rect = this.collapsedButtonEl.getBoundingClientRect();
        if (this.collapsedButtonEl.style.display !== "none" && (rect.width > 0 || rect.height > 0)) {
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        }

        if (this.collapsedButtonPosition !== null) {
            return {
                x: this.collapsedButtonPosition.left + 21,
                y: this.collapsedButtonPosition.top + 21,
            };
        }

        const panelWidth = this.getCurrentPreviewPanelWidth();
        return {
            x: (this.customPreviewPosition?.left ?? 0) + Math.max(21, panelWidth - 21),
            y: (this.customPreviewPosition?.top ?? 0) + 21,
        };
    }
    private updateBiblePreviewPosition(): void { if (this.previewText.length === 0) return; const viewport = this.getBiblePreviewViewport(); this.updateExpandedPreviewSize(viewport.width, viewport.height); if (this.isPreviewCollapsed) { const pos = this.collapsedButtonPosition ?? this.clampBiblePreviewPosition((this.customPreviewPosition?.left ?? 0) + Math.max(0, this.getCurrentPreviewPanelWidth() - 42), this.customPreviewPosition?.top ?? 0, 42, 42); this.collapsedButtonPosition = pos; this.collapsedButtonEl.style.left = `${pos.left}px`; this.collapsedButtonEl.style.top = `${pos.top}px`; return; } if (this.customPreviewPosition !== null) { const pos = this.clampBiblePreviewPosition(this.customPreviewPosition.left, this.customPreviewPosition.top, this.previewPanelEl.offsetWidth, this.previewPanelEl.offsetHeight); this.customPreviewPosition = pos; this.previewPanelEl.style.left = `${pos.left}px`; this.previewPanelEl.style.top = `${pos.top}px`; } }
    private getExpandedPreviewPositionForAnchor(anchorEl: HTMLElement): { left: number; top: number } { const viewport = this.getBiblePreviewViewport(); const rect = anchorEl.getBoundingClientRect(); return this.clampBiblePreviewPosition(rect.left, rect.bottom + 6, this.getPreviewPanelWidth(viewport.width), Math.max(120, this.previewPanelEl.offsetHeight || 220)); }
    private rememberCollapsedButtonPosition(anchorEl: HTMLElement): void { const rect = anchorEl.getBoundingClientRect(); this.collapsedButtonPosition = this.clampBiblePreviewPosition(rect.left + rect.width / 2 - 21, rect.top + rect.height / 2 - 21, 42, 42); }
    private getCurrentPreviewPanelWidth(): number { const parsed = Number.parseFloat(this.previewPanelEl.style.width); return Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(240, this.previewPanelEl.offsetWidth); }
    private getPreviewPanelWidth(viewportWidth: number): number { return this.isMobilePreviewLayout(viewportWidth) ? Math.max(240, viewportWidth - 16) : Math.min(720, Math.max(320, viewportWidth * 0.42)); }
    private updateExpandedPreviewSize(viewportWidth: number, viewportHeight: number): void { if (this.isMobilePreviewLayout(viewportWidth)) { const width = Math.max(240, viewportWidth - 16); const maxHeight = Math.max(120, Math.floor(viewportHeight * 0.27)); this.previewPanelEl.style.width = `${width}px`; this.previewPanelEl.style.maxHeight = `${maxHeight}px`; this.previewContentEl.style.maxHeight = `${Math.max(78, maxHeight - 42)}px`; return; } const width = Math.min(720, Math.max(320, viewportWidth * 0.42)); const maxHeight = Math.max(220, Math.floor(viewportHeight * 0.4)); this.previewPanelEl.style.width = `${width}px`; this.previewPanelEl.style.maxHeight = `${maxHeight}px`; this.previewContentEl.style.maxHeight = `${Math.max(160, maxHeight - 42)}px`; }
    private clampBiblePreviewPosition(left: number, top: number, width: number, height: number): { left: number; top: number } { const viewport = this.getBiblePreviewViewport(); const safe = this.getBiblePreviewSafeMargins(viewport.width); const minLeft = viewport.left + safe.left; const maxLeft = Math.max(minLeft, viewport.left + viewport.width - width - safe.right); const minTop = viewport.top + safe.top; const maxTop = Math.max(minTop, viewport.top + viewport.height - height - safe.bottom); return { left: Math.min(Math.max(left, minLeft), maxLeft), top: Math.min(Math.max(top, minTop), maxTop) }; }
    private getBiblePreviewViewport(): { left: number; top: number; width: number; height: number } { const viewport = window.visualViewport; return { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight }; }
    private getBiblePreviewSafeMargins(viewportWidth: number): { top: number; right: number; bottom: number; left: number } { return this.isMobilePreviewLayout(viewportWidth) ? { top: Platform.isAndroidApp ? 72 : 56, right: 8, bottom: 12, left: 8 } : { top: 12, right: 12, bottom: 46, left: 12 }; }
    private isMobilePreviewLayout(viewportWidth: number): boolean { return viewportWidth < 700; }
    private updateBiblePreviewTitle(): void { if (this.previewTitleEl !== null) this.previewTitleEl.textContent = `📖 ${this.plugin.getActiveTranslationPreviewTitle()}`; }
    private async copyBiblePreviewText(): Promise<void> { if (this.previewText.length === 0) return; try { if (navigator.clipboard !== undefined) await navigator.clipboard.writeText(this.previewText); else this.copyBiblePreviewTextFallback(); new Notice(this.plugin.t("notice.bibleTextCopied"), 2500); } catch { this.copyBiblePreviewTextFallback(); new Notice(this.plugin.t("notice.bibleTextCopied"), 2500); } }
    private copyBiblePreviewTextFallback(): void { const el = document.createElement("textarea"); el.value = this.previewText; el.style.position = "fixed"; el.style.left = "-9999px"; el.style.top = "0"; document.body.appendChild(el); el.focus(); el.select(); document.execCommand("copy"); el.remove(); }
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

        const colorInput = bibleReferenceLinkColorSetting.controlEl.createEl("input");
        colorInput.type = "color";
        colorInput.value = this.plugin.getBibleReferenceLinkColorPickerValue();
        colorInput.setAttribute("aria-label", this.plugin.t("settings.linkColor.aria"));
        colorInput.addEventListener("input", () => void this.plugin.setBibleReferenceLinkColor(colorInput.value));

        const previewEl = bibleReferenceLinkColorSetting.controlEl.createSpan({ text: this.plugin.t("settings.linkColor.preview") });
        previewEl.style.color = this.plugin.isBibleReferenceLinkColorDefault()
            ? "var(--link-color)"
            : this.plugin.getBibleReferenceLinkColorPickerValue();
        previewEl.style.textDecoration = "underline";
        previewEl.style.textDecorationStyle = "dotted";
        previewEl.style.marginLeft = "8px";
        previewEl.style.whiteSpace = "nowrap";

        const resetButton = bibleReferenceLinkColorSetting.controlEl.createEl("button", { text: this.plugin.t("settings.reset") });
        resetButton.disabled = this.plugin.isBibleReferenceLinkColorDefault();
        resetButton.style.marginLeft = "8px";
        resetButton.addEventListener("click", async (event) => {
            event.preventDefault();
            await this.plugin.resetBibleReferenceLinkColor();
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
        interfaceLanguage: normalizeBiblePluginLocale(value.interfaceLanguage),
        translationOrder: [...new Set(translationOrder)],
        bibleReferenceLinkColor: typeof value.bibleReferenceLinkColor === "string"
            ? normalizeBibleReferenceLinkColor(value.bibleReferenceLinkColor)
            : DEFAULT_SETTINGS.bibleReferenceLinkColor,
        previewTriggerMode: typeof value.previewTriggerMode === "string" && isBiblePreviewTriggerMode(value.previewTriggerMode)
            ? value.previewTriggerMode
            : DEFAULT_SETTINGS.previewTriggerMode,
        interceptLinkOpenShortcut: typeof value.interceptLinkOpenShortcut === "boolean"
            ? value.interceptLinkOpenShortcut
            : DEFAULT_SETTINGS.interceptLinkOpenShortcut,
        linkOpenShortcut: typeof value.linkOpenShortcut === "string" && isBibleLinkOpenShortcut(value.linkOpenShortcut)
            ? value.linkOpenShortcut
            : DEFAULT_SETTINGS.linkOpenShortcut,
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

function isBiblePreviewTriggerMode(value: string): value is BiblePreviewTriggerMode {
    return value === "current-paragraph" || value === "clicked-reference";
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
