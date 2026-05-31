import type { EditorView } from "@codemirror/view";
import { Notice } from "obsidian";
import type { EditorClickedReference } from "./EditorClickedReference";

export type EditorReferenceOpeningInput = {
    view: EditorView;
    showNotice: boolean;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    hasImportedTranslations(): boolean;
    findBibleReferenceMatchAtPosition(view: EditorView, position: number): EditorClickedReference | null;
    openBibleReferenceMatch(match: EditorClickedReference): void;
    translate(key: "notice.pluginInactive" | "notice.noImportedTranslations" | "notice.referenceUnderCursorNotFound"): string;
};

export function openBibleReferenceUnderCursor(input: EditorReferenceOpeningInput): boolean {
    if (!input.shouldRunBiblePreviewForEditor(input.view)) {
        if (input.showNotice) {
            new Notice(input.translate("notice.pluginInactive"), 2500);
        }
        return false;
    }

    if (!input.hasImportedTranslations()) {
        if (input.showNotice) {
            new Notice(input.translate("notice.noImportedTranslations"), 2500);
        }
        return false;
    }

    const position = input.view.state.selection.main.head;
    const match = input.findBibleReferenceMatchAtPosition(input.view, position);
    if (match === null) {
        if (input.showNotice) {
            new Notice(input.translate("notice.referenceUnderCursorNotFound"), 2500);
        }
        return false;
    }

    input.openBibleReferenceMatch(match);
    return true;
}
