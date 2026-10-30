import { BOOK_ICON, type BiblePreviewChapterView, type BiblePreviewContent, type BiblePreviewUsageTarget, type BiblePreviewVerse, formatVerseNumber } from "../application/BiblePreviewModel";
import { type BibleChapterLocation, type BibleChapterTarget, getChapterTargetFromReferences } from "../application/BibleChapterNavigation";

const CHAPTER_USAGES_BUTTON_CLASS = "bible-preview-chapter-usages-button";

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
