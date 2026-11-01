import { ItemView, Notice, setIcon, type Menu, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import { BibleNavigatorPanel, type BibleNavigatorLabels } from "./BibleNavigatorPanel";
import type { NavigatorBook } from "../reader/BibleNavigatorModel";
import { BibleReaderHistory } from "../reader/BibleReaderHistory";
import { ICONS, setBookTitle, stripBookIcon } from "./Icons";
import { scrollPreviewElement, type BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import {
    applyBiblePreviewScroll,
    type BiblePreviewChapterNavigationLabels,
    type BiblePreviewRenderOptions,
    createChapterHighlightToggle,
    createChapterNavigationButton,
    createChapterUsagesButton,
    renderBiblePreviewContent,
} from "./BiblePreviewRenderer";

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

/** Opening state passed with setViewState by the reader service; not saved. Without a chapter the reader opens the book picker. */
export type BibleReaderOpenState = Partial<BibleReaderSavedState> & {
    translationId?: string;
    highlightedRanges?: BibleChapterTarget["highlightedRanges"];
};

export type BibleReaderViewInput = {
    getViewTitle: () => string;
    /** The tab menu item that opens another reader with the book picker. */
    getNewReaderTabText: () => string;
    onOpenNewReaderTab: () => void;
    getCopyAria: () => string;
    getChooseBookText: () => string;
    getHistoryBackAria: () => string;
    getHistoryForwardAria: () => string;
    getCopyNoticeText: () => string;
    getNoTranslationsText: () => string;
    getActiveTranslationId: () => string | null;
    hasTranslation: (translationId: string) => boolean;
    mapChapterLocation: (location: BibleChapterLocation, fromTranslationId: string, toTranslationId: string) => BibleChapterLocation;
    /** The chapter in that translation only, without compared translations. */
    buildChapter: (target: BibleChapterTarget, translationId: string) => Promise<BiblePreviewContent | null>;
    getChapterNavigationLabels: () => BiblePreviewChapterNavigationLabels;
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

const COPIED_FEEDBACK_MS = 1500;

/**
 * "Bible reader": a whole chapter of one translation, read only. One bar on top: back/forward through what the
 * reader showed, the chapter title that opens the book navigator, the translation, usages, highlighting,
 * previous/next chapter and copy. Several readers can be open, each with its own translation.
 */
export class BibleReaderView extends ItemView {
    private rootEl: HTMLDivElement | null = null;
    private barEl: HTMLDivElement | null = null;
    private textEl: HTMLDivElement | null = null;
    private navigator: BibleNavigatorPanel | null = null;
    /** The reader's translation; set before any chapter is open, so the navigator lists its books. */
    private translationId: string | null = null;
    private location: BibleReaderLocation | null = null;
    private content: BiblePreviewContent | null = null;
    private highlightsHidden = false;
    /** The chapter the reader was opened at: its highlights come back when navigating to it again. */
    private origin: BibleReaderLocation | null = null;
    private readonly history = new BibleReaderHistory<BibleReaderLocation>((left, right) =>
        left.translationId === right.translationId && isSameLocation(left.target, right.target));
    private loadId = 0;
    private copyFeedbackTimer: number | null = null;

    constructor(leaf: WorkspaceLeaf, private input: BibleReaderViewInput) {
        super(leaf);
    }

    getViewType(): string { return BIBLE_READER_VIEW_TYPE; }
    getIcon(): string { return "book-open-text"; }

    // The tab's menu (right click or ⋯): another reader in a new tab, for another translation or book.
    onPaneMenu(menu: Menu, source: string): void {
        super.onPaneMenu(menu, source);
        menu.addItem((item) => item
            .setTitle(this.input.getNewReaderTabText())
            .setIcon("plus")
            .onClick(() => this.input.onOpenNewReaderTab()));
    }

    getDisplayText(): string {
        const title = this.content?.chapterView?.title;
        return title === undefined ? this.input.getViewTitle() : stripBookIcon(title);
    }

    getLocation(): BibleReaderLocation | null {
        return this.location;
    }

    getTranslationId(): string | null {
        return this.translationId;
    }

    async onOpen(): Promise<void> {
        this.buildLayout();
    }

    async onClose(): Promise<void> {
        this.loadId += 1;
        this.rootEl = null;
        this.barEl = null;
        this.textEl = null;
        this.navigator = null;
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
        const translationId = openState.translationId !== undefined && this.input.hasTranslation(openState.translationId)
            ? openState.translationId
            : this.input.getActiveTranslationId();
        this.translationId = translationId;
        if (translationId === null) {
            this.renderEmpty();
            return;
        }
        if (openState.book === undefined || openState.chapter === undefined) {
            // Nothing to read yet: the book picker, and no history entry until a chapter is chosen.
            this.renderBar();
            this.openNavigator();
            return;
        }
        const target = { book: openState.book, chapter: openState.chapter, highlightedRanges: openState.highlightedRanges ?? [] };
        this.highlightsHidden = false;
        this.origin = { target, translationId };
        this.navigator?.close();
        await this.show({ target, translationId });
    }

    /** Rebuilds the open chapter (translations or the language changed), keeping the scroll position. */
    async refresh(input: BibleReaderViewInput = this.input): Promise<void> {
        this.input = input;
        if (this.translationId === null || !this.input.hasTranslation(this.translationId)) {
            this.translationId = this.input.getActiveTranslationId();
        }
        const location = this.location;
        if (location === null) {
            if (this.translationId === null) this.renderEmpty();
            else this.renderBar();
            return;
        }
        if (!this.input.hasTranslation(location.translationId)) {
            // The reader's translation was deleted: the same chapter numbers in the active translation.
            if (this.translationId === null) {
                this.location = null;
                this.renderEmpty();
                return;
            }
            await this.show({ ...location, translationId: this.translationId }, { record: "replace" });
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
        // Our own padding: on mobile Obsidian grows the view's bottom padding with the keyboard,
        // while the leaf already stops above it, so the reader would be cut by the keyboard twice.
        containerEl.addClass("bible-reader-view-content");
        this.rootEl = containerEl.createDiv({ cls: ["bible-preview-pane-root", "bible-reader-root"] });
        this.barEl = this.rootEl.createDiv({ cls: ["bible-preview-header", "bible-preview-pane-header", "bible-reader-bar"] });
        this.navigator = new BibleNavigatorPanel(this.rootEl, {
            getBooks: () => this.translationId === null ? [] : this.input.getNavigatorBooks(this.translationId),
            getLabels: () => this.input.getNavigatorLabels(),
            onOpenChapter: (target) => void this.openTarget(target),
            // The navigator takes the place of the text while it is open.
            onVisibilityChange: (open) => this.textEl?.toggle(!open),
        });
        this.textEl = this.rootEl.createDiv({ cls: ["bible-preview-pane-content", "bible-reader-content"] });
        this.renderBar();
    }

    // A chapter picked in the navigator: in the reader's translation, highlighted verses become its origin.
    private async openTarget(target: BibleChapterTarget): Promise<void> {
        const translationId = this.translationId;
        if (translationId === null) return;
        this.origin = { target, translationId };
        this.highlightsHidden = false;
        await this.show({ target, translationId });
    }

    private async goBack(): Promise<void> {
        const entry = this.history.back();
        if (entry !== null) await this.show(entry, { record: "none" });
        this.renderBar();
    }

    private async goForward(): Promise<void> {
        const entry = this.history.forward();
        if (entry !== null) await this.show(entry, { record: "none" });
        this.renderBar();
    }

    // The same passage in another translation's numbering (Ps 22 Synodal → Ps 23 English), with its highlights.
    // Without an open chapter, only the navigator's books change.
    private async switchTranslation(translationId: string): Promise<void> {
        const location = this.location;
        const previousTranslationId = this.translationId;
        if (translationId === previousTranslationId) return;
        this.translationId = translationId;
        if (location === null) {
            this.renderBar();
            if (this.navigator?.isOpen() === true) this.navigator.open(null);
            return;
        }
        const target = this.input.mapChapterTarget(location.target, location.translationId, translationId);
        const origin = this.origin;
        if (origin !== null && origin.translationId === location.translationId) {
            this.origin = { target: this.input.mapChapterTarget(origin.target, origin.translationId, translationId), translationId };
        }
        await this.show({ target, translationId });
    }

    /** `record`: a new history entry (default), the current one updated, or none (moving through the history). */
    private async show(location: BibleReaderLocation, options: { record?: "push" | "replace" | "none"; scrollTop?: number } = {}): Promise<void> {
        const loadId = ++this.loadId;
        const scrollTop = options.scrollTop;
        const content = await this.input.buildChapter(location.target, location.translationId);
        if (loadId !== this.loadId) return;
        if (content === null) {
            if (this.location === null && this.translationId === null) this.renderEmpty();
            return;
        }
        this.location = location;
        this.translationId = location.translationId;
        if (options.record === "replace") this.history.replaceCurrent(location);
        else if (options.record !== "none") this.history.push(location);
        this.content = scrollTop === undefined ? content : { ...content, scrollTop };
        this.navigator?.close();
        this.render();
        // The tab title follows the chapter.
        updateLeafHeader(this.leaf);
        // Obsidian saves view states only with the layout; ask for it so a restart opens this chapter.
        this.app.workspace.requestSaveLayout();
    }

    private render(): void {
        this.buildLayout();
        const containerEl = this.textEl;
        const content = this.content;
        const location = this.location;
        if (containerEl === null || content === null || location === null) return;

        const translationId = location.translationId;
        renderBiblePreviewContent(containerEl, content, {
            getFindUsagesButtonAria: this.input.getFindUsagesButtonAria,
            onFindUsages: (target) => this.input.onFindUsages(target, translationId, this.leaf),
            isChapterHighlightHidden: () => this.highlightsHidden,
        });
        this.renderBar();
        applyBiblePreviewScroll(containerEl, content);
    }

    // The one bar of the reader, rebuilt with each chapter.
    private renderBar(): void {
        const barEl = this.barEl;
        if (barEl === null) return;
        barEl.empty();
        const location = this.location;
        const chapterView = location === null ? undefined : this.content?.chapterView;

        this.createIconButton(barEl, "arrow-left", this.input.getHistoryBackAria(), !this.history.canGoBack(), () => void this.goBack());
        this.createIconButton(barEl, "arrow-right", this.input.getHistoryForwardAria(), !this.history.canGoForward(), () => void this.goForward());
        this.createNavigatorToggle(barEl, chapterView?.title ?? this.input.getChooseBookText());
        this.createTranslationSelect(barEl);
        barEl.createDiv({ cls: "bible-reader-bar-spacer" });

        if (location !== null && chapterView !== undefined && this.textEl !== null) {
            const translationId = location.translationId;
            const labels = this.input.getChapterNavigationLabels();
            const options: BiblePreviewRenderOptions = {
                getChapterUsageCount: (chapter) => this.input.getChapterUsageCount(chapter, translationId),
                getFindChapterUsagesAria: this.input.getFindChapterUsagesAria,
                onFindChapterUsages: (chapter, title) => this.input.onFindChapterUsages(chapter, title, translationId, this.leaf),
            };
            const usagesButtonEl = createChapterUsagesButton(chapterView, options);
            if (usagesButtonEl !== null) {
                // Counts are refreshed in place by location (refreshChapterUsageCounts): the index's numbering.
                const usageLocation = this.input.getUsageLocation(location.target, translationId);
                usagesButtonEl.dataset.book = String(usageLocation.book);
                usagesButtonEl.dataset.chapter = String(usageLocation.chapter);
                barEl.appendChild(usagesButtonEl);
            }
            if (chapterView.highlightedRanges.length > 0) {
                barEl.appendChild(createChapterHighlightToggle(this.textEl, labels, this.highlightsHidden, (hidden) => {
                    this.highlightsHidden = hidden;
                }));
            }
            const previous = chapterView.previous;
            const next = chapterView.next;
            barEl.appendChild(createChapterNavigationButton(ICONS.previousChapter, labels.previousAria, previous !== null, () => {
                if (previous !== null) void this.navigateChapter(previous, translationId);
            }));
            barEl.appendChild(createChapterNavigationButton(ICONS.nextChapter, labels.nextAria, next !== null, () => {
                if (next !== null) void this.navigateChapter(next, translationId);
            }));
        }

        const copyButtonEl = this.createIconButton(barEl, ICONS.copy, this.input.getCopyAria(), this.content === null, () => void this.copyText(copyButtonEl));
    }

    private navigateChapter(location: BibleChapterLocation, translationId: string): Promise<void> {
        return this.show({ target: { ...location, highlightedRanges: this.getOriginHighlights(location, translationId) }, translationId });
    }

    private createIconButton(parentEl: HTMLElement, icon: string, label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
        const buttonEl = parentEl.createEl("button", { cls: ["bible-preview-pane-icon-button", "bible-preview-header-lucide-button"] });
        buttonEl.type = "button";
        buttonEl.disabled = disabled;
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
        setIcon(buttonEl, icon);
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            onClick();
        });
        return buttonEl;
    }

    private createNavigatorToggle(parentEl: HTMLElement, title: string): void {
        const toggleEl = parentEl.createDiv({ cls: "bible-reader-navigator-toggle" });
        setBookTitle(toggleEl, title);
        toggleEl.setAttribute("role", "button");
        toggleEl.setAttribute("tabindex", "0");
        toggleEl.setAttribute("aria-label", this.input.getOpenNavigatorAria());
        toggleEl.title = this.input.getOpenNavigatorAria();
        setIcon(toggleEl.createSpan({ cls: "bible-reader-navigator-caret" }), ICONS.caret);
        const toggle = (): void => this.navigator?.toggle(this.location?.target.book ?? null);
        toggleEl.addEventListener("click", (event) => {
            event.preventDefault();
            toggle();
        });
        toggleEl.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggle();
        });
    }

    // Shown with a single translation too, so the bar always names the translation being read.
    private createTranslationSelect(parentEl: HTMLElement): void {
        const options = this.input.getTranslationOptions();
        if (options.length === 0 || this.translationId === null) return;
        const selectEl = parentEl.createEl("select", { cls: ["dropdown", "bible-reader-translation-select"] });
        selectEl.setAttribute("aria-label", this.input.getTranslationSelectAria());
        selectEl.title = this.input.getTranslationSelectAria();
        for (const option of options) {
            selectEl.createEl("option", { text: option.name, value: option.id });
        }
        selectEl.value = this.translationId;
        selectEl.disabled = options.length === 1;
        selectEl.addEventListener("change", () => void this.switchTranslation(selectEl.value));
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
        this.renderBar();
        this.textEl?.replaceChildren(createDiv({ cls: "bible-reader-empty", text: this.input.getNoTranslationsText() }));
        updateLeafHeader(this.leaf);
    }

    private async copyText(buttonEl: HTMLButtonElement): Promise<void> {
        const text = this.content?.plainText ?? "";
        if (text.length === 0) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            console.error("Bible Reference Preview: failed to copy reader text", error);
            return;
        }
        new Notice(this.input.getCopyNoticeText(), 2500);
        const win = buttonEl.win;
        if (this.copyFeedbackTimer !== null) win.clearTimeout(this.copyFeedbackTimer);
        setIcon(buttonEl, ICONS.copied);
        this.copyFeedbackTimer = win.setTimeout(() => {
            this.copyFeedbackTimer = null;
            setIcon(buttonEl, ICONS.copy);
        }, COPIED_FEEDBACK_MS);
    }
}

function parseOpenState(state: unknown): BibleReaderOpenState {
    if (typeof state !== "object" || state === null) return {};
    const value = state as Partial<BibleReaderOpenState>;
    return {
        ...(isPositiveInteger(value.book) && isPositiveInteger(value.chapter) ? { book: value.book, chapter: value.chapter } : {}),
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

// Not in the public API: refreshes the tab title after the chapter changes.
function updateLeafHeader(leaf: WorkspaceLeaf): void {
    (leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
}
