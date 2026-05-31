import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { EditorClickedReference } from "./EditorClickedReference";

export type EditorReferencePreviewOpeningInput = {
    match: EditorClickedReference;
    setClickedReference(reference: EditorClickedReference | null): void;
    resetLastParagraph(): void;
    incrementRequestId(): number;
    getRequestId(): number;
    getClickedReferenceText(): string | null;
    analyzeReferenceText(text: string): Promise<BiblePreviewContent | null>;
    hideBiblePreview(resetParagraphCache?: boolean): void;
    showBiblePreviewContent(content: BiblePreviewContent): void;
};

export function openBibleReferenceMatchPreview(input: EditorReferencePreviewOpeningInput): void {
    input.setClickedReference(input.match);
    input.resetLastParagraph();
    const currentRequestId = input.incrementRequestId();

    void input.analyzeReferenceText(input.match.text).then((content) => {
        if (currentRequestId !== input.getRequestId() || input.getClickedReferenceText() !== input.match.text) {
            return;
        }
        if (content === null || content.plainText.length === 0) {
            input.setClickedReference(null);
            input.hideBiblePreview(true);
            return;
        }
        input.showBiblePreviewContent(content);
    });
}
