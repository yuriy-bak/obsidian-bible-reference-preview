import type { EditorView } from "@codemirror/view";
import { clearBibleReferenceLinkDecorations } from "./BibleReferenceLinkDecorations";
import { clearEditorReferenceLinkUpdateTimeout } from "./EditorReferenceLinkUpdateTimeout";

export type EditorRuntimeEnabledChangeInput = {
    view: EditorView;
    pluginRuntimeEnabled: boolean;
    lastPluginRuntimeEnabled: boolean;
    referenceLinkUpdateTimeout: number | null;
    setLastPluginRuntimeEnabled(enabled: boolean): void;
    setLastParagraph(paragraph: string): void;
    clearClickedReference(): void;
    incrementRequestId(): void;
    setReferenceLinkUpdateTimeout(timeout: number | null): void;
    hideBiblePreview(resetParagraphCache?: boolean): void;
    scheduleReferenceLinkUpdate(): void;
};

export function applyEditorRuntimeEnabledChange(input: EditorRuntimeEnabledChangeInput): void {
    if (input.lastPluginRuntimeEnabled === input.pluginRuntimeEnabled) {
        return;
    }

    input.setLastPluginRuntimeEnabled(input.pluginRuntimeEnabled);
    input.setLastParagraph("");
    input.clearClickedReference();
    input.incrementRequestId();

    clearEditorReferenceLinkUpdateTimeout(input.referenceLinkUpdateTimeout, input.setReferenceLinkUpdateTimeout);

    if (!input.pluginRuntimeEnabled) {
        input.hideBiblePreview(true);
        clearBibleReferenceLinkDecorations(input.view);
        return;
    }

    input.scheduleReferenceLinkUpdate();
}
