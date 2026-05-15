import { App, Notice, Plugin, MarkdownView, PluginSettingTab, Setting } from "obsidian";
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

    async onload() {
        console.log("Bible plugin loaded");
        await this.loadBibleIndex();
        this.addCommand({ id: "import-epub-bible", name: "Import EPUB Bible", callback: () => this.openEpubFilePicker() });
        this.addCommand({ id: "reload-bible-index", name: "Reload Bible Index", callback: () => void this.reloadBibleIndex() });
        this.addCommand({ id: "open-bible-index-folder", name: "Open Bible Index Folder", callback: () => void this.openBibleIndexFolder() });
        this.addCommand({ id: "show-bible-index-stats", name: "Show Bible Index Stats", callback: () => this.showBibleIndexStats() });
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
            this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
        } catch (error) {
            console.warn("Bible index load failed. Mock Bible index will be used.", error);
            this.bibleIndex = this.fallbackBibleIndexRepository.getIndex();
            this.activeV2Data = null;
            this.activeLegacyData = this.fallbackBibleIndexRepository.getData();
            this.updateBookMapping(null, this.activeLegacyData);
        }
    }

    private async reloadBibleIndex(): Promise<void> { await this.loadBibleIndex(); new Notice("Bible index reloaded.", 5000); }

    public openEpubFilePicker(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".epub,.tsv,application/epub+zip";
        input.onchange = () => { const file = input.files?.[0]; if (file !== undefined) void this.importEpubFile(file); };
        input.click();
    }

    public async importEpubFile(file: File): Promise<void> {
        const progressNotice = new Notice(`Импорт EPUB: ${file.name}...`, 0);
        try {
            const repository = this.createObsidianBibleIndexRepository();
            const result = await importBibleFromEpub({
                epub: { fileName: file.name, content: await file.arrayBuffer(), translationId: DEFAULT_TRANSLATION_ID, translationName: this.createTranslationName(file.name) },
                importer: new JsZipEpubBibleImporter(),
                repository,
            });
            this.bibleIndex = repository.getIndex();
            this.activeV2Data = repository.getV2Data();
            this.activeLegacyData = repository.getLegacyData();
            this.updateBookMapping(this.activeV2Data, this.activeLegacyData);
            progressNotice.hide();
            if (result.warnings.length > 0) console.warn("EPUB import warnings", result.warnings);
            const warningsText = result.warnings.length === 0 ? "" : `
Предупреждений: ${result.warnings.length}. Подробности в консоли разработчика.`;
            new Notice([
                "EPUB импортирован.",
                `Книг: ${result.report.books}`,
                `Глав: ${result.report.chapters}`,
                `Стихов: ${result.report.verses}`,
                `Сносок: ${result.report.footnotes}`,
                `Размер metadata: ${formatKilobytes(result.report.metadataBytes)}`,
                `Размер books: ${formatMegabytes(result.report.booksBytes)}`,
            ].join("\n") + warningsText, 15000);
        } catch (error) {
            progressNotice.hide();
            console.error("EPUB import failed", error);
            new Notice(`Ошибка импорта EPUB: ${getErrorMessage(error)}`, 15000);
        }
    }

    private createObsidianBibleIndexRepository(): ObsidianBibleIndexV2Repository {
        return new ObsidianBibleIndexV2Repository(this.app.vault.adapter, this.getBibleIndexDataDirectoryPath());
    }

    private createTranslationName(fileName: string): string { return fileName.replace(/\.(epub|tsv)$/i, "").trim() || "Imported EPUB Bible"; }

    private updateBookMapping(v2Data: BibleIndexV2Data | null, legacyData: BibleIndexData | null): void {
        this.bookMapping = v2Data !== null
            ? createBookMappingFromBibleIndexV2Data(v2Data, DEFAULT_TRANSLATION_ID)
            : createBookMappingFromBibleIndexData(legacyData ?? this.fallbackBibleIndexRepository.getData(), DEFAULT_TRANSLATION_ID);
        this.bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
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
            const bibleTextBlocks = await getBibleTextBlocks(references, this.bibleIndex, DEFAULT_TRANSLATION_ID);
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
        return lines.join(",n");
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

        const appWithShowInFolder = this.app as App & {
            showInFolder?: (path: string) => void;
        };

        if (typeof appWithShowInFolder.showInFolder === "function") {
            appWithShowInFolder.showInFolder(directoryPath);
            return;
        }

        new Notice(`Папка индекса: ${directoryPath}`, 10000);
    }

    private async ensureVaultDirectoryExists(path: string): Promise<void> {
        const normalizedPath = normalizePath(path);

        if (normalizedPath.length === 0 || await this.app.vault.adapter.exists(normalizedPath)) {
            return;
        }

        const parentPath = getDirectoryPath(normalizedPath);
        if (parentPath.length > 0 && parentPath !== normalizedPath) {
            await this.ensureVaultDirectoryExists(parentPath);
        }

        if (!(await this.app.vault.adapter.exists(normalizedPath))) {
            await this.app.vault.adapter.mkdir(normalizedPath);
        }
    }

    showBibleIndexStats(): void {
        if (this.activeV2Data !== null) {
            const translation = this.activeV2Data.translations[DEFAULT_TRANSLATION_ID]; new Notice(`Bible Index v2
Книг в metadata: ${translation === undefined ? 0 : Object.keys(translation.books).length}`, 10000); return;
        }
        if (this.activeLegacyData !== null) {
            const translation = this.activeLegacyData.translations[DEFAULT_TRANSLATION_ID]; new Notice(`Legacy Bible Index
Книг: ${translation === undefined ? 0 : Object.keys(translation.books).length}`, 10000); return;
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

class BiblePluginSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: BiblePlugin) { super(app, plugin); }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Bible Plugin" });
        new Setting(containerEl).setName("Импортировать EPUB").setDesc("Создать bible-index-v2.json и compact JSON по книгам.").addButton((button) => button.setButtonText("Импортировать EPUB").setCta().onClick(() => this.plugin.openEpubFilePicker()));
        new Setting(containerEl).setName("Переимпортировать EPUB").setDesc("Выбери EPUB/TSV-ZIP файл заново.").addButton((button) => button.setButtonText("Переимпортировать EPUB").onClick(() => this.plugin.openEpubFilePicker()));
        new Setting(containerEl).setName("Открыть папку индекса").setDesc("Открывает data-папку индекса в системном файловом менеджере.").addButton((button) => button.setButtonText("Открыть папку индекса").onClick(() => void this.plugin.openBibleIndexFolder()));
        new Setting(containerEl).setName("Показать статистику индекса").setDesc("Показывает информацию о загруженном индексе.").addButton((button) => button.setButtonText("Показать статистику").onClick(() => this.plugin.showBibleIndexStats()));
    }
}

function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function formatKilobytes(bytes: number): string { return `${(bytes / 1024).toFixed(1)} KB`; }
function formatMegabytes(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
function normalizePath(path: string): string { return path.split("\\").join("/").replace(/\/+/g, "/"); }
function getDirectoryPath(path: string): string { const normalizedPath = normalizePath(path); const slashIndex = normalizedPath.lastIndexOf("/"); return slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex); }