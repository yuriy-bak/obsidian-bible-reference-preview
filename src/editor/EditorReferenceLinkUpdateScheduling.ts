import type { DecorationSet, EditorView } from "@codemirror/view";
import { dispatchBibleReferenceLinkDecorations } from "./BibleReferenceLinkDecorations";

export type EditorReferenceLinkUpdateSchedulingInput = {
    view: EditorView;
    currentTimeout: number | null;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    createBibleReferenceLinkDecorations(view: EditorView): DecorationSet;
    setReferenceLinkUpdateTimeout(timeout: number | null): void;
};

export function scheduleEditorReferenceLinkUpdate(input: EditorReferenceLinkUpdateSchedulingInput): void {
    if (!input.shouldRunBiblePreviewForEditor(input.view)) {
        return;
    }
    if (input.currentTimeout !== null) {
        window.clearTimeout(input.currentTimeout);
    }

    const nextTimeout = window.setTimeout(() => {
        input.setReferenceLinkUpdateTimeout(null);
        dispatchBibleReferenceLinkDecorations(input.view, input.createBibleReferenceLinkDecorations(input.view));
    }, 75);

    input.setReferenceLinkUpdateTimeout(nextTimeout);
}
