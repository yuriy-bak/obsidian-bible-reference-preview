import type { EditorView } from "@codemirror/view";
import type { BiblePreviewController } from "./BiblePreviewController";
import type { BibleReferenceLinkDecorationCacheEntry } from "./BibleReferenceLinkDecorations";

export function registerEditorPreviewController(
    view: EditorView,
    controller: BiblePreviewController,
    editorViews: Set<EditorView>,
    previewControllers: Map<EditorView, BiblePreviewController>,
): void {
    editorViews.add(view);
    previewControllers.set(view, controller);
}

export function unregisterEditorPreviewController(
    view: EditorView,
    editorViews: Set<EditorView>,
    previewControllers: Map<EditorView, BiblePreviewController>,
    bibleReferenceLinkDecorationCache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>,
): void {
    previewControllers.delete(view);
    bibleReferenceLinkDecorationCache.delete(view);
    editorViews.delete(view);
}

export function refreshEditorPreviewControllerLocalizedLabels(controllers: Iterable<BiblePreviewController>): void {
    for (const controller of controllers) {
        controller.refreshLocalizedLabels();
    }
}
