export type EditorPreviewStateResetInput = {
    resetParagraphCache: boolean;
    hideFloatingPreview(): void;
    setLastParagraph(paragraph: string): void;
    clearClickedReference(): void;
    incrementRequestId(): void;
};

export function hideEditorBiblePreview(input: EditorPreviewStateResetInput): void {
    input.hideFloatingPreview();
    if (!input.resetParagraphCache) {
        return;
    }

    input.setLastParagraph("");
    input.clearClickedReference();
    input.incrementRequestId();
}
