import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { BiblePreviewContent, BiblePreviewReferenceBlock, renderBiblePreviewContent } from "../application/formatBibleTexts";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import { renderComparisonTranslationSelector as renderComparisonTranslationSelectorView } from "./ComparisonTranslationSelector";

export const BIBLE_PREVIEW_VIEW_TYPE = "bible-reference-preview-pane";

export type BiblePreviewScrollCommand = "page-up" | "page-down" | "top" | "bottom";

export type BiblePreviewPaneViewInput = {
    getTitle(): string;
    getOpenFloatingAria(): string;
    getOpenFloatingIcon(): string;
    getCopyAria(): string;
    getCopyIcon(): string;
    getCopyNoticeText(): string;
    getFindUsagesButtonText?(): string;
    getFindUsagesButtonAria?(block: BiblePreviewReferenceBlock): string;
    onFindUsages?(block: BiblePreviewReferenceBlock): void;
    getComparisonButtonText?(): string;
    getComparisonButtonAria?(): string;
    getComparisonTranslationsTitle?(): string;
    getComparisonTranslations?(): PreviewComparisonTranslationOption[];
    onToggleComparisonTranslation?(translationId: string, enabled: boolean): void;
    onToggleComparison?(content: BiblePreviewContent): void;
    onOpenFloating(content: BiblePreviewContent): void;
};

export class BiblePreviewPaneView extends ItemView {
    private rootEl: HTMLDivElement | null = null;
    private contentContainerEl: HTMLDivElement | null = null;
    private contentScrollEl: HTMLElement | null = null;
    private titleEl: HTMLDivElement | null = null;
    private comparisonSelectorEl: HTMLDivElement | null = null;
    private copyButtonEl: HTMLButtonElement | null = null;
    private comparisonButtonEl: HTMLButtonElement | null = null;
    private openFloatingButtonEl: HTMLButtonElement | null = null;
    private currentContent: BiblePreviewContent | null = null;
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
        this.titleEl = null;
        this.comparisonSelectorEl = null;
        this.copyButtonEl = null;
        this.comparisonButtonEl = null;
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

