import { Plugin, MarkdownView } from "obsidian";

export default class BiblePlugin extends Plugin {
    async onload() {
        console.log("Bible plugin loaded");

        this.registerEvent(
            this.app.workspace.on("editor-change", () => {
                this.onCursorActivity();
            })
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

        console.log("Current line:", line);

        if (line.includes("Привет")) {
            this.showMessage(view, "Есть слово Привет");
        } else {
            this.showMessage(view, "Нет слова Привет");
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
}
