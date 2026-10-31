import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import type { ReferenceUsageResultGroup } from "../reference-usage/ReferenceUsageChapterGroups";
import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";
import { renderReferenceUsageExcerpt } from "./ReferenceUsageExcerpt";

export const REFERENCE_USAGE_VIEW_TYPE = "bible-reference-usage-results";
const REFERENCE_USAGE_REFRESH_PROGRESS_DELAY_MS = 1000;

export type ReferenceUsagePaneQueryResult = {
    results: ReferenceUsageSearchResult[];
    groups?: ReferenceUsageResultGroup[];
};

export type ReferenceUsagePaneBackAction = {
    ariaLabel: string;
    run: () => void;
};

// Kept by the pane so the refresh button can repeat the search after reindexing.
export type ReferenceUsagePaneQuery = {
    titleText: string;
    run: () => ReferenceUsagePaneQueryResult;
    // Set when the search started from the preview: the header then gets a back button.
    back?: ReferenceUsagePaneBackAction;
};

export type ReferenceUsagePaneRefreshProgress = {
    processedFileCount: number;
    totalFileCount: number;
};

export type ReferenceUsagePaneViewInput = {
    getTitle: () => string;
    getBackText: () => string;
    getEmptyText: () => string;
    getCountText: (count: number) => string;
    getOpenResultAria: (result: ReferenceUsageSearchResult) => string;
    onOpenResult: (result: ReferenceUsageSearchResult) => void;
    getRefreshAria: () => string;
    getRefreshProgressText: (progress: ReferenceUsagePaneRefreshProgress) => string;
    refreshIndex: (onProgress: (progress: ReferenceUsagePaneRefreshProgress) => void) => Promise<boolean>;
};

export class ReferenceUsagePaneView extends ItemView {
    private headerEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private query: ReferenceUsagePaneQuery | null = null;
    private results: ReferenceUsageSearchResult[] = [];
    private groups: ReferenceUsageResultGroup[] | null = null;
    private refreshInProgress = false;
    private refreshProgressText: string | null = null;

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

    public setQuery(query: ReferenceUsagePaneQuery): void {
        this.query = query;
        this.runQuery();
        this.renderResults();
    }

    private runQuery(): void {
        const queryResult = this.query?.run() ?? { results: [] };
        this.results = queryResult.results;
        this.groups = queryResult.groups ?? null;
    }

    private async refreshIndex(): Promise<void> {
        if (this.refreshInProgress) {
            return;
        }
        this.refreshInProgress = true;
        this.renderResults();
        let latestProgress: ReferenceUsagePaneRefreshProgress | null = null;
        const progressTimeout = window.setTimeout(() => {
            this.refreshProgressText = latestProgress === null ? null : this.input.getRefreshProgressText(latestProgress);
            this.renderResults();
        }, REFERENCE_USAGE_REFRESH_PROGRESS_DELAY_MS);
        try {
            const updated = await this.input.refreshIndex((progress) => {
                latestProgress = progress;
                if (this.refreshProgressText !== null) {
                    this.refreshProgressText = this.input.getRefreshProgressText(progress);
                    this.renderProgressText();
                }
            });
            if (updated) {
                this.runQuery();
            }
        } finally {
            window.clearTimeout(progressTimeout);
            this.refreshInProgress = false;
            this.refreshProgressText = null;
            this.renderResults();
        }
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

        const titleRowEl = this.headerEl.createDiv({ cls: "bible-reference-usage-pane-title-row" });
        this.renderBackButton(titleRowEl);
        titleRowEl.createEl("h3", {
            text: this.query !== null && this.query.titleText.length > 0 ? this.query.titleText : this.input.getTitle(),
            cls: "bible-reference-usage-pane-title",
        });
        this.renderRefreshButton(titleRowEl);
        this.headerEl.createDiv({ cls: "bible-reference-usage-pane-progress" });
        this.renderProgressText();

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

    private renderBackButton(containerEl: HTMLElement): void {
        const back = this.query?.back;
        if (back === undefined) {
            return;
        }
        const buttonEl = containerEl.createEl("button", {
            text: this.input.getBackText(),
            cls: "bible-reference-usage-pane-back-button",
            attr: { type: "button", "aria-label": back.ariaLabel, title: back.ariaLabel },
        });
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            back.run();
        });
    }

    private renderRefreshButton(containerEl: HTMLElement): void {
        const buttonEl = containerEl.createEl("button", {
            cls: "clickable-icon bible-reference-usage-pane-refresh-button",
            attr: { type: "button", "aria-label": this.input.getRefreshAria() },
        });
        setIcon(buttonEl, "refresh-cw");
        buttonEl.disabled = this.refreshInProgress;
        buttonEl.toggleClass("is-refreshing", this.refreshInProgress);
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            void this.refreshIndex();
        });
    }

    private renderProgressText(): void {
        const progressEl = this.headerEl?.querySelector<HTMLElement>(".bible-reference-usage-pane-progress") ?? null;
        if (progressEl === null) {
            return;
        }
        progressEl.setText(this.refreshProgressText ?? "");
        progressEl.toggleClass("is-hidden", this.refreshProgressText === null);
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
