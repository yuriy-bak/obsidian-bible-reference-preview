import { ItemView, Notice, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import { BiblePreviewHeader, scrollPreviewElement, type BiblePreviewHeaderInput, type BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import { applyBiblePreviewScroll, CHAPTER_USAGES_BUTTON_CLASS, type BiblePreviewChapterNavigationLabels, renderBiblePreviewContent } from "./BiblePreviewRenderer";

export const BIBLE_READER_VIEW_TYPE = "bible-reference-reader";

/** What a reader shows: a chapter of a translation, in that translation's numbering. */
export type BibleReaderLocation = {
    target: BibleChapterTarget;
    translationId: string;
    /** Opened from the reference preview: the navigation bar gets a Back button that shows the preview. */
    fromPreview: boolean;
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
    fromPreview?: boolean;
};

export type BibleReaderViewInput = BiblePreviewHeaderInput & {
    getViewTitle: () => string;
    getCopyNoticeText: () => string;
    getNoTranslationsText: () => string;
    getActiveTranslationId: () => string | null;
    hasTranslation: (translationId: string) => boolean;
    getFirstChapter: (translationId: string) => BibleChapterLocation | null;
    mapChapterLocation: (location: BibleChapterLocation, fromTranslationId: string, toTranslationId: string) => BibleChapterLocation;
    buildChapter: (target: BibleChapterTarget, translationId: string) => Promise<BiblePreviewContent | null>;
    getTranslationTitle: (translationId: string) => string;
    getChapterNavigationLabels: () => BiblePreviewChapterNavigationLabels;
    getOpenChapterAria: (title: string) => string;
    getFindUsagesButtonText: () => string;
    getFindUsagesButtonAria: (target: BiblePreviewUsageTarget) => string;
    getFindChapterUsagesAria: (title: string) => string;
    /** Usages follow the active translation's numbering; the reader passes its own translation along. */
    onFindUsages: (target: BiblePreviewUsageTarget, translationId: string, leaf: WorkspaceLeaf) => void;
    getChapterUsageCount: (location: BibleChapterLocation, translationId: string) => number | null;
    /** The chapter in the numbering of the usage index. */
    getUsageLocation: (location: BibleChapterLocation, translationId: string) => BibleChapterLocation;
    onFindChapterUsages: (location: BibleChapterLocation, title: string, translationId: string, leaf: WorkspaceLeaf) => void;
    onToggleReaderComparison: () => void;
    onBack: () => void;
};

/** "Bible reader": a whole chapter, read only, with the chapter navigation bar. Several readers can be open. */
export class BibleReaderView extends ItemView {
    private rootEl: HTMLDivElement | null = null;
    private textEl: HTMLDivElement | null = null;
    private header: BiblePreviewHeader | null = null;
    private location: BibleReaderLocation | null = null;
    private content: BiblePreviewContent | null = null;
    private highlightsHidden = false;
    /** The chapter the reader was opened at. */
    private origin: Omit<BibleReaderLocation, "fromPreview"> | null = null;
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
        this.header = null;
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
        await this.show({ target, translationId, fromPreview: openState?.fromPreview === true });
    }

    /** Rebuilds the open chapter (translations, comparison or the language changed), keeping the scroll position. */
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
            await this.show({ ...location, translationId: activeTranslationId });
            return;
        }
        await this.show(location, this.textEl?.scrollTop);
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
        this.header = new BiblePreviewHeader(this.rootEl, this.createHeaderInput(), {
            variant: "pane",
            onCopy: () => this.copyText(),
            onToggleComparison: () => this.input.onToggleReaderComparison(),
        });
        this.textEl = this.rootEl.createDiv({ cls: ["bible-preview-pane-content", "bible-reader-content"] });
    }

    // The header names the reader's own translation.
    private createHeaderInput(): BiblePreviewHeaderInput {
        return {
            ...this.input,
            getTitle: () => {
                const translationId = this.location?.translationId;
                return translationId === undefined ? this.input.getTitle() : `📖 ${this.input.getTranslationTitle(translationId)}`;
            },
        };
    }

    private async show(location: BibleReaderLocation, scrollTop?: number): Promise<void> {
        const loadId = ++this.loadId;
        const content = await this.input.buildChapter(location.target, location.translationId);
        if (loadId !== this.loadId) return;
        if (content === null) {
            if (this.location === null) this.renderEmpty();
            return;
        }
        this.location = location;
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
            getOpenChapterAria: this.input.getOpenChapterAria,
            // 📖 at a compared translation reads the chapter in that translation.
            onOpenChapter: (target, targetTranslationId) => void this.show({
                target,
                translationId: targetTranslationId ?? translationId,
                fromPreview: location.fromPreview,
            }),
            getChapterNavigationLabels: this.input.getChapterNavigationLabels,
            onNavigateChapter: (next) => void this.show({
                target: { ...next, highlightedRanges: this.getOriginHighlights(next, translationId) },
                translationId,
                fromPreview: location.fromPreview,
            }),
            onBackFromChapter: location.fromPreview ? () => this.input.onBack() : undefined,
            isChapterHighlightHidden: () => this.highlightsHidden,
            onToggleChapterHighlight: (hidden) => {
                this.highlightsHidden = hidden;
            },
            getChapterUsageCount: (chapter) => this.input.getChapterUsageCount(chapter, translationId),
            getFindChapterUsagesAria: this.input.getFindChapterUsagesAria,
            onFindChapterUsages: (chapter, title) => this.input.onFindChapterUsages(chapter, title, translationId, this.leaf),
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
        ...(value.fromPreview === true ? { fromPreview: true } : {}),
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
