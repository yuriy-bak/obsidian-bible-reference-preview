import { BibleReference } from "../domain/BibleReference";
import { Verse } from "../domain/BibleText";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";
import { BookMapping } from "../parsing/BookMapping";
import { formatBibleReference } from "../parsing/formatBibleReference";
import { BibleChapterLocation, BibleChapterTarget, getChapterTargetFromReferences, isVerseInRanges } from "./BibleChapterNavigation";
import { BibleTextBlock, BibleTextPart } from "./BibleTextBlock";

const DEFAULT_MISSING_VERSE_TEXT = "[стих не найден]";
const DIFFERENT_BOOK_SEPARATOR = "__________";
const CHAPTER_USAGES_BUTTON_CLASS = "bible-preview-chapter-usages-button";

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
    }[];
    formatReferenceTitle?: (mapping: BookMapping) => string;
};

export type BiblePreviewRenderOptions = {
    getFindUsagesButtonText?: () => string;
    getFindUsagesButtonAria?: (target: BiblePreviewUsageTarget) => string;
    onFindUsages?: (target: BiblePreviewUsageTarget) => void;
    getOpenChapterAria?: (title: string) => string;
    onOpenChapter?: (target: BibleChapterTarget) => void;
    getChapterNavigationLabels?: () => BiblePreviewChapterNavigationLabels;
    onNavigateChapter?: (location: BibleChapterLocation) => void;
    onBackFromChapter?: () => void;
    isChapterHighlightHidden?: () => boolean;
    onToggleChapterHighlight?: (hidden: boolean) => void;
    // Null hides the chapter's find-usages button.
    getChapterUsageCount?: (location: BibleChapterLocation) => number | null;
    getFindChapterUsagesAria?: (title: string) => string;
    onFindChapterUsages?: (location: BibleChapterLocation, title: string) => void;
};

// Chapter-related callbacks as the preview views receive them; the views add their current content and scroll.
export type BiblePreviewChapterViewInput = {
    getOpenChapterAria?: (title: string) => string;
    onOpenChapter?: (target: BibleChapterTarget, returnContent: BiblePreviewContent, returnScrollTop: number) => void;
    getChapterNavigationLabels?: () => BiblePreviewChapterNavigationLabels;
    onNavigateChapter?: (location: BibleChapterLocation) => void;
    onBackFromChapter?: () => void;
    isChapterHighlightHidden?: () => boolean;
    onToggleChapterHighlight?: (hidden: boolean) => void;
    // Null hides the chapter's find-usages button.
    getChapterUsageCount?: (location: BibleChapterLocation) => number | null;
    getFindChapterUsagesAria?: (title: string) => string;
    onFindChapterUsages?: (location: BibleChapterLocation, title: string) => void;
};

export function createChapterRenderOptions(
    input: BiblePreviewChapterViewInput,
    content: BiblePreviewContent,
    getScrollTop: () => number,
): BiblePreviewRenderOptions {
    const onOpenChapter = input.onOpenChapter;
    return {
        getOpenChapterAria: input.getOpenChapterAria,
        onOpenChapter: onOpenChapter === undefined ? undefined : (target) => onOpenChapter(target, content, getScrollTop()),
        getChapterNavigationLabels: input.getChapterNavigationLabels,
        onNavigateChapter: input.onNavigateChapter,
        onBackFromChapter: input.onBackFromChapter,
        isChapterHighlightHidden: input.isChapterHighlightHidden,
        onToggleChapterHighlight: input.onToggleChapterHighlight,
        getChapterUsageCount: input.getChapterUsageCount,
        getFindChapterUsagesAria: input.getFindChapterUsagesAria,
        onFindChapterUsages: input.onFindChapterUsages,
    };
}

