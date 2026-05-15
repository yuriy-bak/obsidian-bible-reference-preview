import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { BibleIndexData } from "./src/infrastructure/BibleIndexData";
import type { BibleIndexV2Data } from "./src/infrastructure/v2/BibleIndexV2Data";
import { EditorView, ViewPlugin, ViewUpdate, Decoration, WidgetType } from "@codemirror/view";
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

export default class BiblePlugin extends Plugin {
    private bookMapping = createFallbackRussianBookMapping();
    private bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
    private readonly fallbackBibleIndexRepository = createMockBibleIndexRepository();
    private bibleIndex = this.fallbackBibleIndexRepository.getIndex();
    private activeV2Data: BibleIndexV2Data | null = null;
    private activeLegacyData: BibleIndexData | null = this.fallbackBibleIndexRepository.getData();
    private activeTranslationId = DEFAULT_TRANSLATION_ID;

    async onload() {
        console.log("Bible plugin loaded");
        await this.loadBibleIndex();
        this.addCommand({ id: "import-epub-bible", name: "Import EPUB Bible", callback: () => this.openEpubFilePicker() });
        this.addCommand({ id: "reload-bible-index", name: "Reload Bible Index", callback: () => void this.reloadBibleIndex() });
        this.addCommand({ id: "open-bible-index-folder", name: "Open Bible Index Folder", callback: () => void this.openBibleIndexFolder() });
        this.addCommand({ id: "show-bible-index-stats", name: "Show Bible Index Stats", callback: () => void this.showBibleIndexStats() });
        this.addSettingTab(new BiblePluginSettingTab(this.app, this));
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

    private async reloadBibleIndex(): Promise<void> { await this.loadBibleIndex(); new Notice("Bible index reloaded.", 5000); }

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
                this.activeTranslationId = result.translationId;
                this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
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

        if (v2Data.translations[this.activeTranslationId] !== undefined) {
            return this.activeTranslationId;
        }

        return Object.keys(v2Data.translations).sort()[0] ?? DEFAULT_TRANSLATION_ID;
    }

    private getBibleIndexDataDirectoryPath(): string { return `${this.getPluginDirectoryPath()}/data`; }
    private getPluginDirectoryPath(): string { const manifestWithDirectory = this.manifest as { dir?: string }; return manifestWithDirectory.dir ?? `.obsidian/plugins/${this.manifest.id}`; }

    createCursorExtension() {
        const plugin = this;
        return ViewPlugin.fromClass(class {
            decorations = Decoration.none;
            lastParagraph = "";
            requestId = 0;
            constructor(private readonly view: EditorView) { }
            update(update: ViewUpdate) {
                if (!update.selectionSet && !update.docChanged) return;
                const paragraph = plugin.getCurrentParagraph(update);
                if (paragraph === this.lastParagraph) return;
                this.lastParagraph = paragraph;
                const currentRequestId = ++this.requestId;
                const end = plugin.getParagraphEnd(update);
                if (!paragraph || end === null) { this.decorations = Decoration.none; return; }
                void plugin.analyzeParagraphAsync(paragraph).then((text) => {
                    if (currentRequestId !== this.requestId || paragraph !== this.lastParagraph) return;
                    this.decorations = text === "" ? Decoration.none : Decoration.set([Decoration.widget({ widget: new BibleWidget(text), side: 1 }).range(end)]);
                    this.view.dispatch({ effects: [] });
                });
            }
        }, { decorations: (value) => value.decorations });
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
    toDOM(): HTMLElement {
        const el = document.createElement("div");
        el.style.border = "1px solid var(--color-accent)";
        el.style.padding = "6px";
        el.style.marginTop = "6px";
        el.style.borderRadius = "6px";
        el.style.background = "var(--background-secondary)";
        el.style.whiteSpace = "pre-wrap";
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
        new Setting(containerEl)
            .setName("Открыть папку индекса")
            .setDesc("На desktop открывает data-папку индекса в системном файловом менеджере. На Android показывает путь.")
            .addButton((button) => button.setButtonText("Открыть папку индекса").onClick(() => void this.plugin.openBibleIndexFolder()));
        new Setting(containerEl)
            .setName("Показать статистику индекса")
            .setDesc("Показывает информацию о последнем импорте.")
            .addButton((button) => button.setButtonText("Показать статистику").onClick(() => void this.plugin.showBibleIndexStats()));
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

function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function formatKilobytes(bytes: number): string { return `${(bytes / 1024).toFixed(1)} KB`; }
function formatMegabytes(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
function normalizePath(path: string): string { return path.split("\\").join("/").replace(/\/+/g, "/"); }
function getDirectoryPath(path: string): string { const normalizedPath = normalizePath(path); const slashIndex = normalizedPath.lastIndexOf("/"); return slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex); }
