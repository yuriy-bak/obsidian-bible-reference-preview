import type { BiblePreviewTriggerMode } from "../settings/PluginSettings";

export type EditorPreviewTriggerModeChangeInput = {
    previewTriggerMode: BiblePreviewTriggerMode;
    lastPreviewTriggerMode: BiblePreviewTriggerMode;
    setLastPreviewTriggerMode(previewTriggerMode: BiblePreviewTriggerMode): void;
    clearClickedReference(): void;
    hideBiblePreview(resetParagraphCache?: boolean): void;
};

export function applyEditorPreviewTriggerModeChange(input: EditorPreviewTriggerModeChangeInput): void {
    if (input.lastPreviewTriggerMode === input.previewTriggerMode) {
        return;
    }

    input.setLastPreviewTriggerMode(input.previewTriggerMode);
    input.clearClickedReference();
    input.hideBiblePreview(true);
}
