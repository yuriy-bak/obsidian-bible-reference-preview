import type { EditorView } from "@codemirror/view";
import type { BiblePreviewController } from "./BiblePreviewController";
import type { BibleReferenceLinkDecorationCacheEntry } from "./BibleReferenceLinkDecorations";

export type EditorRuntimeState = {
    readonly editorViews: Set<EditorView>;
    readonly bibleReferenceLinkDecorationCache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>;
    readonly previewControllers: Map<EditorView, BiblePreviewController>;
};

export function createEditorRuntimeState(): EditorRuntimeState {
    return {
        editorViews: new Set<EditorView>(),
        bibleReferenceLinkDecorationCache: new WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>(),
        previewControllers: new Map<EditorView, BiblePreviewController>(),
    };
}
