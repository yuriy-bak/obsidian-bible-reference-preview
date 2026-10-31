import { setIcon } from "obsidian";
import { type BiblePreviewChapterView, type BiblePreviewContent, type BiblePreviewParagraph, type BiblePreviewUsageTarget, type BiblePreviewVerse, formatVerseNumber } from "../application/BiblePreviewModel";
import { type BibleChapterLocation, type BibleChapterTarget, getChapterTargetFromReferences } from "../application/BibleChapterNavigation";
import type { BibleReference } from "../domain/BibleReference";
import { ICONS, setBookTitle, setIconWithText, stripBookIcon } from "./Icons";

export const CHAPTER_USAGES_BUTTON_CLASS = "bible-preview-chapter-usages-button";

export type BiblePreviewRenderOptions = {
    getFindUsagesButtonAria?: (target: BiblePreviewUsageTarget) => string;
    onFindUsages?: (target: BiblePreviewUsageTarget) => void;
    getOpenChapterAria?: (title: string) => string;
    /** The target is in `translationId`'s numbering; no translation means the active one. Ctrl/Cmd-click asks for a new tab. */
    onOpenChapter?: (target: BibleChapterTarget, translationId?: string, newTab?: boolean) => void;
    // The chapter view (the Bible reader) builds its own bar from the helpers below.
    isChapterHighlightHidden?: () => boolean;
    // Null hides the chapter's find-usages button.
    getChapterUsageCount?: (location: BibleChapterLocation) => number | null;
    getFindChapterUsagesAria?: (title: string) => string;
    onFindChapterUsages?: (location: BibleChapterLocation, title: string) => void;
};

// The open-chapter action as the preview views receive it.
export type BiblePreviewChapterViewInput = {
    getOpenChapterAria?: (title: string) => string;
    onOpenChapter?: (target: BibleChapterTarget, translationId?: string, newTab?: boolean) => void;
};

export function createChapterRenderOptions(input: BiblePreviewChapterViewInput): BiblePreviewRenderOptions {
    return {
        getOpenChapterAria: input.getOpenChapterAria,
        onOpenChapter: input.onOpenChapter,
    };
}

export type BiblePreviewChapterNavigationLabels = {
    previousAria: string;
    nextAria: string;
    hideHighlightAria: string;
    showHighlightAria: string;
};

export function renderBiblePreviewContent(containerEl: HTMLElement, content: BiblePreviewContent, options: BiblePreviewRenderOptions = {}): void {
    const fragment = createFragment();

    let previousRenderedBlockType: "reference" | "footnote" | "separator" | null = null;
    const chapterView = content.chapterView;
    const onOpenChapter = options.onOpenChapter;

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

                // Each translation opens its chapter in itself (in a chapter view, the other translations do);
                // only the main one finds usages (they follow its numbering).
                const isMain = translation.isMain === true;
                const opensChapter = onOpenChapter !== undefined && !(chapterView !== undefined && isMain);
                const titleRowEl = createReferenceTitleRow(
                    { title: translation.referenceTitle, references: block.references },
                    {
                        openChapter: opensChapter ? { references: translation.references, translationId: translation.translationId } : null,
                        findUsages: isMain,
                    },
                    options,
                );
                titleRowEl.classList.add("bible-preview-comparison-reference-title");
                comparisonEl.appendChild(titleRowEl);

                translation.paragraphs.forEach((paragraph) => {
                    appendParagraphHeading(comparisonEl, paragraph);
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
                { openChapter: onOpenChapter === undefined ? null : { references: block.references }, findUsages: true },
                options,
            ));
        }

        block.paragraphs.forEach((paragraph) => {
            appendParagraphHeading(referenceEl, paragraph);
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

const CHAPTER_HIGHLIGHTS_HIDDEN_CLASS = "bible-preview-chapter-highlights-hidden";

type OpenChapterAction = {
    /** In the numbering of the translation. */
    references: BibleReference[];
    translationId?: string;
};

// Title row shared by single and comparison previews: open-chapter icon + reference title on the left, find-usages icon on the right.
function createReferenceTitleRow(
    target: BiblePreviewUsageTarget,
    actions: { openChapter: OpenChapterAction | null; findUsages: boolean },
    options: BiblePreviewRenderOptions,
): HTMLElement {
    const titleRowEl = createDiv();
    titleRowEl.className = "bible-preview-reference-title-row";

    const titleEl = createDiv();
    titleEl.className = "bible-preview-reference-title";
    const chapterTarget = actions.openChapter === null ? null : getChapterTargetFromReferences(actions.openChapter.references);
    appendReferenceTitle(titleEl, target.title, chapterTarget, actions.openChapter?.translationId, options);
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
    translationId: string | undefined,
    options: BiblePreviewRenderOptions,
): void {
    if (chapterTarget === null || options.onOpenChapter === undefined) {
        setBookTitle(titleEl, `${title}.`);
        return;
    }

    const titleText = stripBookIcon(title);
    titleEl.appendChild(createOpenChapterButton(titleText, chapterTarget, translationId, options));
    titleEl.appendChild(document.createTextNode(` ${titleText}.`));
}

function createOpenChapterButton(titleText: string, target: BibleChapterTarget, translationId: string | undefined, options: BiblePreviewRenderOptions): HTMLElement {
    const buttonEl = createSpan();
    buttonEl.className = "bible-preview-open-chapter-button";
    setIcon(buttonEl, ICONS.openChapter);
    buttonEl.setAttribute("role", "button");
    buttonEl.setAttribute("tabindex", "0");
    const ariaLabel = options.getOpenChapterAria?.(titleText) ?? titleText;
    buttonEl.setAttribute("aria-label", ariaLabel);
    buttonEl.setAttribute("title", ariaLabel);
    buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onOpenChapter?.(target, translationId, event.ctrlKey || event.metaKey);
    });
    buttonEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        options.onOpenChapter?.(target, translationId);
    });
    return buttonEl;
}

