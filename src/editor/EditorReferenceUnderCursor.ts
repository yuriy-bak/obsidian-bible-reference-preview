import { Notice } from "obsidian";
import type { BibleReference } from "../domain/BibleReference";
import { findBibleReferenceMatchAtPosition, type BibleReferenceTextMatch } from "./EditorTextAnalysis";
import type { EditorRuntimeState } from "./EditorRuntimeState";
import { findFocusedEditorView } from "./EditorViewFocus";

export type EditorReferenceUnderCursorMatch = {
    text: string;
    references: BibleReference[];
};

export type EditorReferenceUnderCursorInput = {
    editorRuntimeState: EditorRuntimeState;
    showNotice: boolean;
    isPluginActive(): boolean;
    parseMatches(text: string): BibleReferenceTextMatch[];
    parseReferenceMatches(text: string): Array<{ references: BibleReference[] }>;
    translate(key: "notice.pluginInactive" | "notice.activeEditorNotFound" | "notice.referenceUnderCursorNotFound"): string;
};

export function getBibleReferenceMatchUnderCursorFromActiveEditor(
    input: EditorReferenceUnderCursorInput,
): EditorReferenceUnderCursorMatch | null {
    if (!input.isPluginActive()) {
        if (input.showNotice) new Notice(input.translate("notice.pluginInactive"), 2500);
        return null;
    }

    const focusedView = findFocusedEditorView(input.editorRuntimeState.editorViews);
    if (focusedView === null) {
        if (input.showNotice) new Notice(input.translate("notice.activeEditorNotFound"), 2500);
        return null;
    }

    const match = findBibleReferenceMatchAtPosition(
        focusedView,
        focusedView.state.selection.main.head,
        input.parseMatches,
    );
    if (match === null) {
        if (input.showNotice) new Notice(input.translate("notice.referenceUnderCursorNotFound"), 2500);
        return null;
    }

    const references = input.parseReferenceMatches(match.text).flatMap((parsedMatch) => parsedMatch.references);
    return references.length === 0 ? null : { text: match.text, references };
}
