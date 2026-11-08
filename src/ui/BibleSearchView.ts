import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { NavigatorBook } from "../application/BibleNavigatorModel";
import { getTextSearchHighlights, parseTextSearchQuery, type SearchableVerse, type TextSearchScope } from "../search/BibleTextSearch";
import { ICONS } from "./Icons";

export const BIBLE_SEARCH_VIEW_TYPE = "bible-text-search";

const SEARCH_DELAY_MS = 300;
const RESULTS_PAGE_SIZE = 500;

export type BibleSearchViewLabels = {
    title: string;
    placeholder: string;
    hint: string;
    translationAria: string;
    scopeAria: string;
    scopeAll: string;
    scopeOld: string;
    scopeNew: string;
    empty: string;
    showMore: string;
    count: (count: number) => string;
    loading: (progress: { loadedBooks: number; totalBooks: number }) => string;
};

export type BibleSearchViewInput = {
    getLabels: () => BibleSearchViewLabels;
    /** The imported translations in the settings order. */
    getTranslations: () => { id: string; name: string }[];
    getDefaultTranslationId: () => string | null;
    getBooks: (translationId: string) => NavigatorBook[];
    search: (
        query: string,
        translationId: string,
        scope: TextSearchScope,
        onProgress: (progress: { loadedBooks: number; totalBooks: number }) => void,
    ) => Promise<SearchableVerse[]>;
    openResult: (verse: SearchableVerse, translationId: string) => void;
};

/**
 * The "Bible search" panel: words (each matched by its beginning) or a phrase in quotes, in one translation
 * and part of the Bible; results by book, a click opens the chapter in the reader with the verse highlighted.
 */
export class BibleSearchView extends ItemView {
    private translationId: string | null = null;
    private searchScope: TextSearchScope = "all";
    private searchInputEl: HTMLInputElement | null = null;
    private translationSelectEl: HTMLSelectElement | null = null;
    private scopeSelectEl: HTMLSelectElement | null = null;
    private statusEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private searchTimer: number | null = null;
    private searchId = 0;
    private results: SearchableVerse[] = [];
    private shownCount = 0;

    constructor(leaf: WorkspaceLeaf, private input: BibleSearchViewInput) {
        super(leaf);
    }

    getViewType(): string {
        return BIBLE_SEARCH_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.input.getLabels().title;
    }

    getIcon(): string {
        return ICONS.searchText;
    }

    async onOpen(): Promise<void> {
        // The service may have started a search already (it refreshes the view as soon as it exists).
        if (this.searchInputEl === null) this.buildLayout();
    }

    async onClose(): Promise<void> {
        this.cancelScheduledSearch();
        this.searchId += 1;
        this.contentEl.empty();
        this.searchInputEl = null;
    }

    refreshInput(input: BibleSearchViewInput): void {
        this.input = input;
        const query = this.searchInputEl?.value ?? "";
        this.buildLayout();
        if (this.searchInputEl !== null) this.searchInputEl.value = query;
        this.runSearch();
    }

    /** Focuses the field; a query given (from the navigator) is typed in and searched, a translation is picked. */
    start(query?: string, translationId?: string): void {
        if (translationId !== undefined && this.input.getTranslations().some((translation) => translation.id === translationId) && translationId !== this.translationId) {
            this.translationId = translationId;
            this.searchScope = "all";
            this.buildLayout();
        }
        const searchInputEl = this.searchInputEl;
        if (searchInputEl === null) return;
        if (query !== undefined && query.trim().length > 0) {
            searchInputEl.value = query.trim();
            this.runSearch();
        }
        searchInputEl.focus();
        searchInputEl.select();
    }

    getResults(): SearchableVerse[] {
        return this.results;
    }

