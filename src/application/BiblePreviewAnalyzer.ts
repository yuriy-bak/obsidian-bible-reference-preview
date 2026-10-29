import type { BibleReference } from "../domain/BibleReference";
import type { BookMapping } from "../parsing/BookMapping";
import { findAdjacentChapter, type BibleChapterProbe, type BibleChapterTarget } from "./BibleChapterNavigation";
import type { BibleTextBlock } from "./BibleTextBlock";
import {
    formatBibleChapterTitle,
    toBibleChapterPreviewContent,
    type BiblePreviewComparisonBlock,
    type BiblePreviewComparisonInput,
    type BiblePreviewContent,
    type BiblePreviewReferenceBlock,
} from "./BiblePreviewModel";

export type BiblePreviewReferenceMatch = {
    text: string;
    references: BibleReference[];
};

export type BiblePreviewAnalyzerInput = {
    hasImportedTranslations: () => boolean;
    getActiveTranslationId: () => string | null;
    isPreviewComparisonEnabled: () => boolean;
    parseMatches: (text: string) => BiblePreviewReferenceMatch[];
    getBibleTextBlocks: (references: BibleReference[], translationId: string, sourceText: string) => Promise<BibleTextBlock[]>;
    formatBibleTextBlocks: (blocks: BibleTextBlock[]) => BiblePreviewContent;
    formatBibleComparisonTextBlocks: (inputs: BiblePreviewComparisonInput[]) => BiblePreviewContent;
    getComparisonTranslationIds: () => string[];
    getTranslationPreviewTitle: (translationId: string) => string;
    getComparisonMapping: (translationId: string) => BookMapping;
    getBibleChapterTextBlock: (book: number, chapter: number, translationId: string) => Promise<BibleTextBlock | null>;
    getBookIds: () => number[];
    getChapterCount: (book: number) => number | undefined;
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

            const bibleTextBlocks = (await Promise.all(matches.map((match) =>
                this.input.getBibleTextBlocks(match.references, activeTranslationId, match.text),
            ))).flat();
            const content = bibleTextBlocks.length === 0 ? null : this.input.formatBibleTextBlocks(bibleTextBlocks);
            const standardContent = content === null || content.plainText.length === 0 ? null : content;

            if (this.input.isPreviewComparisonEnabled()) {
                // Split by chapters the same way the standard preview does, so a reference like
                // "Judg 7:22; 8:23" gets a separate comparison block per chapter.
                const referenceBlocks = standardContent === null ? [] : this.getPreviewReferenceBlocks(standardContent);
                const comparisonInputs = referenceBlocks.length > 0
                    ? referenceBlocks.map((block) => ({ title: block.title, references: block.references }))
                    : matches.map((match) => ({ title: match.text, references: match.references }));
                return this.buildComparisonContent(comparisonInputs);
            }

            return standardContent;
        } catch { return null; }
    }

    public async buildChapterContent(target: BibleChapterTarget): Promise<BiblePreviewContent | null> {
        const activeTranslationId = this.input.getActiveTranslationId();
        if (activeTranslationId === null) {
            return null;
        }

        const activeBlock = await this.input.getBibleChapterTextBlock(target.book, target.chapter, activeTranslationId);
        if (activeBlock === null) {
            return null;
        }

        const location = { book: target.book, chapter: target.chapter };
        const probe: BibleChapterProbe = {
            getBookIds: this.input.getBookIds,
            getChapterCount: this.input.getChapterCount,
            hasChapter: async (book, chapter) => await this.input.getBibleChapterTextBlock(book, chapter, activeTranslationId) !== null,
        };
        const [previous, next] = await Promise.all([
            findAdjacentChapter(location, -1, probe),
            findAdjacentChapter(location, 1, probe),
        ]);
        const chapterView = {
            book: target.book,
            chapter: target.chapter,
            highlightedRanges: target.highlightedRanges,
            title: formatBibleChapterTitle(location, this.input.getComparisonMapping(activeTranslationId)),
            previous,
            next,
        };

        const content = this.input.isPreviewComparisonEnabled()
            ? this.input.formatBibleComparisonTextBlocks([{
                title: chapterView.title,
                references: [activeBlock.reference],
                translations: await this.getComparisonChapterTranslationInputs(target, activeTranslationId),
                formatReferenceTitle: (mapping) => formatBibleChapterTitle(location, mapping),
            }])
            : this.input.formatBibleTextBlocks([activeBlock]);

        return content.plainText.length === 0 ? null : toBibleChapterPreviewContent(content, chapterView);
    }

    public async rebuildContent(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        if (content.chapterView !== undefined) {
            return this.buildChapterContent(content.chapterView);
        }

        const activeTranslationId = this.input.getActiveTranslationId();
        if (activeTranslationId === null) {
            return null;
        }

        const previewReferenceBlocks = this.getPreviewReferenceBlocks(content);
        if (previewReferenceBlocks.length === 0) {
            return null;
        }

        if (this.input.isPreviewComparisonEnabled()) {
            return this.buildComparisonContent(previewReferenceBlocks);
        }

        const bibleTextBlocks = (await Promise.all(previewReferenceBlocks.map((block) =>
            this.input.getBibleTextBlocks(block.references, activeTranslationId, block.title),
        ))).flat();
        if (bibleTextBlocks.length === 0) return null;
        const standardContent = this.input.formatBibleTextBlocks(bibleTextBlocks);
        return standardContent.plainText.length === 0 ? null : standardContent;
    }

    private getPreviewReferenceBlocks(content: BiblePreviewContent): (BiblePreviewReferenceBlock | BiblePreviewComparisonBlock)[] {
        return content.blocks.filter((block): block is BiblePreviewReferenceBlock | BiblePreviewComparisonBlock =>
            block.type === "reference" || block.type === "comparison",
        );
    }

    private async buildComparisonContent(blocks: { title: string; references: BibleReference[] }[]): Promise<BiblePreviewContent | null> {
        const comparisonInputs = await Promise.all(blocks.map(async (block): Promise<BiblePreviewComparisonInput> => ({
            title: block.title,
            references: block.references,
            translations: await this.getComparisonTranslationInputs(block.references, block.title),
        })));
        const comparisonContent = this.input.formatBibleComparisonTextBlocks(comparisonInputs);
        return comparisonContent.plainText.length === 0 ? null : comparisonContent;
    }

    private async getComparisonTranslationInputs(references: BiblePreviewReferenceBlock["references"], sourceText: string): Promise<BiblePreviewComparisonInput["translations"]> {
        const translationIds = this.input.getComparisonTranslationIds();
        const mainTranslationId = this.getMainComparisonTranslationId(translationIds);
        return Promise.all(translationIds.map(async (translationId) => ({
            translationName: this.input.getTranslationPreviewTitle(translationId),
            isMain: translationId === mainTranslationId,
            blocks: await this.input.getBibleTextBlocks(references, translationId, sourceText),
            mapping: this.input.getComparisonMapping(translationId),
        })));
    }

    private async getComparisonChapterTranslationInputs(target: BibleChapterTarget, activeTranslationId: string): Promise<BiblePreviewComparisonInput["translations"]> {
        const translationIds = this.input.getComparisonTranslationIds();
        return Promise.all(translationIds.map(async (translationId) => {
            const block = await this.input.getBibleChapterTextBlock(target.book, target.chapter, translationId);
            return {
                translationName: this.input.getTranslationPreviewTitle(translationId),
                isMain: translationId === activeTranslationId,
                blocks: block === null ? [] : [block],
                mapping: this.input.getComparisonMapping(translationId),
            };
        }));
    }

    // The active translation is the main one; if it is not compared, the first compared translation is.
    private getMainComparisonTranslationId(translationIds: string[]): string | undefined {
        const activeTranslationId = this.input.getActiveTranslationId();
        return activeTranslationId !== null && translationIds.includes(activeTranslationId)
            ? activeTranslationId
            : translationIds[0];
    }
}
