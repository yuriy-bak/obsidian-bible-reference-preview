import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { BiblePreviewContent, renderBiblePreviewContent } from "../application/formatBibleTexts";

export const BIBLE_PREVIEW_VIEW_TYPE = "bible-reference-preview-pane";

export type BiblePreviewPaneViewInput = {
    getTitle(): string;
    getOpenFloatingAria(): string;
    getOpenFloatingIcon(): string;
    getCopyAria(): string;
    getCopyIcon(): string;
    getCopyNoticeText(): string;
    onOpenFloating(content: BiblePreviewContent): void;
};

export class BiblePreviewPaneView extends ItemView {
    private rootEl: HTMLDivElement | null = null;
    private contentContainerEl: HTMLDivElement | null = null;
    private titleEl: HTMLDivElement | null = null;
    private copyButtonEl: HTMLButtonElement | null = null;
    private openFloatingButtonEl: HTMLButtonElement | null = null;
    private currentContent: BiblePreviewContent | null = null;

    constructor(leaf: WorkspaceLeaf, private input: BiblePreviewPaneViewInput) {
        super(leaf);
    }

    getViewType(): string { return BIBLE_PREVIEW_VIEW_TYPE; }
    getDisplayText(): string { return this.input.getTitle(); }
    getIcon(): string { return "book-open"; }

    async onOpen(): Promise<void> {
        this.buildLayout();
        this.renderCurrentContent();
    }

    async onClose(): Promise<void> {
        this.rootEl = null;
        this.contentContainerEl = null;
        this.titleEl = null;
        this.copyButtonEl = null;
        this.openFloatingButtonEl = null;
    }

    setContent(content: BiblePreviewContent): void {
        this.currentContent = content;
        if (this.contentContainerEl === null) this.buildLayout();
        this.renderCurrentContent();
        window.requestAnimationFrame(() => this.renderCurrentContent());
        window.setTimeout(() => this.renderCurrentContent(), 50);
    }

    clearContent(): void {
        this.currentContent = null;
        this.contentContainerEl?.replaceChildren();
    }

    refreshInput(input: BiblePreviewPaneViewInput): void {
        this.input = input;
        if (this.titleEl !== null) this.titleEl.textContent = this.input.getTitle();
        this.updateIconButton(this.copyButtonEl, this.input.getCopyIcon(), this.input.getCopyAria());
        this.updateIconButton(this.openFloatingButtonEl, this.input.getOpenFloatingIcon(), this.input.getOpenFloatingAria());
    }

    private buildLayout(): void {
        const contentRootEl = this.getContentRootElement();
        contentRootEl.empty();

        this.rootEl = contentRootEl.createDiv();
        this.rootEl.style.display = "flex";
        this.rootEl.style.flexDirection = "column";
        this.rootEl.style.height = "100%";
        this.rootEl.style.minHeight = "0";
        this.rootEl.style.overflow = "hidden";
        this.rootEl.style.background = "var(--background-secondary)";
        this.rootEl.style.color = "var(--text-normal)";

        const headerEl = this.rootEl.createDiv();
        headerEl.style.display = "flex";
        headerEl.style.alignItems = "center";
        headerEl.style.gap = "6px";
        headerEl.style.flex = "0 0 auto";
        headerEl.style.padding = "5px 8px";
        headerEl.style.borderBottom = "1px solid var(--background-modifier-border)";
        headerEl.style.background = "var(--background-secondary-alt)";

        this.titleEl = headerEl.createDiv({ text: this.input.getTitle() });
        this.titleEl.style.flex = "1";
        this.titleEl.style.minWidth = "0";
        this.titleEl.style.fontWeight = "600";
        this.titleEl.style.fontSize = "12px";
        this.titleEl.style.lineHeight = "1.2";
        this.titleEl.style.whiteSpace = "nowrap";
        this.titleEl.style.overflow = "hidden";
        this.titleEl.style.textOverflow = "ellipsis";

        this.copyButtonEl = this.createIconButton(this.input.getCopyIcon(), this.input.getCopyAria());
        this.copyButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.copyCurrentText();
        });
        headerEl.appendChild(this.copyButtonEl);

        this.openFloatingButtonEl = this.createIconButton(this.input.getOpenFloatingIcon(), this.input.getOpenFloatingAria());
        this.openFloatingButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.currentContent !== null) this.input.onOpenFloating(this.currentContent);
        });
        headerEl.appendChild(this.openFloatingButtonEl);

        this.contentContainerEl = this.rootEl.createDiv();
        this.contentContainerEl.style.flex = "1 1 auto";
        this.contentContainerEl.style.minHeight = "0";
        this.contentContainerEl.style.overflow = "auto";
        this.contentContainerEl.style.padding = "10px";
        this.contentContainerEl.style.whiteSpace = "pre-wrap";
        this.contentContainerEl.style.userSelect = "text";
        this.contentContainerEl.style.lineHeight = "1.45";
        this.contentContainerEl.style.fontSize = "var(--font-text-size)";
    }

    private createIconButton(text: string, label: string): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        this.updateIconButton(buttonEl, text, label);
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
        return buttonEl;
    }

    private updateIconButton(buttonEl: HTMLButtonElement | null, text: string, label: string): void {
        if (buttonEl === null) return;
        buttonEl.textContent = text;
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
    }

    private getContentRootElement(): HTMLElement {
        const viewWithContentEl = this as ItemView & { contentEl?: HTMLElement };
        if (viewWithContentEl.contentEl instanceof HTMLElement) return viewWithContentEl.contentEl;
        const secondChild = this.containerEl.children.item(1);
        if (secondChild instanceof HTMLElement) return secondChild;
        return this.containerEl;
    }

    private renderCurrentContent(): void {
        if (this.contentContainerEl === null) return;
        this.contentContainerEl.replaceChildren();
        if (this.currentContent !== null) renderBiblePreviewContent(this.contentContainerEl, this.currentContent);
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
