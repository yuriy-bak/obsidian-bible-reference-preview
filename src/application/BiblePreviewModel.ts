// Preview content as data (blocks, titles, plain text); the DOM is built by ui/BiblePreviewRenderer.
import { BibleReference } from "../domain/BibleReference";
import { Verse } from "../domain/BibleText";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";
import { BookMapping } from "../parsing/BookMapping";
import { formatBibleReference } from "../parsing/formatBibleReference";
import { BibleChapterLocation, BibleChapterTarget, isVerseInRanges } from "./BibleChapterNavigation";
import { BibleTextBlock, BibleTextPart } from "./BibleTextBlock";

const DEFAULT_MISSING_VERSE_TEXT = "[стих не найден]";
export const BOOK_ICON = "📖";
const DIFFERENT_BOOK_SEPARATOR = "__________";

export type BiblePreviewContent = {
    plainText: string;
    blocks: BiblePreviewBlock[];
    chapterView?: BiblePreviewChapterView;
    // Scroll position to restore when this content is shown again (e.g. after "Back").
    scrollTop?: number;
};

export type BiblePreviewChapterView = BibleChapterTarget & {
    title: string;
    previous: BibleChapterLocation | null;
    next: BibleChapterLocation | null;
};

export type BiblePreviewReferenceBlock = {
    type: "reference";
    title: string;
    references: BibleReference[];
    paragraphs: BiblePreviewParagraph[];
};

// What a find-usages action needs; both reference and comparison blocks provide it.
export type BiblePreviewUsageTarget = {
    title: string;
    references: BibleReference[];
};

export type BiblePreviewComparisonTranslation = {
    translationName: string;
    isMain?: boolean;
    referenceTitle: string;
    paragraphs: BiblePreviewParagraph[];
    footnotes: string[];
};

export type BiblePreviewComparisonBlock = {
    type: "comparison";
    title: string;
    references: BibleReference[];
    translations: BiblePreviewComparisonTranslation[];
};

export type BiblePreviewBlock =
    | BiblePreviewReferenceBlock
    | BiblePreviewComparisonBlock
    | {
        type: "footnote";
        text: string;
    }
    | {
        type: "separator";
        text: typeof DIFFERENT_BOOK_SEPARATOR;
    };

export type BiblePreviewComparisonInput = {
    title: string;
    references: BibleReference[];
    translations: {
        translationName: string;
        isMain?: boolean;
        blocks: BibleTextBlock[];
        mapping: BookMapping;
        /** The passage in this translation's numbering, when it differs from `references`; titles the translation. */
        references?: BibleReference[];
    }[];
    formatReferenceTitle?: (mapping: BookMapping) => string;
};

export function formatBibleComparisonTextBlocks(
    inputs: BiblePreviewComparisonInput[],
    missingVerseText = DEFAULT_MISSING_VERSE_TEXT,
): BiblePreviewContent {
    const previewBlocks: BiblePreviewBlock[] = [];

    for (const input of inputs) {
        const translations = input.translations
            .map((translation) => {
                const content = formatBibleTextBlocks(translation.blocks, translation.mapping, missingVerseText);
                return {
                    translationName: translation.translationName,
                    isMain: translation.isMain,
                    referenceTitle: translation.references !== undefined
                        ? formatComparisonReferenceTitle(translation.references, translation.mapping)
                        : input.formatReferenceTitle?.(translation.mapping)
                            ?? formatComparisonReferenceTitle(input.references, translation.mapping),
                    paragraphs: content.blocks
                        .filter((block): block is BiblePreviewReferenceBlock => block.type === "reference")
                        .flatMap((block) => block.paragraphs),
                    footnotes: content.blocks
                        .filter((block): block is Extract<BiblePreviewBlock, { type: "footnote" }> => block.type === "footnote")
                        .map((block) => block.text),
                };
            })
            .filter((translation) => translation.paragraphs.length > 0);

        if (translations.length === 0) {
            continue;
        }

        previewBlocks.push({
            type: "comparison",
            title: formatSourceReferenceTitle(input.title),
            references: input.references,
            translations,
        });
    }

    return {
        blocks: previewBlocks,
        plainText: buildPlainText(previewBlocks),
    };
}

export type BiblePreviewParagraph = {
    verses: BiblePreviewVerse[];
};

export type BiblePreviewVerse = {
    number: number;
    text: string;
    highlighted?: boolean;
};

