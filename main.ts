
import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { BibleIndexData } from "./src/infrastructure/BibleIndexData";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import { StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createFallbackRussianBookMapping } from "./src/parsing/BookMapping";
import { DEFAULT_TRANSLATION_ID } from "./src/application/DefaultTranslation";
import { getBibleTextBlocks } from "./src/application/getBibleTexts";
import { formatBibleTextBlocks } from "./src/application/formatBibleTexts";
import { importBibleFromEpub } from "./src/application/importBibleFromEpub";
import { createMockBibleIndexRepository } from "./src/infrastructure/createMockBibleIndexRepository";
import { createBookMappingFromBibleIndexData } from "./src/infrastructure/createBookMappingFromBibleIndexData";
import { EpubBibleSourceMetadata } from "./src/infrastructure/EpubBibleImporter";
import { JsZipEpubBibleImporter } from "./src/infrastructure/epub/JsZipEpubBibleImporter";
import { ObsidianBibleIndexV2Repository } from "./src/infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "./src/infrastructure/v2/createBookMappingFromBibleIndexV2Data";


const setBibleDecorationsEffect = StateEffect.define<DecorationSet>();

const bibleDecorationsField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },

    update(decorations, transaction) {
        let nextDecorations = decorations.map(transaction.changes);

        for (const effect of transaction.effects) {
            if (effect.is(setBibleDecorationsEffect)) {
                nextDecorations = effect.value;
            }
        }

        return nextDecorations;
    },

    provide: (field) => EditorView.decorations.from(field),
});

function dispatchBibleDecorations(view: EditorView, decorations: DecorationSet): void {
    window.setTimeout(() => {
        if (view.state.field(bibleDecorationsField, false) === undefined) {
            return;
        }

        view.dispatch({
            effects: setBibleDecorationsEffect.of(decorations),
        });
    }, 0);
}

type BiblePluginSettings = {
    translationOrder: string[];
};