export type BiblePreviewChapterNavigationLabels = {
    back: string;
    backAria: string;
    previousAria: string;
    nextAria: string;
    hideHighlightAria: string;
    showHighlightAria: string;
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
                    referenceTitle: input.formatReferenceTitle?.(translation.mapping)
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
    const fragment = createFragment();

    let previousRenderedBlockType: "reference" | "footnote" | "separator" | null = null;
    const chapterView = content.chapterView;
    const onOpenChapter = chapterView === undefined ? options.onOpenChapter : undefined;

    if (chapterView !== undefined && options.onBackFromChapter !== undefined) {
        fragment.appendChild(createChapterNavigation(containerEl, chapterView, options));
    }
    // The highlight toggle only swaps a class, so hiding it keeps the scroll position.
    containerEl.classList.toggle(
        CHAPTER_HIGHLIGHTS_HIDDEN_CLASS,
        chapterView !== undefined && options.isChapterHighlightHidden?.() === true,
    );

    for (const block of content.blocks) {
        if (block.type === "separator") {
            const separatorEl = createDiv();
            separatorEl.className = "bible-preview-separator";
            separatorEl.textContent = block.text;
            fragment.appendChild(separatorEl);

            previousRenderedBlockType = "separator";
            continue;
        }

        if (block.type === "footnote") {
            const footnoteEl = createDiv();
            footnoteEl.className = "bible-preview-footnote";

            if (previousRenderedBlockType === "reference") {
                footnoteEl.classList.add("bible-preview-footnote-after-reference");
            }

            appendTextWithLineBreaks(footnoteEl, block.text);
            fragment.appendChild(footnoteEl);

            previousRenderedBlockType = "footnote";
            continue;
        }

        if (block.type === "comparison") {
            const comparisonEl = createDiv();
            comparisonEl.className = "bible-preview-comparison-block";
            if (previousRenderedBlockType !== null) {
                comparisonEl.classList.add("bible-preview-comparison-block-spaced");
            }

            for (const translation of block.translations) {
                const translationTitleEl = createDiv();
                translationTitleEl.className = "bible-preview-comparison-translation-title";
                translationTitleEl.textContent = `[${translation.translationName}]`;
                comparisonEl.appendChild(translationTitleEl);

                // Only the main translation gets the chapter and find-usages actions.
                const isMain = translation.isMain === true;
                const titleRowEl = createReferenceTitleRow(
                    { title: translation.referenceTitle, references: block.references },
                    { openChapter: isMain && onOpenChapter !== undefined, findUsages: isMain },
                    options,
                );
                titleRowEl.classList.add("bible-preview-comparison-reference-title");
                comparisonEl.appendChild(titleRowEl);

                translation.paragraphs.forEach((paragraph) => {
                    const paragraphEl = createDiv();
                    paragraphEl.className = "bible-preview-paragraph";

                    appendPreviewVerses(paragraphEl, paragraph.verses);
                    comparisonEl.appendChild(paragraphEl);
                });

                for (const footnote of translation.footnotes) {
                    const footnoteEl = createDiv();
                    footnoteEl.className = "bible-preview-footnote";
                    appendTextWithLineBreaks(footnoteEl, footnote);
                    comparisonEl.appendChild(footnoteEl);
                }
            }

            fragment.appendChild(comparisonEl);
            previousRenderedBlockType = "reference";
            continue;
        }

        const referenceEl = createDiv();
        referenceEl.className = "bible-preview-reference-block";

        // In chapter view the navigation bar already shows the chapter title.
        if (chapterView === undefined) {
            referenceEl.appendChild(createReferenceTitleRow(
                block,
                { openChapter: onOpenChapter !== undefined, findUsages: true },
                options,
            ));
        }

        block.paragraphs.forEach((paragraph) => {
            const paragraphEl = createDiv();
            paragraphEl.className = "bible-preview-paragraph";

            appendPreviewVerses(paragraphEl, paragraph.verses);
            referenceEl.appendChild(paragraphEl);
        });

        fragment.appendChild(referenceEl);

        previousRenderedBlockType = "reference";
    }

    containerEl.replaceChildren(fragment);
}