type BuiltReferenceBlock = {
    book: number;
    block: BiblePreviewReferenceBlock;
    footnotes: string[];
};

export function formatBibleTextBlocks(
    blocks: BibleTextBlock[],
    mapping: BookMapping,
    missingVerseText = DEFAULT_MISSING_VERSE_TEXT,
): BiblePreviewContent {
    const previewBlocks: BiblePreviewBlock[] = [];
    let currentBook: number | null = null;
    let pendingReferenceBlocks: BiblePreviewReferenceBlock[] = [];
    let pendingFootnotes: string[] = [];

    const flushCurrentBookGroup = (): void => {
        if (currentBook === null) {
            return;
        }

        previewBlocks.push(...pendingReferenceBlocks);
        for (const footnote of pendingFootnotes) {
            previewBlocks.push({ type: "footnote", text: footnote });
        }

        pendingReferenceBlocks = [];
        pendingFootnotes = [];
    };

    for (const group of groupSourceTextBlocks(blocks)) {
        const builtGroup = buildSourceTextGroup(group, mapping, missingVerseText);
        if (builtGroup.length === 0) {
            continue;
        }

        const groupBook = builtGroup[0].book;
        if (currentBook !== null && currentBook !== groupBook) {
            flushCurrentBookGroup();
            previewBlocks.push({ type: "separator", text: DIFFERENT_BOOK_SEPARATOR });
        }

        currentBook = groupBook;
        pendingReferenceBlocks.push(...builtGroup.map((item) => item.block));
        pendingFootnotes.push(...builtGroup.flatMap((item) => item.footnotes));
    }

    flushCurrentBookGroup();

    return {
        blocks: previewBlocks,
        plainText: buildPlainText(previewBlocks),
    };
}

export function formatBibleChapterTitle(location: BibleChapterLocation, mapping: BookMapping): string {
    const bookName = mapping.idToDisplayName.get(location.book) ?? String(location.book);
    return mapping.oneChapterBooks.has(location.book)
        ? `${BOOK_ICON} ${bookName}`
        : `${BOOK_ICON} ${bookName} ${location.chapter}`;
}

export function toBibleChapterPreviewContent(content: BiblePreviewContent, chapterView: BiblePreviewChapterView): BiblePreviewContent {
    const highlightParagraphs = (paragraphs: BiblePreviewParagraph[]): BiblePreviewParagraph[] => paragraphs.map((paragraph) => ({
        verses: paragraph.verses.map((verse) => ({
            ...verse,
            highlighted: verse.highlighted ?? isVerseInRanges(verse.number, chapterView.highlightedRanges),
        })),
    }));

    const blocks = content.blocks.map((block): BiblePreviewBlock => {
        if (block.type === "reference") {
            return { ...block, title: chapterView.title, paragraphs: highlightParagraphs(block.paragraphs) };
        }
        if (block.type === "comparison") {
            return {
                ...block,
                title: chapterView.title,
                translations: block.translations.map((translation) => ({
                    ...translation,
                    paragraphs: highlightParagraphs(translation.paragraphs),
                })),
            };
        }
        return block;
    });

    return {
        blocks,
        plainText: buildPlainText(blocks),
        chapterView,
    };
}

function groupSourceTextBlocks(blocks: BibleTextBlock[]): BibleTextBlock[][] {
    const groups: BibleTextBlock[][] = [];

    for (const block of blocks) {
        const previousGroup = groups[groups.length - 1];
        const previousBlock = previousGroup?.[previousGroup.length - 1];

        if (
            previousGroup !== undefined
            && previousBlock !== undefined
            && previousBlock.reference.book === block.reference.book
            && previousBlock.sourceText !== undefined
            && previousBlock.sourceText === block.sourceText
        ) {
            previousGroup.push(block);
            continue;
        }

        groups.push([block]);
    }

    return groups;
}

