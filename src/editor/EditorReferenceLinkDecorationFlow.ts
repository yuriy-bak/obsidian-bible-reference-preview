import type { DecorationSet, EditorView } from "@codemirror/view";
import { clearBibleReferenceLinkDecorationsForViews, createBibleReferenceLinkDecorations, refreshBibleReferenceLinkDecorationsForViews } from "./BibleReferenceLinkDecorations";
import type { EditorRuntimeState } from "./EditorRuntimeState";

export type EditorReferenceLinkDecorationFlowInput = {
    editorRuntimeState: EditorRuntimeState;
    activeTranslationId: string | null;
    linkColor: string;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    hasImportedTranslations(): boolean;
    parseMatches(text: string): Array<{ from: number; to: number }>;
};

export function createEditorReferenceLinkDecorations(
    input: EditorReferenceLinkDecorationFlowInput,
    view: EditorView,
): DecorationSet {
    return createBibleReferenceLinkDecorations({
        view,
        activeTranslationId: input.activeTranslationId,
        linkColor: input.linkColor,
        cache: input.editorRuntimeState.bibleReferenceLinkDecorationCache,
        shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
        hasImportedTranslations: input.hasImportedTranslations,
        parseMatches: input.parseMatches,
    });
}

export function refreshEditorReferenceLinks(input: EditorReferenceLinkDecorationFlowInput): void {
    refreshBibleReferenceLinkDecorationsForViews(
        input.editorRuntimeState.editorViews,
        (view) => createEditorReferenceLinkDecorations(input, view),
    );
}

export function clearEditorReferenceLinks(input: EditorReferenceLinkDecorationFlowInput): void {
    clearBibleReferenceLinkDecorationsForViews(
        input.editorRuntimeState.editorViews,
        input.editorRuntimeState.bibleReferenceLinkDecorationCache,
    );
}