const DEFAULT_SETTINGS: BiblePluginSettings = {
    translationOrder: [],
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
    private bookMapping = createFallbackRussianBookMapping();
    private bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
    private readonly fallbackBibleIndexRepository = createMockBibleIndexRepository();
    private bibleIndex = this.fallbackBibleIndexRepository.getIndex();
    private activeV2Data: BibleIndexV2Data | null = null;
    private activeLegacyData: BibleIndexData | null = this.fallbackBibleIndexRepository.getData();
    private activeTranslationId = DEFAULT_TRANSLATION_ID;
    private settings: BiblePluginSettings = { ...DEFAULT_SETTINGS };
    private settingsTab: BiblePluginSettingTab | null = null;

    async onload() {
        console.log("Bible plugin loaded");
        await this.loadPluginSettings();
        await this.loadBibleIndex();
        this.addCommand({ id: "import-epub-bible", name: "Import EPUB Bible", callback: () => this.openEpubFilePicker() });
        this.addCommand({ id: "reload-bible-index", name: "Reload Bible Index", callback: () => void this.reloadBibleIndex() });
        this.addCommand({ id: "open-bible-index-folder", name: "Open Bible Index Folder", callback: () => void this.openBibleIndexFolder() });
        this.addCommand({ id: "show-bible-index-stats", name: "Show Bible Index Stats", callback: () => void this.showBibleIndexStats() });
        this.settingsTab = new BiblePluginSettingTab(this.app, this);
        this.addSettingTab(this.settingsTab);
        this.registerEditorExtension(this.createCursorExtension());
    }

    onunload() { console.log("Bible plugin unloaded"); }

    private async loadBibleIndex(): Promise<void> {
        try {
            const repository = this.createObsidianBibleIndexRepository();
            await repository.load();
            this.bibleIndex = repository.getIndex();
            this.activeV2Data = repository.getV2Data();
            this.activeLegacyData = repository.getLegacyData();
            const lastImportReport = await repository.readLastImportReport();
            await this.syncTranslationOrder(this.activeV2Data, lastImportReport?.translationId);
            this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
            this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
        } catch (error) {
            console.warn("Bible index load failed. Mock Bible index will be used.", error);
            this.bibleIndex = this.fallbackBibleIndexRepository.getIndex();
            this.activeV2Data = null;
            this.activeLegacyData = this.fallbackBibleIndexRepository.getData();
            this.activeTranslationId = DEFAULT_TRANSLATION_ID;
            this.updateBookMapping(null, this.activeLegacyData);
        }
    }

    private async reloadBibleIndex(): Promise<void> {
        await this.loadBibleIndex();
        this.refreshSettingsTab();
        new Notice("Bible index reloaded.", 5000);
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

            const progressNotice = new Notice(`Импорт EPUB: ${file.name}...`, 0);

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
                this.activeLegacyData = repository.getLegacyData();
                await this.promoteTranslationToTop(result.translationId);
                this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
                this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
                this.refreshSettingsTab();
                progressNotice.hide();

                if (result.warnings.length > 0) console.warn("EPUB import warnings", result.warnings);
                const warningsText = result.warnings.length === 0 ? "" : `\nПредупреждений: ${result.warnings.length}. Подробности в консоли разработчика.`;
                new Notice([
                    "EPUB импортирован.",
                    `Перевод: ${result.translationName}`,
                    `Язык: ${result.language}`,
                    `Книг: ${result.report.books}`,
                    `Глав: ${result.report.chapters}`,
                    `Стихов: ${result.report.verses}`,
                    `Сносок: ${result.report.footnotes}`,
                    `Размер metadata: ${formatKilobytes(result.report.metadataBytes)}`,
                    `Размер books: ${formatMegabytes(result.report.booksBytes)}`,
                ].join("\n") + warningsText, 15000);
            } catch (error) {
                progressNotice.hide();
                throw error;
            }
        } catch (error) {
            console.error("EPUB import failed", error);
            new Notice(`Ошибка импорта EPUB: ${getErrorMessage(error)}`, 15000);
        }
    }

    private async readAndValidateEpubFile(file: File): Promise<ArrayBuffer> {
        const content = await file.arrayBuffer();

        console.log("EPUB file selected", {
            name: file.name,
            size: file.size,
            arrayBufferBytes: content.byteLength,
            firstBytes: Array.from(new Uint8Array(content.slice(0, Math.min(8, content.byteLength)))),
            platform: {
                isMobileApp: Platform.isMobileApp,
                isAndroidApp: Platform.isAndroidApp,
                isIosApp: Platform.isIosApp,
            },
        });

        if (content.byteLength === 0) {
            throw new Error([
                "выбранный файл прочитан как пустой (0 байт).",
                `Имя файла: ${file.name}. Размер по данным Android/браузера: ${file.size} байт.`,
                "Это похоже на проблему Android file picker: Obsidian получил ссылку на файл, но не получил его бинарное содержимое.",
                "Попробуй выбрать файл из другого файлового менеджера или сначала скопировать EPUB в локальное хранилище устройства.",
            ].join(" "));
        }

        if (content.byteLength < 4) {
            throw new Error(`файл слишком маленький для EPUB/ZIP: ${content.byteLength} байт.`);
        }

        const bytes = new Uint8Array(content.slice(0, 4));
        if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
            throw new Error([
                "файл не похож на EPUB/ZIP-контейнер: первые байты не PK.",
                `Первые байты: ${Array.from(bytes).join(", ")}.`,
                "Проверь, что выбран именно EPUB-файл, а не ярлык/страница/облачная ссылка.",
            ].join(" "));
        }

        return content;
    }

    private openImportSettingsModal(
        defaults: BibleTranslationImportSettings,
        translationAlreadyExists: boolean,
    ): Promise<BibleTranslationImportSettings | null> {
        return new Promise((resolve) => {
            new BibleTranslationImportModal(this.app, defaults, translationAlreadyExists, resolve).open();
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

    private updateBookMapping(v2Data: BibleIndexV2Data | null, legacyData: BibleIndexData | null): void {
        this.bookMapping = v2Data !== null
            ? createBookMappingFromBibleIndexV2Data(v2Data, this.activeTranslationId)
            : createBookMappingFromBibleIndexData(legacyData ?? this.fallbackBibleIndexRepository.getData(), DEFAULT_TRANSLATION_ID);
        this.bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
    }

    private selectActiveTranslationId(v2Data: BibleIndexV2Data | null): string {
        if (v2Data === null) {
            return DEFAULT_TRANSLATION_ID;
        }

        const availableTranslations = new Set(Object.keys(v2Data.translations));
        return this.settings.translationOrder.find((translationId) => availableTranslations.has(translationId))
            ?? Object.keys(v2Data.translations)[0]
            ?? DEFAULT_TRANSLATION_ID;
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
        this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
        new Notice(`Текущий перевод: ${this.getActiveTranslationDisplayName()}`, 4000);
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
        this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
        new Notice(`Текущий перевод: ${this.getActiveTranslationDisplayName()}`, 4000);
    }

    public async deleteImportedTranslation(translationId: string): Promise<void> {
        if (this.activeV2Data?.translations[translationId] === undefined) {
            return;
        }

        const translationName = this.activeV2Data.translations[translationId].name || translationId;
        const confirmed = window.confirm([
            `Удалить перевод "${translationName}"?`,
            "",
            "Будут удалены файлы перевода и запись в индексе.",
            "Если перевод понадобится снова, его нужно будет импортировать заново.",
        ].join("\n"));

        if (!confirmed) {
            return;
        }

        const repository = this.createObsidianBibleIndexRepository();
        await repository.load();
        await repository.deleteTranslation(translationId);

        this.bibleIndex = repository.getIndex();
        this.activeV2Data = repository.getV2Data();
        this.activeLegacyData = repository.getLegacyData();
        this.settings = {
            ...this.settings,
            translationOrder: this.settings.translationOrder.filter((existingTranslationId) => existingTranslationId !== translationId),
        };
        await this.savePluginSettings();
        await this.syncTranslationOrder(this.activeV2Data);
        this.activeTranslationId = this.selectActiveTranslationId(this.activeV2Data);
        this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
        new Notice(`Перевод удалён: ${translationName}`, 5000);
    }

    public getActiveTranslationDisplayName(): string {
        const translation = this.activeV2Data?.translations[this.activeTranslationId];
        return translation === undefined ? this.activeTranslationId : `${translation.name} (${translation.language})`;
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

            constructor(private readonly view: EditorView) { }

            update(update: ViewUpdate) {
                if (!update.selectionSet && !update.docChanged) {
                    return;
                }

                const paragraph = plugin.getCurrentParagraph(update);

                if (paragraph === this.lastParagraph) {
                    return;
                }

                this.lastParagraph = paragraph;
                const currentRequestId = ++this.requestId;
                const end = plugin.getParagraphEnd(update);

                if (!paragraph || end === null) {
                    dispatchBibleDecorations(this.view, Decoration.none);
                    return;
                }

                void plugin.analyzeParagraphAsync(paragraph).then((text) => {
                    if (currentRequestId !== this.requestId || paragraph !== this.lastParagraph) {
                        return;
                    }

                    const decorations = text === ""
                        ? Decoration.none
                        : Decoration.set([
                            Decoration.widget({
                                widget: new BibleWidget(text),
                                side: 1,
                                block: true,
                            }).range(end),
                        ]);

                    dispatchBibleDecorations(this.view, decorations);
                });
            }
        });

        return [
            bibleDecorationsField,
            cursorPlugin,
        ];
    }

    async analyzeParagraphAsync(text: string): Promise<string> {
        try {
            const references = this.bibleReferenceParser.parse(text);
            if (references.length === 0) return "";
            const bibleTextBlocks = await getBibleTextBlocks(references, this.bibleIndex, this.activeTranslationId);
            return bibleTextBlocks.length === 0 ? "" : formatBibleTextBlocks(bibleTextBlocks, this.bookMapping);
        } catch { return ""; }
    }

    getCurrentParagraph(update: ViewUpdate): string {
        const doc = update.state.doc;
        const line = doc.lineAt(update.state.selection.main.head);
        if (line.text.trim() === "") return "";
        const lines: string[] = [];
        let current = line;
        while (current.number > 1) { const previous = doc.line(current.number - 1); if (previous.text.trim() === "") break; lines.unshift(previous.text); current = previous; }
        lines.push(line.text);
        current = line;
        while (current.number < doc.lines) { const next = doc.line(current.number + 1); if (next.text.trim() === "") break; lines.push(next.text); current = next; }
        return lines.join("\n");
    }

    getParagraphEnd(update: ViewUpdate): number | null {
        const doc = update.state.doc;
        const line = doc.lineAt(update.state.selection.main.head);
        if (line.text.trim() === "") return null;
        let current = line;
        while (current.number < doc.lines) { const next = doc.line(current.number + 1); if (next.text.trim() === "") break; current = next; }
        return current.to;
    }

    async openBibleIndexFolder(): Promise<void> {
        const directoryPath = this.getBibleIndexDataDirectoryPath();
        await this.ensureVaultDirectoryExists(directoryPath);

        if (Platform.isMobileApp) {
            new Notice([
                "На мобильном Obsidian системное открытие папки недоступно.",
                `Папка индекса: ${directoryPath}`,
            ].join("\n"), 12000);
            return;
        }

        const appWithShowInFolder = this.app as App & { showInFolder?: (path: string) => void };
        if (typeof appWithShowInFolder.showInFolder === "function") {
            appWithShowInFolder.showInFolder(directoryPath);
            return;
        }

        new Notice(`Папка индекса: ${directoryPath}`, 10000);
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
                "Последний импорт:",
                `Перевод: ${report.translationName}`,
                `Язык: ${report.language}`,
                `Книг: ${report.books}`,
                `Глав: ${report.chapters}`,
                `Стихов: ${report.verses}`,
                `Сносок: ${report.footnotes}`,
                `Metadata: ${formatKilobytes(report.metadataBytes)}`,
                `Books: ${formatMegabytes(report.booksBytes)}`,
            ].join("\n"), 15000);
            return;
        }

        if (this.activeV2Data !== null) {
            const translationCount = Object.keys(this.activeV2Data.translations).length;
            new Notice(`Bible Index v2\nПереводов: ${translationCount}\nАктивный перевод: ${this.activeTranslationId}`, 10000);
            return;
        }

        if (this.activeLegacyData !== null) {
            const translation = this.activeLegacyData.translations[DEFAULT_TRANSLATION_ID];
            new Notice(`Legacy Bible Index\nКниг: ${translation === undefined ? 0 : Object.keys(translation.books).length}`, 10000);
            return;
        }

        new Notice("Bible index is not loaded.", 5000);
    }
}


