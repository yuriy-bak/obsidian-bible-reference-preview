import { BibleReference } from "../domain/BibleReference";
import { Verse } from "../domain/BibleText";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";
import { BookMapping } from "../parsing/BookMapping";
import { formatBibleReference } from "../parsing/formatBibleReference";
import { BibleTextBlock, BibleTextPart } from "./BibleTextBlock";

const DEFAULT_MISSING_VERSE_TEXT = "[стих не найден]";
const DIFFERENT_BOOK_SEPARATOR = "__________";

export type BiblePreviewContent = {
    plainText: string;
    blocks: BiblePreviewBlock[];
};

export type BiblePreviewReferenceBlock = {
    type: "reference";
    title: string;
    references: BibleReference[];
    paragraphs: BiblePreviewParagraph[];
};

export type BiblePreviewBlock =
    | BiblePreviewReferenceBlock
    | {
        type: "footnote";
        text: string;
    }
    | {
        type: "separator";
        text: typeof DIFFERENT_BOOK_SEPARATOR;
    };

export type BiblePreviewRenderOptions = {
    getFindUsagesButtonText?(): string;
    getFindUsagesButtonAria?(block: BiblePreviewReferenceBlock): string;
    onFindUsages?(block: BiblePreviewReferenceBlock): void;
};

export type BiblePreviewParagraph = {
    verses: BiblePreviewVerse[];
};

export type BiblePreviewVerse = {
    number: number;
    text: string;
};

type RenderedReferenceBlock = {
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
        const renderedGroup = renderSourceTextGroup(group, mapping, missingVerseText);
        if (renderedGroup.length === 0) {
            continue;
        }

        const groupBook = renderedGroup[0].book;
        if (currentBook !== null && currentBook !== groupBook) {
            flushCurrentBookGroup();
            previewBlocks.push({ type: "separator", text: DIFFERENT_BOOK_SEPARATOR });
        }

        currentBook = groupBook;
        pendingReferenceBlocks.push(...renderedGroup.map((item) => item.block));
        pendingFootnotes.push(...renderedGroup.flatMap((item) => item.footnotes));
    }

    flushCurrentBookGroup();

    return {
        blocks: previewBlocks,
        plainText: buildPlainText(previewBlocks),
    };
}

export function renderBiblePreviewContent(containerEl: HTMLElement, content: BiblePreviewContent, options: BiblePreviewRenderOptions = {}): void {
    containerEl.replaceChildren();

    let previousRenderedBlockType: "reference" | "footnote" | "separator" | null = null;

    for (const block of content.blocks) {
        if (block.type === "separator") {
            const separatorEl = document.createElement("div");
            separatorEl.className = "bible-preview-separator";
            separatorEl.textContent = block.text;
            containerEl.appendChild(separatorEl);

            previousRenderedBlockType = "separator";
            continue;
        }

        if (block.type === "footnote") {
            const footnoteEl = document.createElement("div");
            footnoteEl.className = "bible-preview-footnote";
            footnoteEl.style.marginLeft = "0.2em";

            if (previousRenderedBlockType === "reference") {
                footnoteEl.style.marginTop = "1em";
            }

            appendTextWithLineBreaks(footnoteEl, block.text);
            containerEl.appendChild(footnoteEl);

            previousRenderedBlockType = "footnote";
            continue;
        }

        const referenceEl = document.createElement("div");
        referenceEl.className = "bible-preview-reference-block";

        const titleRowEl = document.createElement("div");
        titleRowEl.className = "bible-preview-reference-title-row";
        titleRowEl.style.display = "flex";
        titleRowEl.style.alignItems = "center";
        titleRowEl.style.gap = "6px";
        titleRowEl.style.justifyContent = "space-between";

        const titleEl = document.createElement("div");
        titleEl.className = "bible-preview-reference-title";
        titleEl.textContent = `${block.title}.`;
        titleEl.style.flex = "1 1 auto";
        titleRowEl.appendChild(titleEl);

        if (options.onFindUsages !== undefined && block.references.length > 0) {
            const findUsagesButtonEl = document.createElement("button");
            findUsagesButtonEl.type = "button";
            findUsagesButtonEl.className = "bible-preview-reference-usages-button";
            findUsagesButtonEl.textContent = options.getFindUsagesButtonText?.() ?? "🔎";
            const ariaLabel = options.getFindUsagesButtonAria?.(block) ?? block.title;
            findUsagesButtonEl.setAttribute("aria-label", ariaLabel);
            findUsagesButtonEl.setAttribute("title", ariaLabel);
            findUsagesButtonEl.style.flex = "0 0 auto";
            findUsagesButtonEl.style.padding = "1px 6px";
            findUsagesButtonEl.style.minWidth = "24px";
            findUsagesButtonEl.style.height = "24px";
            findUsagesButtonEl.style.lineHeight = "1";
            findUsagesButtonEl.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                options.onFindUsages?.(block);
            });
            titleRowEl.appendChild(findUsagesButtonEl);
        }

        referenceEl.appendChild(titleRowEl);

        block.paragraphs.forEach((paragraph) => {
            const paragraphEl = document.createElement("div");
            paragraphEl.className = "bible-preview-paragraph";
            paragraphEl.style.setProperty("text-align", "justify");

            appendPreviewVerses(paragraphEl, paragraph.verses);
            referenceEl.appendChild(paragraphEl);
        });

        containerEl.appendChild(referenceEl);

        previousRenderedBlockType = "reference";
    }
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

