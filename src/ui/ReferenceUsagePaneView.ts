import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ReferenceUsageResultGroup } from "../reference-usage/ReferenceUsageChapterGroups";
import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";
import { renderReferenceUsageExcerpt } from "./ReferenceUsageExcerpt";

export const REFERENCE_USAGE_VIEW_TYPE = "bible-reference-usage-results";

export type ReferenceUsagePaneViewInput = {
    getTitle: () => string;
    getEmptyText: () => string;
    getCountText: (count: number) => string;
    getOpenResultAria: (result: ReferenceUsageSearchResult) => string;
    onOpenResult: (result: ReferenceUsageSearchResult) => void;
};

export class ReferenceUsagePaneView extends ItemView {
    private headerEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private titleText = "";
    private results: ReferenceUsageSearchResult[] = [];
    private groups: ReferenceUsageResultGroup[] | null = null;

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

    public setResults(titleText: string, results: ReferenceUsageSearchResult[], groups?: ReferenceUsageResultGroup[]): void {
        this.titleText = titleText;
        this.results = results;
        this.groups = groups ?? null;
        this.renderResults();
    }

    private renderShell(): void {
        this.contentEl.empty();
        this.contentEl.addClass("bible-reference-usage-pane");

        this.headerEl = this.contentEl.createDiv({ cls: "bible-reference-usage-pane-header" });
        this.resultsEl = this.contentEl.createDiv({ cls: "bible-reference-usage-pane-results" });
    }

    private renderResults(): void {
        if (this.headerEl === null || this.resultsEl === null) {
            return;
        }

        this.headerEl.empty();
        this.resultsEl.empty();

        this.headerEl.createEl("h3", {
            text: this.titleText.length > 0 ? this.titleText : this.input.getTitle(),
            cls: "bible-reference-usage-pane-title",
        });

        if (this.results.length === 0) {
            this.headerEl.createDiv({ text: this.input.getEmptyText(), cls: "bible-reference-usage-pane-muted" });
            return;
        }

        this.headerEl.createDiv({ text: this.input.getCountText(this.results.length), cls: "bible-reference-usage-pane-count" });

        if (this.groups !== null) {
            for (const group of this.groups) {
                this.renderGroup(this.resultsEl, group);
            }
            return;
        }

        for (const result of this.results) {
            this.renderResult(this.resultsEl, result);
        }
    }

    private renderGroup(containerEl: HTMLElement, group: ReferenceUsageResultGroup): void {
        const groupEl = containerEl.createEl("details", { cls: "bible-reference-usage-pane-group" });
        groupEl.open = true;
        const summaryEl = groupEl.createEl("summary", { cls: "bible-reference-usage-pane-group-title" });
        summaryEl.createSpan({ text: group.title });
        summaryEl.createSpan({ text: String(group.results.length), cls: "bible-reference-usage-pane-group-count" });
        const resultsEl = groupEl.createDiv({ cls: "bible-reference-usage-pane-group-results" });
        for (const result of group.results) {
            this.renderResult(resultsEl, result);
        }
    }

    private renderResult(containerEl: HTMLElement, result: ReferenceUsageSearchResult): void {
        const rowEl = containerEl.createDiv({ cls: "bible-reference-usage-results-row bible-reference-usage-pane-row" });

        const buttonEl = rowEl.createEl("button", {
            text: `${result.filePath}:${result.line}`,
            cls: "bible-reference-usage-results-open-button bible-reference-usage-pane-open-button",
        });
        buttonEl.setAttribute("aria-label", this.input.getOpenResultAria(result));
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            this.input.onOpenResult(result);
        });

        rowEl.createDiv({ text: result.sourceText, cls: "bible-reference-usage-source-text" });

        renderReferenceUsageExcerpt(rowEl, result);
    }
}
