import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";

export const REFERENCE_USAGE_VIEW_TYPE = "bible-reference-usage-results";

export type ReferenceUsagePaneViewInput = {
    getTitle(): string;
    getEmptyText(): string;
    getCountText(count: number): string;
    getOpenResultAria(result: ReferenceUsageSearchResult): string;
    onOpenResult(result: ReferenceUsageSearchResult): void;
};

export class ReferenceUsagePaneView extends ItemView {
    private headerEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private titleText = "";
    private results: ReferenceUsageSearchResult[] = [];

    constructor(leaf: WorkspaceLeaf, private input: ReferenceUsagePaneViewInput) {
        super(leaf);
    }

    getViewType(): string {
        return REFERENCE_USAGE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.input.getTitle();
    }

    getIcon(): string {
        return "search";
    }

    async onOpen(): Promise<void> {
        this.renderShell();
        this.renderResults();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    public refreshInput(input: ReferenceUsagePaneViewInput): void {
        this.input = input;
        this.renderShell();
        this.renderResults();
    }

    public setResults(titleText: string, results: ReferenceUsageSearchResult[]): void {
        this.titleText = titleText;
        this.results = results;
        this.renderResults();
    }

    private renderShell(): void {
        this.contentEl.empty();
        this.contentEl.style.display = "flex";
        this.contentEl.style.flexDirection = "column";
        this.contentEl.style.height = "100%";
        this.contentEl.style.padding = "12px";
        this.contentEl.style.boxSizing = "border-box";

        this.headerEl = this.contentEl.createDiv();
        this.headerEl.style.flex = "0 0 auto";
        this.headerEl.style.marginBottom = "10px";

        this.resultsEl = this.contentEl.createDiv();
        this.resultsEl.style.flex = "1 1 auto";
        this.resultsEl.style.overflow = "auto";
        this.resultsEl.style.display = "flex";
        this.resultsEl.style.flexDirection = "column";
        this.resultsEl.style.gap = "8px";
    }

    private renderResults(): void {
        if (this.headerEl === null || this.resultsEl === null) {
            return;
        }

        this.headerEl.empty();
        this.resultsEl.empty();

        const titleEl = this.headerEl.createEl("h3", { text: this.titleText.length > 0 ? this.titleText : this.input.getTitle() });
        titleEl.style.margin = "0 0 6px 0";

        if (this.results.length === 0) {
            this.headerEl.createDiv({ text: this.input.getEmptyText() }).style.color = "var(--text-muted)";
            return;
        }

        const countEl = this.headerEl.createDiv({ text: this.input.getCountText(this.results.length) });
        countEl.style.fontSize = "12px";
        countEl.style.color = "var(--text-muted)";

        for (const result of this.results) {
            this.renderResult(result);
        }
    }

    private renderResult(result: ReferenceUsageSearchResult): void {
        if (this.resultsEl === null) {
            return;
        }

        const rowEl = this.resultsEl.createDiv();
        rowEl.style.border = "1px solid var(--background-modifier-border)";
        rowEl.style.borderRadius = "6px";
        rowEl.style.padding = "8px";
        rowEl.style.background = "var(--background-primary)";

        const buttonEl = rowEl.createEl("button", { text: `${result.filePath}:${result.line}` });
        buttonEl.setAttribute("aria-label", this.input.getOpenResultAria(result));
        buttonEl.style.marginBottom = "6px";
        buttonEl.style.maxWidth = "100%";
        buttonEl.style.overflow = "hidden";
        buttonEl.style.textOverflow = "ellipsis";
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            this.input.onOpenResult(result);
        });

        const sourceEl = rowEl.createDiv({ text: result.sourceText });
        sourceEl.style.fontWeight = "600";

        const excerptEl = rowEl.createDiv({ text: result.excerpt });
        excerptEl.style.fontSize = "12px";
        excerptEl.style.color = "var(--text-muted)";
        excerptEl.style.marginTop = "4px";
    }
}
