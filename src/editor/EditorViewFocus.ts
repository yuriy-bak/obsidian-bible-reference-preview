import type { EditorView } from "@codemirror/view";
import type { BiblePreviewController } from "./BiblePreviewController";

export function findFocusedEditorView(views: Iterable<EditorView>): EditorView | null {
    for (const view of views) {
        if (isFocusedEditorView(view)) {
            return view;
        }
    }

    return null;
}

export function findFocusedEditorPreviewController(
    previewControllers: Iterable<[EditorView, BiblePreviewController]>,
): BiblePreviewController | null {
    for (const [view, controller] of previewControllers) {
        if (isFocusedEditorView(view)) {
            return controller;
        }
    }

    return null;
}

export function dispatchEditorViewNoopUpdate(views: Iterable<EditorView>): void {
    for (const view of views) {
        view.dispatch({});
    }
}

function isFocusedEditorView(view: EditorView): boolean {
    return view.hasFocus || view.dom.contains(document.activeElement);
}