export function createChapterUsagesButton(chapterView: BiblePreviewChapterView, options: BiblePreviewRenderOptions): HTMLButtonElement | null {
    const onFindChapterUsages = options.onFindChapterUsages;
    const count = options.getChapterUsageCount?.(chapterView) ?? null;
    if (onFindChapterUsages === undefined || count === null) {
        return null;
    }

    const ariaLabel = options.getFindChapterUsagesAria?.(chapterView.title) ?? chapterView.title;
    const buttonEl = createChapterNavigationButton(ICONS.findUsages, ariaLabel, true, () => {
        onFindChapterUsages({ book: chapterView.book, chapter: chapterView.chapter }, chapterView.title);
    });
    buttonEl.classList.add(CHAPTER_USAGES_BUTTON_CLASS);
    buttonEl.dataset.book = String(chapterView.book);
    buttonEl.dataset.chapter = String(chapterView.chapter);
    setChapterUsagesCount(buttonEl, count);
    return buttonEl;
}

// Updates usage counts of rendered chapter views in place, after the reference usage index changes.
export function refreshChapterUsageCounts(rootEl: ParentNode, getChapterUsageCount: (location: BibleChapterLocation) => number | null): void {
    rootEl.querySelectorAll<HTMLButtonElement>(`.${CHAPTER_USAGES_BUTTON_CLASS}`).forEach((buttonEl) => {
        const book = Number(buttonEl.dataset.book);
        const chapter = Number(buttonEl.dataset.chapter);
        if (!Number.isInteger(book) || !Number.isInteger(chapter)) return;
        const count = getChapterUsageCount({ book, chapter });
        if (count !== null) setChapterUsagesCount(buttonEl, count);
    });
}

function setChapterUsagesCount(buttonEl: HTMLButtonElement, count: number): void {
    setIconWithText(buttonEl, ICONS.findUsages, count > 0 ? String(count) : undefined);
}

export function createChapterHighlightToggle(
    containerEl: HTMLElement,
    labels: BiblePreviewChapterNavigationLabels,
    initiallyHidden: boolean,
    onToggle: (hidden: boolean) => void,
): HTMLButtonElement {
    let hidden = initiallyHidden;
    const buttonEl = createChapterNavigationButton(ICONS.highlight, "", true, () => {
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

/** A button of the chapter bar with a Lucide icon. */
export function createChapterNavigationButton(icon: string, ariaLabel: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
    const buttonEl = createEl("button");
    buttonEl.type = "button";
    buttonEl.className = "bible-preview-chapter-navigation-button";
    setIcon(buttonEl, icon);
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
    if (highlightedEl === null || !highlightedEl.instanceOf(HTMLElement)) {
        containerEl.scrollTop = 0;
        return;
    }

    const navigationEl = containerEl.querySelector(".bible-preview-chapter-navigation");
    const navigationHeight = navigationEl?.instanceOf(HTMLElement) ? navigationEl.offsetHeight : 0;
    const offset = highlightedEl.getBoundingClientRect().top - containerEl.getBoundingClientRect().top;
    containerEl.scrollTop = Math.max(0, containerEl.scrollTop + offset - navigationHeight - 8);
}

function createFindUsagesButton(target: BiblePreviewUsageTarget, options: BiblePreviewRenderOptions): HTMLButtonElement {
    const buttonEl = createEl("button");
    buttonEl.type = "button";
    buttonEl.className = "bible-preview-reference-usages-button";
    setIcon(buttonEl, ICONS.findUsages);
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

function appendParagraphHeading(containerEl: HTMLElement, paragraph: BiblePreviewParagraph): void {
    if (paragraph.heading === undefined) {
        return;
    }
    const headingEl = createDiv();
    headingEl.className = "bible-preview-verse-heading";
    headingEl.textContent = paragraph.heading;
    containerEl.appendChild(headingEl);
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
        numberEl.textContent = formatVerseNumber(verse);
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