class BibleWidget extends WidgetType {
    constructor(private readonly text: string) { super(); }

    eq(other: BibleWidget): boolean {
        return other.text === this.text;
    }

    toDOM(): HTMLElement {
        const el = document.createElement("div");
        el.style.border = "1px solid var(--color-accent)";
        el.style.padding = "6px";
        el.style.marginTop = "6px";
        el.style.borderRadius = "6px";
        el.style.background = "var(--background-secondary)";
        el.style.whiteSpace = "pre-wrap";
        el.style.maxHeight = "40vh";
        el.style.overflow = "auto";
        el.textContent = this.text;
        return el;
    }
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
        private readonly resolve: (value: BibleTranslationImportSettings | null) => void,
    ) {
        super(app);
        this.value = { ...defaults };
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Импорт перевода Библии" });

        if (this.translationAlreadyExists) {
            contentEl.createEl("p", {
                text: "Этот перевод уже импортирован. При продолжении старые данные этого перевода будут полностью заменены.",
                cls: "mod-warning",
            });
        } else {
            contentEl.createEl("p", {
                text: "Проверь название перевода. Старые данные будут заменены только если этот перевод уже был импортирован раньше.",
            });
        }


        const translationNameSetting = new Setting(contentEl)
            .setName("Название перевода");

        translationNameSetting.settingEl.style.flexDirection = "column";
        translationNameSetting.settingEl.style.alignItems = "stretch";
        translationNameSetting.controlEl.style.width = "100%";

        translationNameSetting.addText((text) => {
            text
                .setPlaceholder(this.value.translationNamePlaceholder)
                .setValue(this.value.translationName)
                .onChange((value) => {
                    this.value.translationName = value.trim();
                });

            text.inputEl.style.width = "100%";
        });


        new Setting(contentEl)
            .setName("Язык")
            .setDesc(this.value.language || "не определён");

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText("Отмена")
                .onClick(() => this.finish(null)))
            .addButton((button) => button
                .setButtonText("Импортировать")
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
            new Notice("Укажи название перевода.", 5000);
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
        containerEl.createEl("h2", { text: "Bible Plugin" });

        new Setting(containerEl)
            .setName("Импортировать EPUB")
            .setDesc("Создать или заменить перевод в bibles-index.json и compact JSON по книгам.")
            .addButton((button) => button.setButtonText("Импортировать EPUB").setCta().onClick(() => this.plugin.openEpubFilePicker()));

        this.renderTranslationsSection(containerEl);

        new Setting(containerEl)
            .setName("Открыть папку индекса")
            .setDesc("На desktop открывает data-папку индекса в системном файловом менеджере. На Android показывает путь.")
            .addButton((button) => button.setButtonText("Открыть папку индекса").onClick(() => void this.plugin.openBibleIndexFolder()));

        new Setting(containerEl)
            .setName("Показать статистику индекса")
            .setDesc("Показывает информацию о последнем импорте.")
            .addButton((button) => button.setButtonText("Показать статистику").onClick(() => void this.plugin.showBibleIndexStats()));
    }

    private renderTranslationsSection(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "Порядок переводов" });
        containerEl.createEl("p", {
            text: "Перетащи перевод, чтобы изменить порядок. Верхний перевод в списке используется сейчас. Позже этот порядок будет использоваться как приоритет автопоиска.",
        });

        const translations = this.plugin.getTranslationSettingsItems();

        if (translations.length === 0) {
            containerEl.createEl("p", { text: "Импортированных переводов пока нет." });
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
                `Язык: ${translation.language || "und"}`,
                `Книг: ${translation.bookCount}`,
                translation.sourceFileName.length === 0 ? "" : `Файл: ${translation.sourceFileName}`,
            ].filter((part) => part.length > 0).join(" · ");

            const descriptionEl = textEl.createDiv({ text: description });
            descriptionEl.style.fontSize = "12px";
            descriptionEl.style.color = "var(--text-muted)";
            descriptionEl.style.overflow = "hidden";
            descriptionEl.style.textOverflow = "ellipsis";
            descriptionEl.style.whiteSpace = "nowrap";

            const deleteButton = row.createEl("button", { text: "🗑" });
            deleteButton.setAttribute("aria-label", `Удалить перевод ${translation.name || translation.id}`);
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
        translationNamePlaceholder: fileNameWithoutExtension || "Введите название перевода",
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
        translationOrder: [...new Set(translationOrder)],
    };
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
