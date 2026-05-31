export type EditorImportedTranslationsStateInput = {
    hasImportedTranslations: boolean;
    setLastParagraph(paragraph: string): void;
    clearClickedReference(): void;
    incrementRequestId(): void;
    hideBiblePreview(): void;
};

export function handleMissingImportedTranslations(input: EditorImportedTranslationsStateInput): boolean {
    if (input.hasImportedTranslations) {
        return false;
    }

    input.setLastParagraph("");
    input.clearClickedReference();
    input.incrementRequestId();
    input.hideBiblePreview();
    return true;
}
