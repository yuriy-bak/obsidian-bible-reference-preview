import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import { applyBiblePreviewScroll, type BiblePreviewChapterViewInput, createChapterRenderOptions, renderBiblePreviewContent } from "./BiblePreviewRenderer";
import { BiblePreviewHeader, scrollPreviewElement, setHeaderButtonLabel, type BiblePreviewHeaderInput, type BiblePreviewScrollCommand } from "./BiblePreviewHeader";

export const BIBLE_PREVIEW_VIEW_TYPE = "bible-reference-preview-pane";

export type BiblePreviewPaneViewInput = BiblePreviewChapterViewInput & BiblePreviewHeaderInput & {
    getOpenFloatingAria: () => string;
    getOpenFloatingIcon: () => string;
    getCopyNoticeText: () => string;
    getFindUsagesButtonText?: () => string;
    getFindUsagesButtonAria?: (target: BiblePreviewUsageTarget) => string;
    onFindUsages?: (target: BiblePreviewUsageTarget) => void;
    onOpenFloating: (content: BiblePreviewContent) => void;
};

export class BiblePreviewPaneView extends ItemView {
    private rootEl: HTMLDivElement | null = null;
    private contentContainerEl: HTMLDivElement | null = null;
    private contentScrollEl: HTMLElement | null = null;
    private header: BiblePreviewHeader | null = null;
    private openFloatingButtonEl: HTMLButtonElement | null = null;
    private currentContent: BiblePreviewContent | null = null;
    private lastScrolledContent: BiblePreviewContent | null = null;
    private renderAnimationFrameId: number | null = null;
    private renderRetryTimeoutId: number | null = null;
    private renderGenerationId = 0;

    constructor(leaf: WorkspaceLeaf, private input: BiblePreviewPaneViewInput) {
        super(leaf);
    }

    getViewType(): string { return BIBLE_PREVIEW_VIEW_TYPE; }
    getDisplayText(): string { return this.input.getTitle(); }
    getIcon(): string { return "book-open"; }

    async onOpen(): Promise<void> {
        this.buildLayout();
        this.scheduleRender();
    }

    async onClose(): Promise<void> {
        this.cancelScheduledRender();
        this.rootEl = null;
        this.contentContainerEl = null;
        this.contentScrollEl = null;
        this.header = null;
        this.openFloatingButtonEl = null;
    }

    setContent(content: BiblePreviewContent): void {
        this.currentContent = content;
        if (this.contentContainerEl === null) this.buildLayout();
        this.scheduleRender();
    }

    public canScrollPreview(): boolean {
        const scrollEl = this.contentScrollEl;
        return scrollEl !== null && scrollEl.scrollHeight > scrollEl.clientHeight;
    }

    public scrollPreview(command: BiblePreviewScrollCommand): boolean {
        const scrollEl = this.contentScrollEl;
        if (scrollEl === null || scrollEl.clientHeight <= 0 || !this.canScrollPreview()) {
            return false;
        }
        scrollPreviewElement(scrollEl, command);
        return true;
    }

    clearContent(): void {
        this.currentContent = null;
        this.cancelScheduledRender();
        this.renderGenerationId += 1;
        this.contentContainerEl?.replaceChildren();
    }

    refreshInput(input: BiblePreviewPaneViewInput): void {
        this.input = input;
        this.header?.refresh(input);
        if (this.openFloatingButtonEl !== null) setHeaderButtonLabel(this.openFloatingButtonEl, input.getOpenFloatingIcon(), input.getOpenFloatingAria());
        if (this.currentContent !== null) this.scheduleRender();
    }

    private buildLayout(): void {
        const contentRootEl = this.getContentRootElement();
        contentRootEl.empty();

        this.buildRoot(contentRootEl);

        this.buildHeader();
        this.buildContentContainer();
    }

    private buildRoot(contentRootEl: HTMLElement): void {
        this.rootEl = contentRootEl.createDiv();
        this.styleRoot(this.rootEl);
    }

    private styleRoot(rootEl: HTMLElement): void {
        rootEl.addClass("bible-preview-pane-root");
    }