        const delta = Math.max(120, scrollEl.clientHeight * 0.8);
        switch (command) {
            case "page-down":
                scrollEl.scrollTop += delta;
                return true;
            case "page-up":
                scrollEl.scrollTop -= delta;
                return true;
            case "top":
                scrollEl.scrollTop = 0;
                return true;
            case "bottom":
                scrollEl.scrollTop = scrollEl.scrollHeight;
                return true;
        }
    }

    clearContent(): void {
        this.currentContent = null;
        this.cancelScheduledRender();
        this.renderGenerationId += 1;
        this.contentContainerEl?.replaceChildren();
    }

    refreshInput(input: BiblePreviewPaneViewInput): void {
        this.input = input;
        if (this.titleEl !== null) this.titleEl.textContent = this.input.getTitle();
        this.updateIconButton(this.copyButtonEl, this.input.getCopyIcon(), this.input.getCopyAria());
        this.renderComparisonTranslationSelector();
        this.updateComparisonButton();
        this.updateIconButton(this.openFloatingButtonEl, this.input.getOpenFloatingIcon(), this.input.getOpenFloatingAria());
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
        rootEl.style.display = "flex";
        rootEl.style.flexDirection = "column";
        rootEl.style.height = "100%";
        rootEl.style.minHeight = "0";
        rootEl.style.overflow = "hidden";
        rootEl.style.background = "var(--background-secondary)";
        rootEl.style.color = "var(--text-normal)";
    }

    private buildHeader(): void {
        const rootEl = this.rootEl;
        if (rootEl === null) return;

        const headerEl = rootEl.createDiv();
        this.styleHeader(headerEl);

        this.buildTitle(headerEl);
        this.buildComparisonSelectorHost(headerEl);

        this.buildCopyButton(headerEl);
        this.buildComparisonButton(headerEl);
        this.buildOpenFloatingButton(headerEl);
    }

    private styleHeader(headerEl: HTMLElement): void {
        headerEl.style.display = "flex";
        headerEl.style.alignItems = "center";
        headerEl.style.gap = "6px";
        headerEl.style.flex = "0 0 auto";
        headerEl.style.padding = "5px 8px";
        headerEl.style.borderBottom = "1px solid var(--background-modifier-border)";
        headerEl.style.background = "var(--background-secondary-alt)";
    }

    private buildTitle(headerEl: HTMLElement): void {
        this.titleEl = headerEl.createDiv({ text: this.input.getTitle() });
        this.styleTitle(this.titleEl);
    }

    private styleTitle(titleEl: HTMLElement): void {
        titleEl.style.flex = "1";
        titleEl.style.minWidth = "0";
        titleEl.style.fontWeight = "600";
        titleEl.style.fontSize = "12px";
        titleEl.style.lineHeight = "1.2";
        titleEl.style.whiteSpace = "nowrap";
        titleEl.style.overflow = "hidden";
        titleEl.style.textOverflow = "ellipsis";
    }

    private buildComparisonSelectorHost(headerEl: HTMLElement): void {
        this.comparisonSelectorEl = headerEl.createDiv();
        this.styleComparisonSelectorHost(this.comparisonSelectorEl);
        this.comparisonSelectorEl.addEventListener("click", (event) => event.stopPropagation());
    }

    private styleComparisonSelectorHost(hostEl: HTMLElement): void {
        hostEl.style.flex = "1 1 auto";
        hostEl.style.minWidth = "0";
    }

    private buildCopyButton(headerEl: HTMLElement): void {
        this.copyButtonEl = this.createIconButton(this.input.getCopyIcon(), this.input.getCopyAria());
        this.copyButtonEl.addEventListener("click", (event) => this.handleCopyButtonClick(event));
        headerEl.appendChild(this.copyButtonEl);
    }

    private buildComparisonButton(headerEl: HTMLElement): void {
        this.comparisonButtonEl = this.createIconButton(this.input.getComparisonButtonText?.() ?? "⇄", this.input.getComparisonButtonAria?.() ?? this.input.getComparisonButtonText?.() ?? "Compare translations");
        this.updateComparisonButton();
        this.comparisonButtonEl.addEventListener("click", (event) => this.handleComparisonButtonClick(event));
        headerEl.appendChild(this.comparisonButtonEl);
    }

    private buildOpenFloatingButton(headerEl: HTMLElement): void {
        this.openFloatingButtonEl = this.createIconButton(this.input.getOpenFloatingIcon(), this.input.getOpenFloatingAria());
        this.openFloatingButtonEl.addEventListener("click", (event) => this.handleOpenFloatingButtonClick(event));
        headerEl.appendChild(this.openFloatingButtonEl);
    }

    private handleCopyButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        void this.copyCurrentText();
    }

    private handleComparisonButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        if (this.currentContent !== null) this.input.onToggleComparison?.(this.currentContent);
    }

    private handleOpenFloatingButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        if (this.currentContent !== null) this.input.onOpenFloating(this.currentContent);
    }

    private stopHeaderButtonClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    private buildContentContainer(): void {
        const rootEl = this.rootEl;
        if (rootEl === null) return;

        this.contentContainerEl = rootEl.createDiv();
        this.styleContentContainer(this.contentContainerEl);
        this.contentScrollEl = this.contentContainerEl;
    }

    private styleContentContainer(contentContainerEl: HTMLElement): void {
        contentContainerEl.style.flex = "1 1 auto";
        contentContainerEl.style.minHeight = "0";
        contentContainerEl.style.overflow = "auto";
        contentContainerEl.style.padding = "10px";
        contentContainerEl.style.whiteSpace = "pre-wrap";
        contentContainerEl.style.userSelect = "text";
        contentContainerEl.style.lineHeight = "1.45";
        contentContainerEl.style.fontSize = "var(--font-text-size)";
    }

    private createIconButton(text: string, label: string): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        this.updateIconButton(buttonEl, text, label);
        this.styleIconButton(buttonEl);
        return buttonEl;
    }

    private styleIconButton(buttonEl: HTMLButtonElement): void {
        buttonEl.style.width = "26px";
        buttonEl.style.height = "26px";
        buttonEl.style.display = "inline-flex";
        buttonEl.style.alignItems = "center";
        buttonEl.style.justifyContent = "center";
        buttonEl.style.borderRadius = "5px";
        buttonEl.style.border = "1px solid var(--background-modifier-border)";
        buttonEl.style.background = "var(--background-primary)";
        buttonEl.style.color = "var(--text-normal)";
        buttonEl.style.cursor = "pointer";
        buttonEl.style.fontSize = "13px";
        buttonEl.style.lineHeight = "1";
        buttonEl.style.padding = "0";
    }

    private updateIconButton(buttonEl: HTMLButtonElement | null, text: string, label: string): void {
        if (buttonEl === null) return;
        buttonEl.textContent = text;
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
    }

    private updateComparisonButton(): void {
        const buttonEl = this.comparisonButtonEl;
        if (buttonEl === null) return;
        const text = this.input.getComparisonButtonText?.() ?? "⇄";
        const label = this.input.getComparisonButtonAria?.() ?? text;
        this.updateIconButton(buttonEl, text, label);
        buttonEl.style.display = this.input.onToggleComparison === undefined ? "none" : "inline-flex";
    }

    private getContentRootElement(): HTMLElement {
        const viewWithContentEl = this as ItemView & { contentEl?: HTMLElement };
        if (viewWithContentEl.contentEl instanceof HTMLElement) return viewWithContentEl.contentEl;
        const secondChild = this.containerEl.children.item(1);
        if (secondChild instanceof HTMLElement) return secondChild;
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
            renderBiblePreviewContent(this.contentContainerEl, this.currentContent, {
                getFindUsagesButtonText: this.input.getFindUsagesButtonText,
                getFindUsagesButtonAria: this.input.getFindUsagesButtonAria,
                onFindUsages: this.input.onFindUsages,
            });
            this.renderComparisonTranslationSelector();
        } else {
            this.contentContainerEl.replaceChildren();
        }
    }

    private renderComparisonTranslationSelector(): void {
        const hostEl = this.comparisonSelectorEl;
        if (hostEl === null) return;

        hostEl.replaceChildren();
        const options = this.input.getComparisonTranslations?.() ?? [];
        if (options.length <= 1 || this.input.onToggleComparisonTranslation === undefined) {
            hostEl.style.display = "none";
            if (this.titleEl !== null) {
                this.titleEl.style.display = "block";
            }
            return;
        }

        hostEl.style.display = "block";
        if (this.titleEl !== null) {
            this.titleEl.style.display = "none";
        }
        hostEl.appendChild(renderComparisonTranslationSelectorView({
            options,
            getTitle: () => this.input.getComparisonTranslationsTitle?.() ?? "Compare:",
            onToggleTranslation: (translationId, enabled) => this.input.onToggleComparisonTranslation?.(translationId, enabled),
        }));
    }

    private async copyCurrentText(): Promise<void> {
        if (this.currentContent === null || this.currentContent.plainText.length === 0) return;
        try {
            if (navigator.clipboard !== undefined) await navigator.clipboard.writeText(this.currentContent.plainText);
            else this.copyTextFallback(this.currentContent.plainText);
            new Notice(this.input.getCopyNoticeText(), 2500);
        } catch {
            this.copyTextFallback(this.currentContent.plainText);
            new Notice(this.input.getCopyNoticeText(), 2500);
        }
    }

    private copyTextFallback(text: string): void {
        const textareaEl = document.createElement("textarea");
        textareaEl.value = text;
        textareaEl.style.position = "fixed";
        textareaEl.style.left = "-9999px";
        textareaEl.style.top = "0";
        document.body.appendChild(textareaEl);
        textareaEl.focus();
        textareaEl.select();
        document.execCommand("copy");
        textareaEl.remove();
    }
}