function buildSourceTextGroup(
    blocks: BibleTextBlock[],
    mapping: BookMapping,
    missingVerseText: string,
): BuiltReferenceBlock[] {
    const sourceText = blocks[0]?.sourceText;

    if (sourceText !== undefined && canShowUnderSingleSourceTitle(blocks)) {
        const builtBlocks = blocks.flatMap((block) => buildReferenceBlocks(block, mapping, missingVerseText, false));
        if (builtBlocks.length === 0) {
            return [];
        }

        return [
            {
                book: builtBlocks[0].book,
                block: {
                    type: "reference",
                    title: formatSourceReferenceTitle(sourceText),
                    references: builtBlocks.flatMap((item) => item.block.references),
                    paragraphs: builtBlocks.flatMap((item) => item.block.paragraphs),
                },
                footnotes: builtBlocks.flatMap((item) => item.footnotes),
            },
        ];
    }

    const builtBlocks = blocks.flatMap((block) => buildReferenceBlocks(block, mapping, missingVerseText, false));
    const groupedBlocks: BuiltReferenceBlock[] = [];

    for (const builtBlock of builtBlocks) {
        const previousBlock = groupedBlocks[groupedBlocks.length - 1];
        if (previousBlock !== undefined && canMergeBuiltReferenceBlocksByChapter(previousBlock, builtBlock)) {
            groupedBlocks[groupedBlocks.length - 1] = mergeBuiltReferenceBlocksByChapter(previousBlock, builtBlock, mapping);
            continue;
        }

        groupedBlocks.push(builtBlock);
    }

    return groupedBlocks;
}

function canMergeBuiltReferenceBlocksByChapter(left: BuiltReferenceBlock, right: BuiltReferenceBlock): boolean {
    const leftReference = left.block.references[0];
    const rightReference = right.block.references[0];

    return leftReference !== undefined
        && rightReference !== undefined
        && leftReference.book === rightReference.book
        && leftReference.chapterStart === leftReference.chapterEnd
        && rightReference.chapterStart === rightReference.chapterEnd
        && leftReference.chapterStart === rightReference.chapterStart;
}

function mergeBuiltReferenceBlocksByChapter(
    left: BuiltReferenceBlock,
    right: BuiltReferenceBlock,
    mapping: BookMapping,
): BuiltReferenceBlock {
    const references = [...left.block.references, ...right.block.references];

    return {
        book: left.book,
        block: {
            type: "reference",
            title: formatChapterReferenceGroupTitle(references, mapping),
            references,
            paragraphs: [...left.block.paragraphs, ...right.block.paragraphs],
        },
        footnotes: [...left.footnotes, ...right.footnotes],
    };
}

function formatChapterReferenceGroupTitle(references: BibleReference[], mapping: BookMapping): string {
    const firstReference = references[0];
    if (firstReference === undefined) {
        return "";
    }

    if (references.length === 1) {
        return formatBibleReference(firstReference, mapping);
    }

    const verseSegments = references.slice(1).map((reference) => formatReferenceVerseSegment(reference));
    return `${formatBibleReference(firstReference, mapping)}, ${verseSegments.join(", ")}`;
}

function formatReferenceVerseSegment(reference: BibleReference): string {
    if (reference.verseEnd !== undefined && reference.verseEnd !== reference.verseStart) {
        return `${reference.verseStart}-${reference.verseEnd}`;
    }

    return `${reference.verseStart}`;
}

function canShowUnderSingleSourceTitle(blocks: BibleTextBlock[]): boolean {
    if (blocks.length <= 1) {
        return false;
    }

    const first = blocks[0];
    return first.sourceText !== undefined
        && blocks.every((block) => block.reference.book === first.reference.book
            && block.reference.chapterStart === first.reference.chapterStart
            && block.reference.chapterEnd === first.reference.chapterStart
            && block.parts.length === 1
            && block.parts[0]?.range.chapter === first.reference.chapterStart);
}

function buildReferenceBlocks(
    block: BibleTextBlock,
    mapping: BookMapping,
    missingVerseText: string,
    useSourceTitle: boolean,
): BuiltReferenceBlock[] {
    if (block.parts.length <= 1) {
        const built = buildSingleChapterBlock(block, mapping, missingVerseText, useSourceTitle);
        return built === null ? [] : [built];
    }

    return block.parts
        .map((part) => buildPartReferenceBlock(block.reference, part, mapping, missingVerseText, block.highlightedReferences))
        .filter((block): block is BuiltReferenceBlock => block !== null);
}

