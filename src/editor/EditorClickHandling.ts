import type { EditorView } from "@codemirror/view";
import { Platform } from "obsidian";
import type { BiblePreviewDisplayMode, BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { EditorClickedReference } from "./EditorClickedReference";

export type EditorReferenceClickHandlingInput = {
    event: MouseEvent;
    view: EditorView;
    clickedReference: EditorClickedReference | null;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    getBiblePreviewTriggerMode(): BiblePreviewTriggerMode;
    getBiblePreviewDisplayMode(): BiblePreviewDisplayMode;
    hasImportedTranslations(): boolean;
    hasBiblePreviewPane(): boolean;
    findBibleReferenceMatchAtPosition(view: EditorView, position: number): EditorClickedReference | null;
    openBibleReferenceMatch(match: EditorClickedReference): void;
};

export function handleEditorReferenceClick(input: EditorReferenceClickHandlingInput): void {
    if (!input.shouldRunBiblePreviewForEditor(input.view)) {
        return;
    }
    if (input.getBiblePreviewTriggerMode() !== "clicked-reference" || !input.hasImportedTranslations()) {
        return;
    }

    const position = input.view.posAtCoords({ x: input.event.clientX, y: input.event.clientY });
    if (position === null) {
        return;
    }

    const match = input.findBibleReferenceMatchAtPosition(input.view, position);
    if (match === null) {
        return;
    }

    if (
        Platform.isMobileApp
        && input.getBiblePreviewDisplayMode() === "side-panel"
        && input.hasBiblePreviewPane()
        && input.clickedReference?.from === match.from
        && input.clickedReference.to === match.to
        && input.clickedReference.text === match.text
    ) {
        return;
    }

    input.event.preventDefault();
    input.openBibleReferenceMatch(match);
}
