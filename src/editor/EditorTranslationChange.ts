export type EditorTranslationChangeInput = {
    activeTranslationId: string | null;
    lastActiveTranslationId: string | null;
    setLastActiveTranslationId(activeTranslationId: string | null): void;
    setLastParagraph(paragraph: string): void;
    clearClickedReference(): void;
    incrementRequestId(): void;
    refreshFloatingPreviewLabels(): void;
    scheduleReferenceLinkUpdate(): void;
};

export function applyEditorTranslationChange(input: EditorTranslationChangeInput): void {
    if (input.lastActiveTranslationId === input.activeTranslationId) {
        return;
    }

    input.setLastActiveTranslationId(input.activeTranslationId);
    input.setLastParagraph("");
    input.clearClickedReference();
    input.incrementRequestId();
    input.refreshFloatingPreviewLabels();
    input.scheduleReferenceLinkUpdate();
}