function buildSingleChapterBlock(
    block: BibleTextBlock,
    mapping: BookMapping,
    missingVerseText: string,
    useSourceTitle: boolean,
): BuiltReferenceBlock | null {
    const part = block.parts[0];
    if (part === undefined) {
        return null;
    }

    const paragraphs = formatPartParagraphs(part, missingVerseText, block.highlightedReferences);
    if (paragraphs.length === 0) {
        return null;
    }

    return {
        book: block.reference.book,
        block: {
            type: "reference",
            title: useSourceTitle && block.sourceText !== undefined
                ? formatSourceReferenceTitle(block.sourceText)
                : formatBibleReference(createReferenceForPart(block.reference, part), mapping),
            references: [block.reference],
            paragraphs,
        },
        footnotes: collectPartFootnotes(part, mapping),
    };
}

function buildPartReferenceBlock(
    reference: BibleReference,
    part: BibleTextPart,
    mapping: BookMapping,
    missingVerseText: string,
    highlightedReferences?: BibleReference[],
): BuiltReferenceBlock | null {
    const paragraphs = formatPartParagraphs(part, missingVerseText, highlightedReferences);
    if (paragraphs.length === 0) {
        return null;
    }

    return {
        book: reference.book,
        block: {
            type: "reference",
            title: formatBibleReference(createReferenceForPart(reference, part), mapping),
            references: [createReferenceForPart(reference, part)],
            paragraphs,
        },
        footnotes: collectPartFootnotes(part, mapping),
    };
}

function createReferenceForPart(reference: BibleReference, part: BibleTextPart): BibleReference {
    return {
        book: reference.book,
        chapterStart: part.range.chapter,
        verseStart: part.range.verseStart,
        chapterEnd: part.range.chapter,
        verseEnd: part.range.verseEnd ?? getLastVerseNumber(part),
    };
}

function getLastVerseNumber(part: BibleTextPart): number {
    const verseNumbers = getVerseNumbersToShow(part);
    return verseNumbers[verseNumbers.length - 1] ?? part.range.verseStart;
}

function formatPartParagraphs(part: BibleTextPart, missingVerseText: string, highlightedReferences?: BibleReference[]): BiblePreviewParagraph[] {
    const versesByNumber = new Map<number, Verse>();
    for (const verse of part.bibleText?.verses ?? []) {
        versesByNumber.set(verse.number, verse);
    }

    const paragraphs: BiblePreviewParagraph[] = [];
    for (const verseNumber of getVerseNumbersToShow(part)) {
        const verse = versesByNumber.get(verseNumber);
        const previewVerse: BiblePreviewVerse = verse === undefined
            ? { number: verseNumber, text: missingVerseText }
            : { number: verse.number, text: verse.text };
        if (highlightedReferences !== undefined) {
            previewVerse.highlighted = highlightedReferences.some((reference) => isVerseInReference(reference, part.range.chapter, verseNumber));
        }

        if (paragraphs.length === 0 || verse === undefined || verse.paragraphStart !== false) {
            paragraphs.push({ verses: [previewVerse] });
        } else {
            paragraphs[paragraphs.length - 1].verses.push(previewVerse);
        }
    }

    return paragraphs;
}

function isVerseInReference(reference: BibleReference, chapter: number, verse: number): boolean {
    const afterStart = chapter > reference.chapterStart || (chapter === reference.chapterStart && verse >= reference.verseStart);
    const beforeEnd = chapter < reference.chapterEnd || (chapter === reference.chapterEnd && verse <= reference.verseEnd);
    return afterStart && beforeEnd;
}

function getVerseNumbersToShow(part: BibleTextPart): number[] {
    if (part.range.verseEnd !== undefined) {
        // Missing verses inside the chapter stay visible as gaps; nothing is shown past its last verse.
        const lastVerse = Math.max(0, ...(part.bibleText?.verses ?? []).map((verse) => verse.number));
        return createNumberRange(part.range.verseStart, Math.min(part.range.verseEnd, lastVerse));
    }

    return (part.bibleText?.verses ?? [])
        .map((verse) => verse.number)
        .filter((verseNumber) => verseNumber >= part.range.verseStart)
        .sort((left, right) => left - right);
}

function createNumberRange(start: number, end: number): number[] {
    const result: number[] = [];
    for (let value = start; value <= end; value += 1) {
        result.push(value);
    }
    return result;
}

function collectPartFootnotes(part: BibleTextPart, mapping: BookMapping): string[] {
    const versesByNumber = new Map<number, Verse>();
    for (const verse of part.bibleText?.verses ?? []) {
        versesByNumber.set(verse.number, verse);
    }

    return getVerseNumbersToShow(part).flatMap((verseNumber) => {
        const verse = versesByNumber.get(verseNumber);
        return verse === undefined ? [] : formatVerseFootnotes(part.range, verse, mapping);
    });
}

