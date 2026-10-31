import { ItemView, Notice, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import { BibleNavigatorPanel, type BibleNavigatorLabels } from "./BibleNavigatorPanel";
import type { NavigatorBook } from "../reader/BibleNavigatorModel";
import { BibleReaderHistory } from "../reader/BibleReaderHistory";
import { BiblePreviewHeader, scrollPreviewElement, type BiblePreviewHeaderInput, type BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import { applyBiblePreviewScroll, CHAPTER_USAGES_BUTTON_CLASS, type BiblePreviewChapterNavigationLabels, renderBiblePreviewContent } from "./BiblePreviewRenderer";

export const BIBLE_READER_VIEW_TYPE = "bible-reference-reader";

/** What a reader shows: a chapter of one translation, in that translation's numbering. */
export type BibleReaderLocation = {
    target: BibleChapterTarget;
    translationId: string;
};

/**
 * The state Obsidian saves with the workspace. It keeps the chapter in the active translation's numbering and
 * no translation: the reader's translation is not remembered, a restored reader shows the active one.
 */
type BibleReaderSavedState = {
    book: number;
    chapter: number;
};

/** Opening state passed with setViewState by the reader service; not saved. */
export type BibleReaderOpenState = BibleReaderSavedState & {
    translationId?: string;
    highlightedRanges?: BibleChapterTarget["highlightedRanges"];
};

export type BibleReaderViewInput = Pick<BiblePreviewHeaderInput, "getTitle" | "getCopyAria"> & {
    getViewTitle: () => string;
    getHistoryBackAria: () => string;
    getHistoryForwardAria: () => string;
    getCopyNoticeText: () => string;
    getNoTranslationsText: () => string;
    getActiveTranslationId: () => string | null;
    hasTranslation: (translationId: string) => boolean;
    getFirstChapter: (translationId: string) => BibleChapterLocation | null;
    mapChapterLocation: (location: BibleChapterLocation, fromTranslationId: string, toTranslationId: string) => BibleChapterLocation;
    /** The chapter in that translation only, without compared translations. */
    buildChapter: (target: BibleChapterTarget, translationId: string) => Promise<BiblePreviewContent | null>;
    getTranslationTitle: (translationId: string) => string;
    getChapterNavigationLabels: () => BiblePreviewChapterNavigationLabels;
    getFindUsagesButtonText: () => string;
    getFindUsagesButtonAria: (target: BiblePreviewUsageTarget) => string;
    getFindChapterUsagesAria: (title: string) => string;
    /** Usages follow the active translation's numbering; the reader passes its own translation along. */
    onFindUsages: (target: BiblePreviewUsageTarget, translationId: string, leaf: WorkspaceLeaf) => void;
    getChapterUsageCount: (location: BibleChapterLocation, translationId: string) => number | null;
    /** The chapter in the numbering of the usage index. */
    getUsageLocation: (location: BibleChapterLocation, translationId: string) => BibleChapterLocation;
    onFindChapterUsages: (location: BibleChapterLocation, title: string, translationId: string, leaf: WorkspaceLeaf) => void;
    mapChapterTarget: (target: BibleChapterTarget, fromTranslationId: string, toTranslationId: string) => BibleChapterTarget;
    getNavigatorBooks: (translationId: string) => NavigatorBook[];
    getNavigatorLabels: () => BibleNavigatorLabels;
    getOpenNavigatorAria: () => string;
    /** The imported translations in the settings order. */
    getTranslationOptions: () => { id: string; name: string }[];
    getTranslationSelectAria: () => string;
};

/**
 * "Bible reader": a whole chapter of one translation, read only, with the chapter navigation bar, the book
 * navigator and back/forward through what it showed. Several readers can be open, each with its own translation.
 */
export class BibleReaderView extends ItemView {
    private rootEl: HTMLDivElement | null = null;
    private textEl: HTMLDivElement | null = null;
    private navigator: BibleNavigatorPanel | null = null;
    private header: BiblePreviewHeader | null = null;
    private location: BibleReaderLocation | null = null;
    private content: BiblePreviewContent | null = null;
    private highlightsHidden = false;
    /** The chapter the reader was opened at: its highlights come back when navigating to it again. */
    private origin: BibleReaderLocation | null = null;
    private readonly history = new BibleReaderHistory<BibleReaderLocation>((left, right) =>
        left.translationId === right.translationId && isSameLocation(left.target, right.target));
    private historyBackButtonEl: HTMLButtonElement | null = null;
    private historyForwardButtonEl: HTMLButtonElement | null = null;
    private loadId = 0;

    constructor(leaf: WorkspaceLeaf, private input: BibleReaderViewInput) {
        super(leaf);
    }

    getViewType(): string { return BIBLE_READER_VIEW_TYPE; }
    getIcon(): string { return "book-open-text"; }

    getDisplayText(): string {
        const title = this.content?.chapterView?.title;
        return title === undefined ? this.input.getViewTitle() : stripBookIcon(title);
    }

    getLocation(): BibleReaderLocation | null {
        return this.location;
    }

    async onOpen(): Promise<void> {
        this.buildLayout();
    }

    async onClose(): Promise<void> {
        this.loadId += 1;
        this.rootEl = null;
        this.textEl = null;
        this.navigator = null;
        this.header = null;
        this.historyBackButtonEl = null;
        this.historyForwardButtonEl = null;
    }

    /** The book and chapter picker, with the focus in its search field. */
    openNavigator(): void {
        this.buildLayout();
        this.navigator?.open(this.location?.target.book ?? null);
    }

    getState(): Record<string, unknown> {
        const location = this.location;
        if (location === null) return {};
        const activeTranslationId = this.input.getActiveTranslationId();
        const saved = activeTranslationId === null || activeTranslationId === location.translationId
            ? location.target
            : this.input.mapChapterLocation(location.target, location.translationId, activeTranslationId);
        const state: BibleReaderSavedState = { book: saved.book, chapter: saved.chapter };
        return state;
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        const openState = parseOpenState(state);
        const activeTranslationId = this.input.getActiveTranslationId();
        const translationId = openState?.translationId !== undefined && this.input.hasTranslation(openState.translationId)
            ? openState.translationId
            : activeTranslationId;
        if (translationId === null) {
            this.renderEmpty();
            return;
        }
        const location = openState === null ? this.input.getFirstChapter(translationId) : openState;
        if (location === null) {
            this.renderEmpty();
            return;
        }
        const target = { book: location.book, chapter: location.chapter, highlightedRanges: openState?.highlightedRanges ?? [] };
        this.highlightsHidden = false;
        this.origin = { target, translationId };
        await this.show({ target, translationId });
    }

    /** Rebuilds the open chapter (translations or the language changed), keeping the scroll position. */
    async refresh(input: BibleReaderViewInput = this.input): Promise<void> {
        this.input = input;
        this.header?.refresh(this.createHeaderInput());
        const location = this.location;
        if (location === null) return;
        if (!this.input.hasTranslation(location.translationId)) {
            // The reader's translation was deleted: the same chapter numbers in the active translation.
            const activeTranslationId = this.input.getActiveTranslationId();
            if (activeTranslationId === null) {
                this.location = null;
                this.renderEmpty();
                return;
            }
            await this.show({ ...location, translationId: activeTranslationId }, { record: "replace" });
            return;
        }
        await this.show(location, { record: "replace", scrollTop: this.textEl?.scrollTop });
    }

    public scrollReader(command: BiblePreviewScrollCommand): boolean {
        const scrollEl = this.textEl;
        if (scrollEl === null || scrollEl.clientHeight <= 0 || scrollEl.scrollHeight <= scrollEl.clientHeight) return false;
        scrollPreviewElement(scrollEl, command);
        return true;
    }

    private buildLayout(): void {
        if (this.rootEl !== null) return;
        const containerEl = this.contentEl;
        containerEl.empty();
        this.rootEl = containerEl.createDiv({ cls: ["bible-preview-pane-root", "bible-reader-root"] });
        // One translation, no comparison: the header has no comparison button or selector.
        this.header = new BiblePreviewHeader(this.rootEl, this.createHeaderInput(), {
            variant: "pane",
            onCopy: () => this.copyText(),
            onToggleComparison: () => undefined,
        });
        this.historyForwardButtonEl = this.header.addIconButton("arrow-right", this.input.getHistoryForwardAria(), () => void this.goForward());
        this.historyBackButtonEl = this.header.addIconButton("arrow-left", this.input.getHistoryBackAria(), () => void this.goBack());
        this.header.el.prepend(this.historyBackButtonEl, this.historyForwardButtonEl);
        this.updateHistoryButtons();
        this.navigator = new BibleNavigatorPanel(this.rootEl, {
            getBooks: () => {
                const translationId = this.location?.translationId ?? this.input.getActiveTranslationId();
                return translationId === null ? [] : this.input.getNavigatorBooks(translationId);
            },
            getLabels: () => this.input.getNavigatorLabels(),
            onOpenChapter: (target) => void this.openTarget(target),
            // The navigator takes the place of the text while it is open.
            onVisibilityChange: (open) => this.textEl?.toggle(!open),
        });
        this.textEl = this.rootEl.createDiv({ cls: ["bible-preview-pane-content", "bible-reader-content"] });
    }

    // A chapter picked in the navigator: in the reader's translation, highlighted verses become its origin.
    private async openTarget(target: BibleChapterTarget): Promise<void> {
        const translationId = this.location?.translationId ?? this.input.getActiveTranslationId();
        if (translationId === null) return;
        this.origin = { target, translationId };
        this.highlightsHidden = false;
        await this.show({ target, translationId });
    }

    private async goBack(): Promise<void> {
        const entry = this.history.back();
        if (entry !== null) await this.show(entry, { record: "none" });
        this.updateHistoryButtons();
    }

    private async goForward(): Promise<void> {
        const entry = this.history.forward();
        if (entry !== null) await this.show(entry, { record: "none" });
        this.updateHistoryButtons();
    }

    private updateHistoryButtons(): void {
        if (this.historyBackButtonEl !== null) this.historyBackButtonEl.disabled = !this.history.canGoBack();
        if (this.historyForwardButtonEl !== null) this.historyForwardButtonEl.disabled = !this.history.canGoForward();
    }

    // The same passage in another translation's numbering (Ps 22 Synodal → Ps 23 English), with its highlights.
    private async switchTranslation(translationId: string): Promise<void> {
        const location = this.location;
        if (location === null || translationId === location.translationId) return;
        const target = this.input.mapChapterTarget(location.target, location.translationId, translationId);
        const origin = this.origin;
        if (origin !== null && origin.translationId === location.translationId) {
            this.origin = { target: this.input.mapChapterTarget(origin.target, origin.translationId, translationId), translationId };
        }
        await this.show({ target, translationId });
    }

    private decorateChapterNavigation(titleEl: HTMLElement, translationId: string): void {
        titleEl.addClass("bible-reader-navigator-toggle");
        titleEl.setAttribute("role", "button");
        titleEl.setAttribute("tabindex", "0");
        titleEl.setAttribute("aria-label", this.input.getOpenNavigatorAria());
        titleEl.title = this.input.getOpenNavigatorAria();
        titleEl.createSpan({ cls: "bible-reader-navigator-caret", text: " ▾" });
        const toggle = (): void => this.navigator?.toggle(this.location?.target.book ?? null);
        titleEl.addEventListener("click", (event) => {
            event.preventDefault();
            toggle();
        });
        titleEl.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggle();
        });

        const options = this.input.getTranslationOptions();
        if (options.length <= 1) return;
        const selectEl = createEl("select", { cls: ["dropdown", "bible-reader-translation-select"] });
        selectEl.setAttribute("aria-label", this.input.getTranslationSelectAria());
        selectEl.title = this.input.getTranslationSelectAria();
        for (const option of options) {
            selectEl.createEl("option", { text: option.name, value: option.id });
        }
        selectEl.value = translationId;
        selectEl.addEventListener("change", () => void this.switchTranslation(selectEl.value));
        titleEl.insertAdjacentElement("afterend", selectEl);
    }

    // The header names the reader's own translation.
    private createHeaderInput(): BiblePreviewHeaderInput {
        return {
            getCopyAria: this.input.getCopyAria,
            getTitle: () => {
                const translationId = this.location?.translationId;
                return translationId === undefined ? this.input.getTitle() : `📖 ${this.input.getTranslationTitle(translationId)}`;
            },
        };
    }

    /** `record`: a new history entry (default), the current one updated, or none (moving through the history). */
    private async show(location: BibleReaderLocation, options: { record?: "push" | "replace" | "none"; scrollTop?: number } = {}): Promise<void> {
        const loadId = ++this.loadId;
        const scrollTop = options.scrollTop;
        const content = await this.input.buildChapter(location.target, location.translationId);
        if (loadId !== this.loadId) return;
        if (content === null) {
            if (this.location === null) this.renderEmpty();
            return;
        }
        this.location = location;
        if (options.record === "replace") this.history.replaceCurrent(location);
        else if (options.record !== "none") this.history.push(location);
        this.updateHistoryButtons();
        this.content = scrollTop === undefined ? content : { ...content, scrollTop };
        this.render();
        this.header?.refresh(this.createHeaderInput());
        // The tab title follows the chapter.
        updateLeafHeader(this.leaf);
    }

    private render(): void {
        this.buildLayout();
        const containerEl = this.textEl;
        const content = this.content;
        const location = this.location;
        if (containerEl === null || content === null || location === null) return;

        const translationId = location.translationId;
        renderBiblePreviewContent(containerEl, content, {
            getFindUsagesButtonText: this.input.getFindUsagesButtonText,
            getFindUsagesButtonAria: this.input.getFindUsagesButtonAria,
            onFindUsages: (target) => this.input.onFindUsages(target, translationId, this.leaf),
            getChapterNavigationLabels: this.input.getChapterNavigationLabels,
            onNavigateChapter: (next) => void this.show({
                target: { ...next, highlightedRanges: this.getOriginHighlights(next, translationId) },
                translationId,
            }),
            isChapterHighlightHidden: () => this.highlightsHidden,
            onToggleChapterHighlight: (hidden) => {
                this.highlightsHidden = hidden;
            },
            getChapterUsageCount: (chapter) => this.input.getChapterUsageCount(chapter, translationId),
            getFindChapterUsagesAria: this.input.getFindChapterUsagesAria,
            onFindChapterUsages: (chapter, title) => this.input.onFindChapterUsages(chapter, title, translationId, this.leaf),
            decorateChapterNavigation: (_navigationEl, titleEl) => this.decorateChapterNavigation(titleEl, translationId),
        });
        this.setUsageCountLocation(containerEl, location);
        applyBiblePreviewScroll(containerEl, content);
    }

    // Usage counts are refreshed in place by location (refreshChapterUsageCounts); it must be the index's numbering.
    private setUsageCountLocation(containerEl: HTMLElement, location: BibleReaderLocation): void {
        const buttonEl = containerEl.querySelector<HTMLElement>(`.${CHAPTER_USAGES_BUTTON_CLASS}`);
        if (buttonEl === null) return;
        const usageLocation = this.input.getUsageLocation(location.target, location.translationId);
        buttonEl.dataset.book = String(usageLocation.book);
        buttonEl.dataset.chapter = String(usageLocation.chapter);
    }

    // Returning to the opened chapter keeps its highlighted verses.
    private getOriginHighlights(location: BibleChapterLocation, translationId: string): BibleChapterTarget["highlightedRanges"] {
        const origin = this.origin;
        return origin !== null && origin.translationId === translationId && isSameLocation(location, origin.target)
            ? origin.target.highlightedRanges
            : [];
    }

    private renderEmpty(): void {
        this.buildLayout();
        this.content = null;
        this.textEl?.replaceChildren(createDiv({ cls: "bible-reader-empty", text: this.input.getNoTranslationsText() }));
        updateLeafHeader(this.leaf);
    }

    private async copyText(): Promise<boolean> {
        const text = this.content?.plainText ?? "";
        if (text.length === 0) return false;
        try {
            await navigator.clipboard.writeText(text);
            new Notice(this.input.getCopyNoticeText(), 2500);
            return true;
        } catch (error) {
            console.error("Bible Reference Preview: failed to copy reader text", error);
            return false;
        }
    }
}

function parseOpenState(state: unknown): BibleReaderOpenState | null {
    if (typeof state !== "object" || state === null) return null;
    const value = state as Partial<BibleReaderOpenState>;
    if (!isPositiveInteger(value.book) || !isPositiveInteger(value.chapter)) return null;
    return {
        book: value.book,
        chapter: value.chapter,
        ...(typeof value.translationId === "string" ? { translationId: value.translationId } : {}),
        ...(Array.isArray(value.highlightedRanges) ? { highlightedRanges: value.highlightedRanges } : {}),
    };
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isSameLocation(left: BibleChapterLocation, right: BibleChapterLocation): boolean {
    return left.book === right.book && left.chapter === right.chapter;
}

function stripBookIcon(title: string): string {
    return title.replace(/^📖\s*/u, "");
}

// Not in the public API: refreshes the tab title after the chapter changes.
function updateLeafHeader(leaf: WorkspaceLeaf): void {
    (leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
}