const BOOK_ICON = "📖";
const HIGHLIGHT_ICON = "🖍";
const CHAPTER_HIGHLIGHTS_HIDDEN_CLASS = "bible-preview-chapter-highlights-hidden";

// Title row shared by single and comparison previews: 📖 + reference title on the left, 🔎 on the right.
function createReferenceTitleRow(
    target: BiblePreviewUsageTarget,
    actions: { openChapter: boolean; findUsages: boolean },
    options: BiblePreviewRenderOptions,
): HTMLElement {
    const titleRowEl = createDiv();
    titleRowEl.className = "bible-preview-reference-title-row";

    const titleEl = createDiv();
    titleEl.className = "bible-preview-reference-title";
    const chapterTarget = actions.openChapter ? getChapterTargetFromReferences(target.references) : null;
    appendReferenceTitle(titleEl, target.title, chapterTarget, options);
    titleRowEl.appendChild(titleEl);

    if (actions.findUsages && options.onFindUsages !== undefined && target.references.length > 0) {
        titleRowEl.appendChild(createFindUsagesButton(target, options));
    }

    return titleRowEl;
}

function appendReferenceTitle(
    titleEl: HTMLElement,
    title: string,
    chapterTarget: BibleChapterTarget | null,
    options: BiblePreviewRenderOptions,
): void {
    if (chapterTarget === null || options.onOpenChapter === undefined) {
        titleEl.textContent = `${title}.`;
        return;
    }

    const titleText = title.startsWith(BOOK_ICON) ? title.slice(BOOK_ICON.length).trimStart() : title;
    titleEl.appendChild(createOpenChapterButton(titleText, chapterTarget, options));
    titleEl.appendChild(document.createTextNode(` ${titleText}.`));
}

function createOpenChapterButton(titleText: string, target: BibleChapterTarget, options: BiblePreviewRenderOptions): HTMLElement {
    const buttonEl = createSpan();
    buttonEl.className = "bible-preview-open-chapter-button";
    buttonEl.textContent = BOOK_ICON;
    buttonEl.setAttribute("role", "button");
    buttonEl.setAttribute("tabindex", "0");
    const ariaLabel = options.getOpenChapterAria?.(titleText) ?? titleText;
    buttonEl.setAttribute("aria-label", ariaLabel);
    buttonEl.setAttribute("title", ariaLabel);
    buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onOpenChapter?.(target);
    });
    buttonEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        options.onOpenChapter?.(target);
    });
    return buttonEl;
}

function createChapterNavigation(containerEl: HTMLElement, chapterView: BiblePreviewChapterView, options: BiblePreviewRenderOptions): HTMLElement {
    const labels = options.getChapterNavigationLabels?.() ?? {
        back: "↩ Back",
        backAria: "Back to reference",
        previousAria: "Previous chapter",
        nextAria: "Next chapter",
        hideHighlightAria: "Hide highlighting",
        showHighlightAria: "Show highlighting",
    };

    const navigationEl = createDiv();
    navigationEl.className = "bible-preview-chapter-navigation";

    navigationEl.appendChild(createChapterNavigationButton(labels.back, labels.backAria, true, () => options.onBackFromChapter?.()));

    const titleEl = createDiv();
    titleEl.className = "bible-preview-chapter-navigation-title";
    titleEl.textContent = chapterView.title;
    navigationEl.appendChild(titleEl);

    const chapterUsagesButtonEl = createChapterUsagesButton(chapterView, options);
    if (chapterUsagesButtonEl !== null) {
        navigationEl.appendChild(chapterUsagesButtonEl);
    }

    const onToggleChapterHighlight = options.onToggleChapterHighlight;
    if (onToggleChapterHighlight !== undefined && chapterView.highlightedRanges.length > 0) {
        navigationEl.appendChild(createChapterHighlightToggle(containerEl, labels, options.isChapterHighlightHidden?.() === true, onToggleChapterHighlight));
    }

    const previous = chapterView.previous;
    const next = chapterView.next;
    navigationEl.appendChild(createChapterNavigationButton("←", labels.previousAria, previous !== null, () => {
        if (previous !== null) options.onNavigateChapter?.(previous);
    }));
    navigationEl.appendChild(createChapterNavigationButton("→", labels.nextAria, next !== null, () => {
        if (next !== null) options.onNavigateChapter?.(next);
    }));

    return navigationEl;
}