    private buildLayout(): void {
        const labels = this.input.getLabels();
        const translations = this.input.getTranslations();
        if (this.translationId === null || !translations.some((translation) => translation.id === this.translationId)) {
            this.translationId = this.input.getDefaultTranslationId() ?? translations[0]?.id ?? null;
        }
        const previousQuery = this.searchInputEl?.value ?? "";
        this.contentEl.empty();
        this.contentEl.addClass("bible-search-pane");
        const headerEl = this.contentEl.createDiv({ cls: "bible-search-header" });
        this.searchInputEl = headerEl.createEl("input", {
            cls: "bible-search-input",
            type: "search",
            attr: { placeholder: labels.placeholder, "aria-label": labels.placeholder, spellcheck: "false" },
        });
        this.searchInputEl.value = previousQuery;
        this.searchInputEl.addEventListener("input", () => this.scheduleSearch());
        this.searchInputEl.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            this.runSearch();
        });

        const filtersEl = headerEl.createDiv({ cls: "bible-search-filters" });
        this.translationSelectEl = filtersEl.createEl("select", { cls: "dropdown bible-search-translation", attr: { "aria-label": labels.translationAria } });
        for (const translation of translations) {
            this.translationSelectEl.createEl("option", { value: translation.id, text: translation.name });
        }
        if (this.translationId !== null) this.translationSelectEl.value = this.translationId;
        this.translationSelectEl.addEventListener("change", () => {
            this.translationId = this.translationSelectEl?.value ?? null;
            this.searchScope = "all";
            this.renderScopeOptions(labels);
            this.runSearch();
        });
        this.scopeSelectEl = filtersEl.createEl("select", { cls: "dropdown bible-search-scope", attr: { "aria-label": labels.scopeAria } });
        this.renderScopeOptions(labels);
        this.scopeSelectEl.addEventListener("change", () => {
            const value = this.scopeSelectEl?.value ?? "all";
            this.searchScope = value === "all" || value === "old" || value === "new" ? value : Number(value);
            this.runSearch();
        });

        this.statusEl = headerEl.createDiv({ cls: "bible-search-status" });
        this.resultsEl = this.contentEl.createDiv({ cls: "bible-search-results" });
        this.renderResults();
    }

    private renderScopeOptions(labels: BibleSearchViewLabels): void {
        const selectEl = this.scopeSelectEl;
        if (selectEl === null) return;
        selectEl.empty();
        selectEl.createEl("option", { value: "all", text: labels.scopeAll });
        selectEl.createEl("option", { value: "old", text: labels.scopeOld });
        selectEl.createEl("option", { value: "new", text: labels.scopeNew });
        for (const book of this.translationId === null ? [] : this.input.getBooks(this.translationId)) {
            selectEl.createEl("option", { value: String(book.id), text: book.name });
        }
        selectEl.value = String(this.searchScope);
    }

    private scheduleSearch(): void {
        this.cancelScheduledSearch();
        this.searchTimer = window.setTimeout(() => {
            this.searchTimer = null;
            this.runSearch();
        }, SEARCH_DELAY_MS);
    }

    private cancelScheduledSearch(): void {
        if (this.searchTimer === null) return;
        window.clearTimeout(this.searchTimer);
        this.searchTimer = null;
    }

    private runSearch(): void {
        this.cancelScheduledSearch();
        const searchId = ++this.searchId;
        const query = this.searchInputEl?.value ?? "";
        const translationId = this.translationId;
        if (translationId === null || parseTextSearchQuery(query).length === 0) {
            this.results = [];
            this.renderResults();
            return;
        }
        const labels = this.input.getLabels();
        void this.input.search(query, translationId, this.searchScope, (progress) => {
            if (searchId === this.searchId && progress.loadedBooks < progress.totalBooks) this.statusEl?.setText(labels.loading(progress));
        }).then((results) => {
            if (searchId !== this.searchId) return;
            this.results = results;
            this.shownCount = 0;
            this.renderResults();
        }, (error: unknown) => {
            console.error("Bible Reference Preview: Bible search failed", error);
            if (searchId === this.searchId) this.statusEl?.setText(labels.empty);
        });
    }

    private renderResults(): void {
        const statusEl = this.statusEl;
        const resultsEl = this.resultsEl;
        if (statusEl === null || resultsEl === null) return;
        const labels = this.input.getLabels();
        resultsEl.empty();
        this.shownCount = 0;
        const query = this.searchInputEl?.value ?? "";
        if (parseTextSearchQuery(query).length === 0) {
            statusEl.setText(labels.hint);
            return;
        }
        statusEl.setText(this.results.length === 0 ? labels.empty : labels.count(this.results.length));
        this.renderMoreResults();
    }

    /** The next page of results, grouped by book (a book's group continues across pages). */
    private renderMoreResults(): void {
        const resultsEl = this.resultsEl;
        const translationId = this.translationId;
        if (resultsEl === null || translationId === null) return;
        resultsEl.querySelector(".bible-search-more")?.remove();
        const terms = parseTextSearchQuery(this.searchInputEl?.value ?? "");
        const books = new Map(this.input.getBooks(translationId).map((book) => [book.id, book]));
        const page = this.results.slice(this.shownCount, this.shownCount + RESULTS_PAGE_SIZE);
        let groupEl = resultsEl.lastElementChild as HTMLElement | null;
        for (const verse of page) {
            if (groupEl === null || groupEl.dataset.book !== String(verse.book)) {
                groupEl = this.createGroup(resultsEl, verse.book, books.get(verse.book));
            }
            this.renderResult(groupEl.querySelector<HTMLElement>(".bible-search-group-results") ?? groupEl, verse, books.get(verse.book), terms, translationId);
        }
        this.shownCount += page.length;
        if (this.shownCount < this.results.length) {
            const moreEl = resultsEl.createEl("button", { cls: "bible-search-more", text: this.input.getLabels().showMore });
            moreEl.type = "button";
            moreEl.addEventListener("click", () => this.renderMoreResults());
        }
    }

    private createGroup(resultsEl: HTMLElement, bookId: number, book: NavigatorBook | undefined): HTMLElement {
        const groupEl = resultsEl.createEl("details", { cls: "bible-search-group" });
        groupEl.open = true;
        groupEl.dataset.book = String(bookId);
        const summaryEl = groupEl.createEl("summary", { cls: "bible-search-group-title" });
        summaryEl.createSpan({ text: book?.name ?? String(bookId) });
        summaryEl.createSpan({ cls: "bible-search-group-count", text: String(this.results.filter((verse) => verse.book === bookId).length) });
        groupEl.createDiv({ cls: "bible-search-group-results" });
        return groupEl;
    }

    private renderResult(parentEl: HTMLElement, verse: SearchableVerse, book: NavigatorBook | undefined, terms: ReturnType<typeof parseTextSearchQuery>, translationId: string): void {
        const rowEl = parentEl.createDiv({ cls: "bible-search-result", attr: { role: "button", tabindex: "0" } });
        const verseNumber = verse.verseEnd === undefined ? String(verse.verse) : `${verse.verse}–${verse.verseEnd}`;
        rowEl.createSpan({ cls: "bible-search-result-reference", text: `${book?.shortName ?? verse.book} ${verse.chapter}:${verseNumber}` });
        const textEl = rowEl.createSpan({ cls: "bible-search-result-text" });
        let position = 0;
        for (const [start, end] of getTextSearchHighlights(verse.text, terms)) {
            if (start > position) textEl.appendText(verse.text.slice(position, start));
            textEl.createEl("mark", { cls: "bible-search-highlight", text: verse.text.slice(start, end) });
            position = end;
        }
        if (position < verse.text.length) textEl.appendText(verse.text.slice(position));
        const open = (): void => this.input.openResult(verse, translationId);
        rowEl.addEventListener("click", (event) => {
            event.preventDefault();
            open();
        });
        rowEl.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            open();
        });
    }
}
