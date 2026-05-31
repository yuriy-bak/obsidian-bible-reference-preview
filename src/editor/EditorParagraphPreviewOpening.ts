import type { BiblePreviewContent } from "../application/formatBibleTexts";

export type EditorParagraphPreviewOpeningInput = {
    paragraph: string;
    getLastParagraph(): string;
    setLastParagraph(paragraph: string): void;
    incrementRequestId(): number;
    getRequestId(): number;
    analyzeParagraph(text: string): Promise<BiblePreviewContent | null>;
    hideBiblePreview(): void;
    showBiblePreviewContent(content: BiblePreviewContent): void;
};

export function openCurrentParagraphPreview(input: EditorParagraphPreviewOpeningInput): void {
    const paragraph = input.paragraph;
    if (paragraph === input.getLastParagraph()) {
        return;
    }

    input.setLastParagraph(paragraph);
    const currentRequestId = input.incrementRequestId();
    if (!paragraph) {
        input.hideBiblePreview();
        return;
    }

    void input.analyzeParagraph(paragraph).then((content) => {
        if (currentRequestId !== input.getRequestId() || paragraph !== input.getLastParagraph()) {
            return;
        }
        if (content === null || content.plainText.length === 0) {
            input.hideBiblePreview();
            return;
        }
        input.showBiblePreviewContent(content);
    });
}