    private buildHeader(): void {
        const rootEl = this.rootEl;
        if (rootEl === null) return;

        this.header = new BiblePreviewHeader(rootEl, this.input, {
            variant: "pane",
            onCopy: () => this.copyCurrentText(),
            onToggleComparison: () => {
                if (this.currentContent !== null) this.input.onToggleComparison?.(this.currentContent);
            },
        });
        this.openFloatingButtonEl = this.header.addButton(this.input.getOpenFloatingIcon(), this.input.getOpenFloatingAria(), () => {
            if (this.currentContent !== null) this.input.onOpenFloating(this.currentContent);
        });
    }

    private buildContentContainer(): void {
        const rootEl = this.rootEl;
        if (rootEl === null) return;

        this.contentContainerEl = rootEl.createDiv();
        this.styleContentContainer(this.contentContainerEl);
        this.contentScrollEl = this.contentContainerEl;
    }

    private styleContentContainer(contentContainerEl: HTMLElement): void {
        contentContainerEl.addClass("bible-preview-pane-content");
    }

    private getContentRootElement(): HTMLElement {
        const viewWithContentEl = this as ItemView & { contentEl?: HTMLElement };
        if (viewWithContentEl.contentEl?.instanceOf(HTMLElement)) return viewWithContentEl.contentEl;
        const secondChild = this.containerEl.children.item(1);
        if (secondChild?.instanceOf(HTMLElement)) return secondChild;
        return this.containerEl;
    }

    private scheduleRender(): void {
        this.cancelScheduledRender();
        const generationId = ++this.renderGenerationId;

        this.renderAnimationFrameId = window.requestAnimationFrame(() => {
            this.renderAnimationFrameId = null;
            if (generationId !== this.renderGenerationId) return;

            this.renderCurrentContent();

            if (this.shouldRetryRenderAfterLayout() && generationId === this.renderGenerationId) {
                this.renderRetryTimeoutId = window.setTimeout(() => {
                    this.renderRetryTimeoutId = null;
                    if (generationId === this.renderGenerationId) this.renderCurrentContent();
                }, 50);
            }
        });
    }

    private cancelScheduledRender(): void {
        if (this.renderAnimationFrameId !== null) {
            window.cancelAnimationFrame(this.renderAnimationFrameId);
            this.renderAnimationFrameId = null;
        }

        if (this.renderRetryTimeoutId !== null) {
            window.clearTimeout(this.renderRetryTimeoutId);
            this.renderRetryTimeoutId = null;
        }
    }

    private shouldRetryRenderAfterLayout(): boolean {
        return this.contentContainerEl !== null
            && this.currentContent !== null
            && this.contentContainerEl.clientHeight <= 0;
    }

    private renderCurrentContent(): void {
        if (this.contentContainerEl === null) return;
        if (this.currentContent !== null) {
            const contentContainerEl = this.contentContainerEl;
            renderBiblePreviewContent(contentContainerEl, this.currentContent, {
                ...createChapterRenderOptions(this.input, this.currentContent, () => contentContainerEl.scrollTop),
                getFindUsagesButtonText: this.input.getFindUsagesButtonText,
                getFindUsagesButtonAria: this.input.getFindUsagesButtonAria,
                onFindUsages: this.input.onFindUsages,
            });
            this.applyScrollOnce(contentContainerEl, this.currentContent);
            this.header?.renderComparisonSelector();
        } else {
            this.contentContainerEl.replaceChildren();
        }
    }

    // Re-renders (e.g. label refresh) must not jump the scroll position again.
    private applyScrollOnce(contentContainerEl: HTMLElement, content: BiblePreviewContent): void {
        if (content === this.lastScrolledContent || contentContainerEl.clientHeight <= 0) return;
        this.lastScrolledContent = content;
        applyBiblePreviewScroll(contentContainerEl, content);
    }

    private async copyCurrentText(): Promise<boolean> {
        if (this.currentContent === null || this.currentContent.plainText.length === 0) return false;
        try {
            await navigator.clipboard.writeText(this.currentContent.plainText);
            this.showCopyNotice();
            return true;
        } catch (error) {
            console.error("Bible Reference Preview: failed to copy preview text", error);
            return false;
        }
    }

    private showCopyNotice(): void {
        new Notice(this.input.getCopyNoticeText(), 2500);
    }

}