function formatVerseFootnotes(range: ChapterVerseRange, verse: Verse, mapping: BookMapping): string[] {
    return verse.footnotes.map((footnote) => `^${formatVerseReference(range, verse.number, mapping)} ${cleanupFootnoteTextForPreview(footnote)}`);
}

function cleanupFootnoteTextForPreview(footnote: string): string {
    const withoutMarker = footnote
        .replace(/^\s*\^\s*/, "")
        .trim();
    const withoutRepeatedReference = withoutMarker
        .replace(/^(?:[1-3]\s*)?[\p{L}.]+(?:\s+[\p{L}.]+)*\s+\d+(?::\d+)?\s*/u, "")
        .trim();
    return withoutRepeatedReference.length === 0 ? withoutMarker : withoutRepeatedReference;
}

function formatComparisonReferenceTitle(references: BibleReference[], mapping: BookMapping): string {
    if (references.length === 0) {
        return formatSourceReferenceTitle("");
    }

    const firstReference = references[0];
    const canUseSingleChapterTitle = references.every((reference) =>
        reference.book === firstReference.book
        && reference.chapterStart === firstReference.chapterStart
        && reference.chapterEnd === reference.chapterStart,
    );

    if (canUseSingleChapterTitle) {
        const bookName = mapping.idToDisplayName.get(firstReference.book) ?? String(firstReference.book);
        const verseSegments = references.map((reference) => formatReferenceVerseSegment(reference));
        const title = mapping.oneChapterBooks.has(firstReference.book)
            ? `${bookName} ${verseSegments.join(", ")}`
            : `${bookName} ${firstReference.chapterStart}:${verseSegments.join(", ")}`;
        return formatSourceReferenceTitle(title);
    }

    const title = references
        .map((reference) => formatBibleReference(reference, mapping))
        .join("; ");
    return formatSourceReferenceTitle(title);
}

function formatVerseReference(range: ChapterVerseRange, verseNumber: number, mapping: BookMapping): string {
    const bookName = mapping.idToDisplayName.get(range.book) ?? String(range.book);
    if (mapping.oneChapterBooks.has(range.book)) {
        return `${bookName} ${verseNumber}`;
    }
    return `${bookName} ${range.chapter}:${verseNumber}`;
}

function formatSourceReferenceTitle(sourceText: string): string {
    const trimmed = sourceText.replace(/\s+/g, " ").trim();
    return trimmed.startsWith("📖") ? trimmed : `📖 ${trimmed}`;
}

function buildPlainText(blocks: BiblePreviewBlock[]): string {
    const sections: string[] = [];
    let pendingFootnotes: string[] = [];

    const flushFootnotes = (): void => {
        if (pendingFootnotes.length === 0) {
            return;
        }
        sections.push(pendingFootnotes.join("\n"));
        pendingFootnotes = [];
    };

    for (const block of blocks) {
        if (block.type === "footnote") {
            pendingFootnotes.push(` ${block.text}`);
            continue;
        }

        flushFootnotes();

        if (block.type === "separator") {
            sections.push(block.text);
            continue;
        }

        sections.push(formatReferenceBlockPlainText(block));
    }

    flushFootnotes();
    return sections.join("\n\n");
}

function formatReferenceBlockPlainText(block: Extract<BiblePreviewBlock, { type: "reference" | "comparison" }>): string {
    if (block.type === "comparison") {
        const translationTexts = block.translations
            .map((translation) => [
                `[${translation.translationName}]`,
                `${translation.referenceTitle}.`,
                translation.paragraphs
                    .map((paragraph) => `${formatParagraphPlainText(paragraph)}`)
                    .join("\n\n"),
                translation.footnotes.map((footnote) => ` ${footnote}`).join("\n"),
            ].filter((part) => part.length > 0).join("\n"))
            .join("\n\n");

        return translationTexts;
    }

    const paragraphsText = block.paragraphs
        .map((paragraph) => `${formatParagraphPlainText(paragraph)}`)
        .join("\n\n");

    return `${block.title}.\n${paragraphsText}`;
}

function formatParagraphPlainText(paragraph: BiblePreviewParagraph): string {
    return paragraph.verses
        .map((verse) => `${verse.number} ${verse.text}`)
        .join(" ");
}
