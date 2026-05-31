import type { BibleReference } from "../domain/BibleReference";
import type { BookMapping } from "../parsing/BookMapping";
import type { BibleTextBlock } from "./BibleTextBlock";
import type {
    BiblePreviewComparisonBlock,
    BiblePreviewComparisonInput,
    BiblePreviewContent,
    BiblePreviewReferenceBlock,
} from "./formatBibleTexts";

export type BiblePreviewReferenceMatch = {
    text: string;
    references: BibleReference[];
};

export type BiblePreviewAnalyzerInput = {
    hasImportedTranslations(): boolean;
    getActiveTranslationId(): string | null;
    isPreviewComparisonEnabled(): boolean;
    parseMatches(text: string): BiblePreviewReferenceMatch[];
    getBibleTextBlocks(references: BibleReference[], translationId: string, sourceText: string): Promise<BibleTextBlock[]>;
    formatBibleTextBlocks(blocks: BibleTextBlock[]): BiblePreviewContent;
    formatBibleComparisonTextBlocks(inputs: BiblePreviewComparisonInput[]): BiblePreviewContent;
    getComparisonTranslationIds(): string[];
    getTranslationPreviewTitle(translationId: string): string;
    getComparisonMapping(translationId: string): BookMapping;
};

export class BiblePreviewAnalyzer {
    constructor(private readonly input: BiblePreviewAnalyzerInput) {}

    public async analyzeParagraph(text: string): Promise<BiblePreviewContent | null> {
        try {
            const activeTranslationId = this.input.getActiveTranslationId();
            if (!this.input.hasImportedTranslations() || activeTranslationId === null) {
                return null;
            }

            const matches = this.input.parseMatches(text);
            if (matches.length === 0) return null;
            if (this.input.isPreviewComparisonEnabled()) {
                const comparisonInputs = await Promise.all(matches.map(async (match): Promise<BiblePreviewComparisonInput> => ({
                    title: match.text,
                    references: match.references,
                    translations: await this.getComparisonTranslationInputs(match.references, match.text),
                })));
                const content = this.input.formatBibleComparisonTextBlocks(comparisonInputs);
                return content.plainText.length === 0 ? null : content;
            }

            const bibleTextBlocks = (await Promise.all(matches.map((match) =>
                this.input.getBibleTextBlocks(match.references, activeTranslationId, match.text),
            ))).flat();
            if (bibleTextBlocks.length === 0) return null;
            const content = this.input.formatBibleTextBlocks(bibleTextBlocks);
            return content.plainText.length === 0 ? null : content;
        } catch { return null; }
    }

    public async rebuildContent(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        const activeTranslationId = this.input.getActiveTranslationId();
        if (activeTranslationId === null) {
            return null;
        }

        const previewReferenceBlocks = content.blocks.filter((block): block is BiblePreviewReferenceBlock | BiblePreviewComparisonBlock =>
            block.type === "reference" || block.type === "comparison",
        );
        if (previewReferenceBlocks.length === 0) {
            return null;
        }

        if (this.input.isPreviewComparisonEnabled()) {
            const comparisonInputs = await Promise.all(previewReferenceBlocks.map(async (block): Promise<BiblePreviewComparisonInput> => ({
                title: block.title,
                references: block.references,
                translations: await this.getComparisonTranslationInputs(block.references, block.title),
            })));
            const comparisonContent = this.input.formatBibleComparisonTextBlocks(comparisonInputs);
            return comparisonContent.plainText.length === 0 ? null : comparisonContent;
        }

        const bibleTextBlocks = (await Promise.all(previewReferenceBlocks.map((block) =>
            this.input.getBibleTextBlocks(block.references, activeTranslationId, block.title),
        ))).flat();
        if (bibleTextBlocks.length === 0) return null;
        const standardContent = this.input.formatBibleTextBlocks(bibleTextBlocks);
        return standardContent.plainText.length === 0 ? null : standardContent;
    }

    private async getComparisonTranslationInputs(references: BiblePreviewReferenceBlock["references"], sourceText: string): Promise<BiblePreviewComparisonInput["translations"]> {
        const translationIds = this.input.getComparisonTranslationIds();
        return Promise.all(translationIds.map(async (translationId) => ({
            translationName: this.input.getTranslationPreviewTitle(translationId),
            blocks: await this.input.getBibleTextBlocks(references, translationId, sourceText),
            mapping: this.input.getComparisonMapping(translationId),
        })));
    }
}
