import { Plugin, MarkdownView } from "obsidian";
import { EditorView } from "@codemirror/view";
import { ViewPlugin } from "@codemirror/view";
import { ViewUpdate } from "@codemirror/view";


export default class BiblePlugin extends Plugin {
    async onload() {
        console.log("Bible plugin loaded");

        this.registerEditorExtension(
            this.createCursorExtension()
        );
    }

    onunload() {
        console.log("Bible plugin unloaded");
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

        return ViewPlugin.fromClass(
            class {
                update(update: ViewUpdate) {
                    if (update.selectionSet) {
                        const paragraph = plugin.getCurrentParagraph(update);

                        console.log("PARAGRAPH:\n", paragraph);

                        if (paragraph.includes("Привет")) {
                            console.log("✅ Есть слово Привет");
                        } else {
                            console.log("❌ Нет слова Привет");
                        }
                    }
                }
            }
        );
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

}