function createChapterUsagesButton(chapterView: BiblePreviewChapterView, options: BiblePreviewRenderOptions): HTMLButtonElement | null {
    const onFindChapterUsages = options.onFindChapterUsages;
    const count = options.getChapterUsageCount?.(chapterView) ?? null;
    if (onFindChapterUsages === undefined || count === null) {
        return null;
    }

    const icon = options.getFindUsagesButtonText?.() ?? "🔎";
    const ariaLabel = options.getFindChapterUsagesAria?.(chapterView.title) ?? chapterView.title;
    const buttonEl = createChapterNavigationButton(formatChapterUsagesButtonText(icon, count), ariaLabel, true, () => {
        onFindChapterUsages({ book: chapterView.book, chapter: chapterView.chapter }, chapterView.title);
    });
    buttonEl.classList.add(CHAPTER_USAGES_BUTTON_CLASS);
    buttonEl.dataset.book = String(chapterView.book);
    buttonEl.dataset.chapter = String(chapterView.chapter);
    buttonEl.dataset.icon = icon;
    return buttonEl;
}

// Updates usage counts of rendered chapter views in place, after the reference usage index changes.
export function refreshChapterUsageCounts(rootEl: ParentNode, getChapterUsageCount: (location: BibleChapterLocation) => number | null): void {
    rootEl.querySelectorAll<HTMLButtonElement>(`.${CHAPTER_USAGES_BUTTON_CLASS}`).forEach((buttonEl) => {
        const book = Number(buttonEl.dataset.book);
        const chapter = Number(buttonEl.dataset.chapter);
        if (!Number.isInteger(book) || !Number.isInteger(chapter)) return;
        const count = getChapterUsageCount({ book, chapter });
        if (count !== null) buttonEl.textContent = formatChapterUsagesButtonText(buttonEl.dataset.icon ?? "🔎", count);
    });
}

function formatChapterUsagesButtonText(icon: string, count: number): string {
    return count > 0 ? `${icon} ${count}` : icon;
}

function createChapterHighlightToggle(
    containerEl: HTMLElement,
    labels: BiblePreviewChapterNavigationLabels,
    initiallyHidden: boolean,
    onToggle: (hidden: boolean) => void,
): HTMLButtonElement {
    let hidden = initiallyHidden;
    const buttonEl = createChapterNavigationButton(HIGHLIGHT_ICON, "", true, () => {
        hidden = !hidden;
        containerEl.classList.toggle(CHAPTER_HIGHLIGHTS_HIDDEN_CLASS, hidden);
        updateState();
        onToggle(hidden);
    });
    buttonEl.classList.add("bible-preview-chapter-highlight-button");
    const updateState = (): void => {
        const ariaLabel = hidden ? labels.showHighlightAria : labels.hideHighlightAria;
        buttonEl.setAttribute("aria-label", ariaLabel);
        buttonEl.setAttribute("title", ariaLabel);
        buttonEl.setAttribute("aria-pressed", String(!hidden));
    };
    updateState();
    return buttonEl;
}

function createChapterNavigationButton(text: string, ariaLabel: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
    const buttonEl = createEl("button");
    buttonEl.type = "button";
    buttonEl.className = "bible-preview-chapter-navigation-button";
    buttonEl.textContent = text;
    buttonEl.disabled = !enabled;
    buttonEl.setAttribute("aria-label", ariaLabel);
    buttonEl.setAttribute("title", ariaLabel);
    buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });
    return buttonEl;
}

