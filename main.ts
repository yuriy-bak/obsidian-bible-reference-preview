import { Plugin, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { ViewPlugin } from "@codemirror/view";
import { ViewUpdate } from "@codemirror/view";
import { Decoration, WidgetType } from "@codemirror/view";
import { BibleReferenceParser } from "./src/parsing/BibleReferenceParser";
import { createFallbackRussianBookMapping } from "./src/parsing/BookMapping";
import { DEFAULT_TRANSLATION_ID } from "./src/application/DefaultTranslation";
import { getBibleTextBlocks } from "./src/application/getBibleTexts";
import { formatBibleTextBlocks } from "./src/application/formatBibleTexts";
import { createMockBibleIndexRepository } from "./src/infrastructure/createMockBibleIndexRepository";
import { ObsidianBibleIndexRepository } from "./src/infrastructure/ObsidianBibleIndexRepository";

export default class BiblePlugin extends Plugin {
    private readonly bookMapping = createFallbackRussianBookMapping();
    private readonly bibleReferenceParser = new BibleReferenceParser(this.bookMapping);
    private readonly bibleIndexRepository = createMockBibleIndexRepository();
    private bibleIndex = this.bibleIndexRepository.getIndex();

    async onload() {
        console.log("Bible plugin loaded");

        await this.loadBibleIndex();

        this.registerEditorExtension(
            this.createCursorExtension()
        );
    }

    onunload() {
        console.log("Bible plugin unloaded");
    }

    private async loadBibleIndex(): Promise<void> {
        try {
            const repository = new ObsidianBibleIndexRepository(
                this.app.vault.adapter,
                this.getBibleIndexDataDirectoryPath(),
            );

            await repository.load();
            this.bibleIndex = repository.getIndex();
        } catch {
            this.bibleIndex = this.bibleIndexRepository.getIndex();
        }
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
