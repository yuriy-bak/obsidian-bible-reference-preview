import { App, Notice, Plugin, MarkdownView, PluginSettingTab, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { ViewPlugin } from "@codemirror/view";
import { ViewUpdate } from "@codemirror/view";
import { Decoration, WidgetType } from "@codemirror/view";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createFallbackRussianBookMapping } from "./src/parsing/BookMapping";
import { DEFAULT_TRANSLATION_ID } from "./src/application/DefaultTranslation";
import { getBibleTextBlocks } from "./src/application/getBibleTexts";
import { formatBibleTextBlocks } from "./src/application/formatBibleTexts";
import { importBibleFromEpub } from "./src/application/importBibleFromEpub";
import { createMockBibleIndexRepository } from "./src/infrastructure/createMockBibleIndexRepository";
import { ObsidianBibleIndexRepository } from "./src/infrastructure/ObsidianBibleIndexRepository";
import { JsZipEpubBibleImporter } from "./src/infrastructure/epub/JsZipEpubBibleImporter";

export default class BiblePlugin extends Plugin {
    private readonly bookMapping = createFallbackRussianBookMapping();
    private readonly bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
    private readonly bibleIndexRepository = createMockBibleIndexRepository();
    private bibleIndex = this.bibleIndexRepository.getIndex();

    async onload() {
        console.log("Bible plugin loaded");

        await this.loadBibleIndex();

        this.addCommand({
            id: "import-epub-bible",
            name: "Import EPUB Bible",
            callback: () => this.openEpubFilePicker(),
        });

        this.addSettingTab(new BiblePluginSettingTab(this.app, this));

        this.registerEditorExtension(
            this.createCursorExtension()
        );
    }

    onunload() {
        console.log("Bible plugin unloaded");
    }

    private async loadBibleIndex(): Promise<void> {
        try {
            const repository = this.createObsidianBibleIndexRepository();

            await repository.load();
            this.bibleIndex = repository.getIndex();
        } catch (error) {
            console.warn("Bible index load failed. Mock Bible index will be used.", error);
            this.bibleIndex = this.bibleIndexRepository.getIndex();
        }
    }

    public openEpubFilePicker(): void {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".epub,application/epub+zip";

        input.onchange = () => {
            const file = input.files?.[0];
            if (file === undefined) {
                return;
            }

            void this.importEpubFile(file);
        };

        input.click();
    }

    public async importEpubFile(file: File): Promise<void> {
        const progressNotice = new Notice(`Импорт EPUB: ${file.name}...`, 0);

        try {
            const repository = this.createObsidianBibleIndexRepository();
            const importer = new JsZipEpubBibleImporter();
            const result = await importBibleFromEpub({
                epub: {
                    fileName: file.name,
                    content: await file.arrayBuffer(),
                    translationId: DEFAULT_TRANSLATION_ID,
                    translationName: this.createTranslationName(file.name),
                },
                importer,
                repository,
            });

            this.bibleIndex = repository.getIndex();
            progressNotice.hide();

            if (result.warnings.length > 0) {
                console.warn("EPUB import warnings", result.warnings);
            }

            const warningsText = result.warnings.length === 0
                ? ""
                : ` Предупреждений: ${result.warnings.length}. Подробности в консоли разработчика.`;
            new Notice(`EPUB импортирован. Книг: ${result.books.length}.${warningsText}`, 10000);
        } catch (error) {
            progressNotice.hide();
            console.error("EPUB import failed", error);
            new Notice(`Ошибка импорта EPUB: ${getErrorMessage(error)}`, 15000);
        }
    }

    private createObsidianBibleIndexRepository(): ObsidianBibleIndexRepository {
        return new ObsidianBibleIndexRepository(
            this.app.vault.adapter,
            this.getBibleIndexDataDirectoryPath(),
        );
    }

    private createTranslationName(fileName: string): string {
        return fileName.replace(/\.epub$/i, "").trim() || "Imported EPUB Bible";
    }

    private getBibleIndexDataDirectoryPath(): string {
        return `${this.getPluginDirectoryPath()}/data`;
    }

    private getPluginDirectoryPath(): string {
        const manifestWithDirectory = this.manifest as { dir?: string };
        return manifestWithDirectory.dir ?? `.obsidian/plugins/${this.manifest.id}`;
    }

    onCursorActivity() {

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const editor = view.editor;
        const cursor = editor.getCursor();

        const line = editor.getLine(cursor.line) || "";

        if (line.includes("Привет")) {
            alert("Есть слово Привет");
        }

    }

