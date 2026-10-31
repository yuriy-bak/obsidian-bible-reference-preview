import type { BibleReference } from "../domain/BibleReference";
import type { BookMapping } from "../parsing/BookMapping";
import { findAdjacentChapter, type BibleChapterProbe, type BibleChapterTarget } from "./BibleChapterNavigation";
import type { BibleTextBlock } from "./BibleTextBlock";
import {
    concatBiblePreviewContents,
    formatBibleChapterTitle,
    toBibleChapterPreviewContent,
    type BiblePreviewComparisonBlock,
    type BiblePreviewComparisonInput,
    type BiblePreviewContent,
    type BiblePreviewPrimaryTranslation,
    type BiblePreviewReferenceBlock,
} from "./BiblePreviewModel";

export type BiblePreviewReferenceMatch = {
    text: string;
    /** In the active translation's numbering. */
    references: BibleReference[];
    /** Set by a translation code after the reference, see BibleReferenceMatch. */
    translationId?: string;
    translationReferences?: BibleReference[];
};

/** A passage shown in comparison form; `primary` puts the translation a code names first. */
type ComparisonSource = {
    title: string;
    references: BibleReference[];
    primary?: BiblePreviewPrimaryTranslation;
};

export type BiblePreviewAnalyzerInput = {
    hasImportedTranslations: () => boolean;
    getActiveTranslationId: () => string | null;
    isPreviewComparisonEnabled: () => boolean;
    parseMatches: (text: string) => BiblePreviewReferenceMatch[];
    getBibleTextBlocks: (references: BibleReference[], translationId: string, sourceText: string) => Promise<BibleTextBlock[]>;
    /** Book names of `mapping`, or of the active translation without it. */
    formatBibleTextBlocks: (blocks: BibleTextBlock[], mapping?: BookMapping) => BiblePreviewContent;
    formatBibleComparisonTextBlocks: (inputs: BiblePreviewComparisonInput[]) => BiblePreviewContent;
    getComparisonTranslationIds: () => string[];
    getTranslationPreviewTitle: (translationId: string) => string;
    getComparisonMapping: (translationId: string) => BookMapping;
    /**
     * The references in another translation's numbering scheme; the same array when both translations
     * use the same scheme.
     */
    mapReferences: (references: BibleReference[], fromTranslationId: string, toTranslationId: string) => BibleReference[];
    getBibleChapterTextBlock: (book: number, chapter: number, translationId: string) => Promise<BibleTextBlock | null>;
    /** The books in the translation's order. */
    getBookIds: (translationId: string) => number[];
    getChapterCount: (book: number, translationId: string) => number | undefined;
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

            // A reference with a translation code is shown in that translation, the others as usual, in text order.
            const contents: BiblePreviewContent[] = [];
            for (const segment of splitByPrimaryTranslation(matches, getMatchPrimaryTranslation)) {
                const content = segment.primary === undefined
                    ? await this.buildMatchesContent(segment.items, activeTranslationId)
                    : await this.buildComparisonContent([{ title: segment.items[0].text, references: segment.items[0].references, primary: segment.primary }], activeTranslationId);
                if (content !== null) contents.push(content);
            }
            return joinContents(contents);
        } catch { return null; }
    }

    private async buildMatchesContent(matches: BiblePreviewReferenceMatch[], activeTranslationId: string): Promise<BiblePreviewContent | null> {
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
            return this.buildComparisonContent(comparisonInputs, activeTranslationId);
        }

        return standardContent;
    }

    /** A whole chapter of one translation (the active one by default), in its numbering: the Bible reader shows no comparison. */
    public async buildChapterContent(target: BibleChapterTarget, translationId?: string): Promise<BiblePreviewContent | null> {
        const chapterTranslationId = translationId ?? this.input.getActiveTranslationId();
        if (chapterTranslationId === null) {
            return null;
        }

        const chapterBlock = await this.input.getBibleChapterTextBlock(target.book, target.chapter, chapterTranslationId);
        if (chapterBlock === null) {
            return null;
        }

        const location = { book: target.book, chapter: target.chapter };
        const probe: BibleChapterProbe = {
            getBookIds: () => this.input.getBookIds(chapterTranslationId),
            getChapterCount: (book) => this.input.getChapterCount(book, chapterTranslationId),
            hasChapter: async (book, chapter) => await this.input.getBibleChapterTextBlock(book, chapter, chapterTranslationId) !== null,
        };
        const [previous, next] = await Promise.all([
            findAdjacentChapter(location, -1, probe),
            findAdjacentChapter(location, 1, probe),
        ]);
        const mapping = this.input.getComparisonMapping(chapterTranslationId);
        const chapterView = {
            book: target.book,
            chapter: target.chapter,
            highlightedRanges: target.highlightedRanges,
            translationId: chapterTranslationId,
            title: formatBibleChapterTitle(location, mapping),
            previous,
            next,
        };

        const content = this.input.formatBibleTextBlocks([chapterBlock], mapping);

        return content.plainText.length === 0 ? null : toBibleChapterPreviewContent(content, chapterView);
    }

    public async rebuildContent(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        const activeTranslationId = this.input.getActiveTranslationId();
        if (activeTranslationId === null) {
            return null;
        }

        const previewReferenceBlocks = this.getPreviewReferenceBlocks(content);
        if (previewReferenceBlocks.length === 0) {
            return null;
        }

        const contents: BiblePreviewContent[] = [];
        for (const segment of splitByPrimaryTranslation(previewReferenceBlocks, (block) => block.type === "comparison" ? block.primary : undefined)) {
            const segmentContent = segment.primary === undefined
                ? await this.rebuildBlocks(segment.items, activeTranslationId)
                : await this.buildComparisonContent([{ ...segment.items[0], primary: segment.primary }], activeTranslationId);
            if (segmentContent !== null) contents.push(segmentContent);
        }
        return joinContents(contents);
    }

    private async rebuildBlocks(previewReferenceBlocks: (BiblePreviewReferenceBlock | BiblePreviewComparisonBlock)[], activeTranslationId: string): Promise<BiblePreviewContent | null> {
        if (this.input.isPreviewComparisonEnabled()) {
            return this.buildComparisonContent(previewReferenceBlocks, activeTranslationId);
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

    private async buildComparisonContent(sources: ComparisonSource[], activeTranslationId: string): Promise<BiblePreviewContent | null> {
        const comparisonInputs = await Promise.all(sources.map(async (source): Promise<BiblePreviewComparisonInput> => ({
            title: source.title,
            references: source.references,
            translations: await this.getComparisonTranslationInputs(source, activeTranslationId),
            ...(source.primary === undefined ? {} : { primary: source.primary }),
        })));
        const comparisonContent = this.input.formatBibleComparisonTextBlocks(comparisonInputs);
        return comparisonContent.plainText.length === 0 ? null : comparisonContent;
    }

    // References in notes follow the numbering of the active translation; each compared translation
    // shows the same passage in its own numbering. A reference with a translation code is read in that
    // translation's numbering and shows it first; without comparison, it shows only that translation.
    private async getComparisonTranslationInputs(source: ComparisonSource, activeTranslationId: string): Promise<BiblePreviewComparisonInput["translations"]> {
        const comparisonTranslationIds = this.isComparisonShown() ? this.input.getComparisonTranslationIds() : [];
        const primary = source.primary;
        const translationIds = primary === undefined
            ? comparisonTranslationIds
            : [primary.translationId, ...comparisonTranslationIds.filter((translationId) => translationId !== primary.translationId)];
        const mainTranslationId = primary?.translationId ?? this.getMainComparisonTranslationId(translationIds);
        const fromTranslationId = primary?.translationId ?? activeTranslationId;
        const references = primary?.references ?? source.references;
        return Promise.all(translationIds.map(async (translationId) => {
            const translationReferences = this.input.mapReferences(references, fromTranslationId, translationId);
            return {
                translationId,
                translationName: this.input.getTranslationPreviewTitle(translationId),
                isMain: translationId === mainTranslationId,
                blocks: await this.input.getBibleTextBlocks(translationReferences, translationId, source.title),
                mapping: this.input.getComparisonMapping(translationId),
                references: translationReferences === source.references ? undefined : translationReferences,
            };
        }));
    }

    private isComparisonShown(): boolean {
        return this.input.isPreviewComparisonEnabled();
    }

    // The active translation is the main one; if it is not compared, the first compared translation is.
    private getMainComparisonTranslationId(translationIds: string[]): string | undefined {
        const activeTranslationId = this.input.getActiveTranslationId();
        return activeTranslationId !== null && translationIds.includes(activeTranslationId)
            ? activeTranslationId
            : translationIds[0];
    }
}

function getMatchPrimaryTranslation(match: BiblePreviewReferenceMatch): BiblePreviewPrimaryTranslation | undefined {
    return match.translationId === undefined || match.translationReferences === undefined
        ? undefined
        : { translationId: match.translationId, references: match.translationReferences };
}

/** Runs of items without a primary translation, and each item with one on its own, in order. */
function splitByPrimaryTranslation<T>(
    items: T[],
    getPrimary: (item: T) => BiblePreviewPrimaryTranslation | undefined,
): { items: T[]; primary?: BiblePreviewPrimaryTranslation }[] {
    const segments: { items: T[]; primary?: BiblePreviewPrimaryTranslation }[] = [];
    for (const item of items) {
        const primary = getPrimary(item);
        const last = segments[segments.length - 1];
        if (primary === undefined && last !== undefined && last.primary === undefined) {
            last.items.push(item);
        } else {
            segments.push(primary === undefined ? { items: [item] } : { items: [item], primary });
        }
    }
    return segments;
}

function joinContents(contents: BiblePreviewContent[]): BiblePreviewContent | null {
    if (contents.length === 0) return null;
    // A single content is returned as built, so references without codes keep their preview unchanged.
    return contents.length === 1 ? contents[0] : concatBiblePreviewContents(contents);
}
