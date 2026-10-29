import { MarkdownView, type App } from "obsidian";

/** Re-runs the markdown post processors in open reading-mode views, so their Bible links match the current parser. */
export function rerenderReadingModeViews(app: App): void {
    for (const leaf of app.workspace.getLeavesOfType("markdown")) {
        // Deferred tabs are not MarkdownView yet; they render with the current parser when opened.
        const view = leaf.view;
        if (view instanceof MarkdownView && view.getMode() === "preview") {
            view.previewMode.rerender(true);
        }
    }
}