    showMessage(view: MarkdownView, text: string) {
        const container = view.containerEl;

        let el = container.querySelector(".bible-test-block");

        if (!el) {
            el = document.createElement("div");
            el.className = "bible-test-block";

            container.appendChild(el);
        }

        const htmlEl = el as HTMLElement;

        htmlEl.style.border = "1px solid red";
        htmlEl.style.padding = "8px";
        htmlEl.style.marginTop = "4px";

        htmlEl.textContent = text;

    }

    createCursorExtension() {
        const plugin = this;

        return ViewPlugin.fromClass(class {

            decorations = Decoration.none;
            lastParagraph: string = "";

            update(update: ViewUpdate) {
                if (!update.selectionSet && !update.docChanged) return;

                const paragraph = plugin.getCurrentParagraph(update);

                // ✅ если абзац не изменился — ничего не делаем
                if (paragraph === this.lastParagraph) {
                    return;
                }

                this.lastParagraph = paragraph;

                if (!paragraph) {
                    this.decorations = Decoration.none;
                    return;
                }

                const end = plugin.getParagraphEnd(update);
                if (end === null) {
                    this.decorations = Decoration.none;
                    return;
                }

                const text = plugin.analyzeParagraph(paragraph);
                if (text === "") {
                    this.decorations = Decoration.none;
                    return;
                }

                const deco = Decoration.widget({
                    widget: new BibleWidget(text),
                    side: 1
                }).range(end);

                this.decorations = Decoration.set([deco]);
            }

        },
            {
                decorations: v => v.decorations
            });
    }

    analyzeParagraph(text: string): string {
        try {
            const references = this.bibleReferenceParser.parse(text);

            if (references.length === 0) {
                return "";
            }

            const bibleTextBlocks = getBibleTextBlocks(
                references,
                this.bibleIndex,
                DEFAULT_TRANSLATION_ID,
            );

            if (bibleTextBlocks.length === 0) {
                return "";
            }

            return formatBibleTextBlocks(bibleTextBlocks, this.bookMapping);
        } catch {
            return "";
        }
    }

    getCurrentParagraph(update: ViewUpdate): string {
        const doc = update.state.doc;

        const pos = update.state.selection.main.head;
        const line = doc.lineAt(pos);

        // ✅ Если текущая строка пустая — нет абзаца
        if (line.text.trim() === "") {
            return "";
        }

        const lines: string[] = [];

        // вверх
        let current = line;
        while (current.number > 1) {
            const prev = doc.line(current.number - 1);
            if (prev.text.trim() === "") break;

            lines.unshift(prev.text);
            current = prev;
        }

        // текущая
        lines.push(line.text);

        // вниз
        current = line;
        while (current.number < doc.lines) {
            const next = doc.line(current.number + 1);
            if (next.text.trim() === "") break;

            lines.push(next.text);
            current = next;
        }

        return lines.join("\n");
    }

    getParagraphEnd(update: ViewUpdate): number | null {
        const doc = update.state.doc;
        const pos = update.state.selection.main.head;
        let line = doc.lineAt(pos);

        // если пустая строка — нет абзаца
        if (line.text.trim() === "") {
            return null;
        }

        let current = line;

        // идём вниз до конца абзаца
        while (current.number < doc.lines) {
            const next = doc.line(current.number + 1);
            if (next.text.trim() === "") break;
            current = next;
        }

        return current.to;
    }
}

class BibleWidget extends WidgetType {
    text: string;

    constructor(text: string) {
        super();
        this.text = text;
    }

    toDOM(): HTMLElement {
        const el = document.createElement("div");

        el.style.border = "1px solid var(--color-accent)";
        el.style.padding = "6px";
        el.style.marginTop = "6px";
        el.style.borderRadius = "6px";
        el.style.background = "var(--background-secondary)";

        el.textContent = this.text;

        return el;
    }
}


class BiblePluginSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: BiblePlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Bible Plugin" });

        new Setting(containerEl)
            .setName("Импорт EPUB")
            .setDesc("Выбери EPUB-файл. Плагин извлечёт таблицу книг, стихи и сноски, сохранит bible-index.json и сразу перезагрузит индекс.")
            .addButton((button) => {
                button
                    .setButtonText("Импортировать EPUB")
                    .setCta()
                    .onClick(() => this.plugin.openEpubFilePicker());
            });
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