function renderSourceTextGroup(
    blocks: BibleTextBlock[],
    mapping: BookMapping,
    missingVerseText: string,
): RenderedReferenceBlock[] {
    const renderedBlocks = blocks.flatMap((block) => renderBibleTextBlock(block, mapping, missingVerseText, false));
    const groupedBlocks: RenderedReferenceBlock[] = [];

    for (const renderedBlock of renderedBlocks) {
        const previousBlock = groupedBlocks[groupedBlocks.length - 1];
        if (previousBlock !== undefined && canMergeRenderedReferenceBlocksByChapter(previousBlock, renderedBlock)) {
            groupedBlocks[groupedBlocks.length - 1] = mergeRenderedReferenceBlocksByChapter(previousBlock, renderedBlock, mapping);
            continue;
        }

        groupedBlocks.push(renderedBlock);
    }

    return groupedBlocks;
}

function canMergeRenderedReferenceBlocksByChapter(left: RenderedReferenceBlock, right: RenderedReferenceBlock): boolean {
    const leftReference = left.block.references[0];
    const rightReference = right.block.references[0];

    return leftReference !== undefined
        && rightReference !== undefined
        && leftReference.book === rightReference.book
        && leftReference.chapterStart === leftReference.chapterEnd
        && rightReference.chapterStart === rightReference.chapterEnd
        && leftReference.chapterStart === rightReference.chapterStart;
}

function mergeRenderedReferenceBlocksByChapter(
    left: RenderedReferenceBlock,
    right: RenderedReferenceBlock,
    mapping: BookMapping,
): RenderedReferenceBlock {
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

function canRenderUnderSingleSourceTitle(blocks: BibleTextBlock[]): boolean {
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

function renderBibleTextBlock(
    block: BibleTextBlock,
    mapping: BookMapping,
    missingVerseText: string,
    useSourceTitle: boolean,
): RenderedReferenceBlock[] {
    if (block.parts.length <= 1) {
        const rendered = renderSingleChapterBlock(block, mapping, missingVerseText, useSourceTitle);
        return rendered === null ? [] : [rendered];
    }

    return block.parts
        .map((part) => renderPartAsReferenceBlock(block.reference, part, mapping, missingVerseText))
        .filter((block): block is RenderedReferenceBlock => block !== null);
}

function renderSingleChapterBlock(
    block: BibleTextBlock,
    mapping: BookMapping,
    missingVerseText: string,
    useSourceTitle: boolean,
): RenderedReferenceBlock | null {
    const part = block.parts[0];
    if (part === undefined) {
        return null;
    }

    const paragraphs = formatPartParagraphs(part, missingVerseText);
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

function renderPartAsReferenceBlock(
    reference: BibleReference,
    part: BibleTextPart,
    mapping: BookMapping,
    missingVerseText: string,
): RenderedReferenceBlock | null {
    const paragraphs = formatPartParagraphs(part, missingVerseText);
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
    const verseNumbers = getVerseNumbersToRender(part);
    return verseNumbers[verseNumbers.length - 1] ?? part.range.verseStart;
}

function formatPartParagraphs(part: BibleTextPart, missingVerseText: string): BiblePreviewParagraph[] {
    const versesByNumber = new Map<number, Verse>();
    for (const verse of part.bibleText?.verses ?? []) {
        versesByNumber.set(verse.number, verse);
    }

    const paragraphs: BiblePreviewParagraph[] = [];
    for (const verseNumber of getVerseNumbersToRender(part)) {
        const verse = versesByNumber.get(verseNumber);
        const previewVerse: BiblePreviewVerse = verse === undefined
            ? { number: verseNumber, text: missingVerseText }
            : { number: verse.number, text: verse.text };

        if (paragraphs.length === 0 || verse === undefined || verse.paragraphStart !== false) {
            paragraphs.push({ verses: [previewVerse] });
        } else {
            paragraphs[paragraphs.length - 1].verses.push(previewVerse);
        }
    }

    return paragraphs;
}

function getVerseNumbersToRender(part: BibleTextPart): number[] {
    if (part.range.verseEnd !== undefined) {
        return createNumberRange(part.range.verseStart, part.range.verseEnd);
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

    return getVerseNumbersToRender(part).flatMap((verseNumber) => {
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

function formatReferenceBlockPlainText(block: Extract<BiblePreviewBlock, { type: "reference" }>): string {
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

function appendPreviewVerses(containerEl: HTMLElement, verses: BiblePreviewVerse[]): void {
    verses.forEach((verse, index) => {
        if (index > 0) {
            containerEl.appendChild(document.createTextNode(" "));
        }

        const numberEl = document.createElement("strong");
        numberEl.className = "bible-preview-verse-number";
        numberEl.textContent = String(verse.number);
        containerEl.appendChild(numberEl);
        containerEl.appendChild(document.createTextNode(" "));
        appendTextWithLineBreaks(containerEl, verse.text);
    });
}

function appendTextWithLineBreaks(containerEl: HTMLElement, text: string): void {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
        if (index > 0) {
            containerEl.appendChild(document.createElement("br"));
        }
        containerEl.appendChild(document.createTextNode(line));
    });
}