// Restores a saved scroll position, or scrolls a chapter view to its first highlighted verse.
export function applyBiblePreviewScroll(containerEl: HTMLElement, content: BiblePreviewContent): void {
    if (content.scrollTop !== undefined) {
        containerEl.scrollTop = content.scrollTop;
        return;
    }

    if (content.chapterView === undefined) {
        return;
    }

    const highlightedEl = containerEl.querySelector(".bible-preview-verse-highlighted");
    if (!(highlightedEl instanceof HTMLElement)) {
        containerEl.scrollTop = 0;
        return;
    }

    const navigationEl = containerEl.querySelector(".bible-preview-chapter-navigation");
    const navigationHeight = navigationEl instanceof HTMLElement ? navigationEl.offsetHeight : 0;
    const offset = highlightedEl.getBoundingClientRect().top - containerEl.getBoundingClientRect().top;
    containerEl.scrollTop = Math.max(0, containerEl.scrollTop + offset - navigationHeight - 8);
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
            highlighted: isVerseInRanges(verse.number, chapterView.highlightedRanges),
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

function createFindUsagesButton(target: BiblePreviewUsageTarget, options: BiblePreviewRenderOptions): HTMLButtonElement {
    const buttonEl = createEl("button");
    buttonEl.type = "button";
    buttonEl.className = "bible-preview-reference-usages-button";
    buttonEl.textContent = options.getFindUsagesButtonText?.() ?? "🔎";
    const ariaLabel = options.getFindUsagesButtonAria?.(target) ?? target.title;
    buttonEl.setAttribute("aria-label", ariaLabel);
    buttonEl.setAttribute("title", ariaLabel);
    buttonEl.addEventListener("click", (event) => handleFindUsagesButtonClick(event, target, options));
    return buttonEl;
}

function handleFindUsagesButtonClick(event: MouseEvent, target: BiblePreviewUsageTarget, options: BiblePreviewRenderOptions): void {
    event.preventDefault();
    event.stopPropagation();
    options.onFindUsages?.(target);
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
    const sourceText = blocks[0]?.sourceText;

    if (sourceText !== undefined && canRenderUnderSingleSourceTitle(blocks)) {
        const renderedBlocks = blocks.flatMap((block) => renderBibleTextBlock(block, mapping, missingVerseText, false));
        if (renderedBlocks.length === 0) {
            return [];
        }

        return [
            {
                book: renderedBlocks[0].book,
                block: {
                    type: "reference",
                    title: formatSourceReferenceTitle(sourceText),
                    references: renderedBlocks.flatMap((item) => item.block.references),
                    paragraphs: renderedBlocks.flatMap((item) => item.block.paragraphs),
                },
                footnotes: renderedBlocks.flatMap((item) => item.footnotes),
            },
        ];
    }

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
        // Missing verses inside the chapter stay visible as gaps; nothing is rendered past its last verse.
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

function appendPreviewVerses(containerEl: HTMLElement, verses: BiblePreviewVerse[]): void {
    verses.forEach((verse, index) => {
        if (index > 0) {
            containerEl.appendChild(document.createTextNode(" "));
        }

        let verseEl = containerEl;
        if (verse.highlighted === true) {
            verseEl = createSpan();
            verseEl.className = "bible-preview-verse-highlighted";
            containerEl.appendChild(verseEl);
        }

        const numberEl = createEl("strong");
        numberEl.className = "bible-preview-verse-number";
        numberEl.textContent = String(verse.number);
        verseEl.appendChild(numberEl);
        verseEl.appendChild(document.createTextNode(" "));
        appendTextWithLineBreaks(verseEl, verse.text);
    });
}

function appendTextWithLineBreaks(containerEl: HTMLElement, text: string): void {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
        if (index > 0) {
            containerEl.appendChild(createEl("br"));
        }
        containerEl.appendChild(document.createTextNode(line));
    });
}
