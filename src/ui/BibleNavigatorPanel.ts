import type { BibleChapterTarget } from "../application/BibleChapterNavigation";
import { filterNavigatorBooks, parseNavigatorQuery, type NavigatorBook } from "../reader/BibleNavigatorModel";

export type BibleNavigatorLabels = {
    searchPlaceholder: string;
    backToBooks: string;
    close: string;
    noBooks: string;
};

export type BibleNavigatorPanelInput = {
    getBooks: () => NavigatorBook[];
    getLabels: () => BibleNavigatorLabels;
    onOpenChapter: (target: BibleChapterTarget) => void;
    onVisibilityChange: (open: boolean) => void;
};

/**
 * The reader's book and chapter picker, shown over the text: a search field, the books as a grid
 * (two groups parted by a line), then the chapters of the chosen book. Enter opens what is typed: "Ин 3:16".
 */
export class BibleNavigatorPanel {
    readonly el: HTMLDivElement;
    private readonly searchEl: HTMLInputElement;
    private readonly bodyEl: HTMLDivElement;
    private currentBookId: number | null = null;
    private chosenBook: NavigatorBook | null = null;
    /** The search text left at the last close; it comes back selected, so typing replaces it. */
    private lastQuery = "";
    /** The books are filtered only once the search text is edited, not by the query brought back. */
    private filtering = false;

    constructor(parentEl: HTMLElement, private readonly input: BibleNavigatorPanelInput) {
        this.el = parentEl.createDiv({ cls: "bible-reader-navigator" });
        this.el.hide();
        const searchRowEl = this.el.createDiv({ cls: "bible-reader-navigator-search-row" });
        this.searchEl = searchRowEl.createEl("input", { cls: "bible-reader-navigator-search", type: "search" });
        this.searchEl.addEventListener("input", () => {
            this.chosenBook = null;
            this.filtering = true;
            this.render();
        });
        this.searchEl.addEventListener("keydown", (event) => this.handleSearchKeydown(event));
        const closeButtonEl = searchRowEl.createEl("button", { cls: "bible-reader-navigator-close", text: "✕" });
        closeButtonEl.type = "button";
        closeButtonEl.addEventListener("click", () => this.close());
        this.bodyEl = this.el.createDiv({ cls: "bible-reader-navigator-body" });
        this.el.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            this.close();
        });
    }

    isOpen(): boolean {
        return this.el.isShown();
    }

    /**
     * Opens on the whole book list with the reader's book marked. The last search is back in the field,
     * selected: typing replaces it, End or a click continues it. Already open, only the books are redrawn.
     */
    open(currentBookId: number | null): void {
        this.currentBookId = currentBookId;
        if (this.isOpen()) {
            this.render();
            return;
        }
        this.chosenBook = null;
        this.filtering = false;
        this.searchEl.value = this.lastQuery;
        this.el.show();
        this.input.onVisibilityChange(true);
        this.render();
        this.searchEl.focus();
        this.searchEl.select();
    }

    close(): void {
        if (!this.isOpen()) return;
        this.lastQuery = this.searchEl.value.trim();
        this.el.hide();
        this.input.onVisibilityChange(false);
    }

    toggle(currentBookId: number | null): void {
        if (this.isOpen()) this.close();
        else this.open(currentBookId);
    }

    private render(): void {
        const labels = this.input.getLabels();
        this.searchEl.placeholder = labels.searchPlaceholder;
        this.searchEl.setAttribute("aria-label", labels.searchPlaceholder);
        const closeButtonEl = this.el.querySelector(".bible-reader-navigator-close");
        closeButtonEl?.setAttribute("aria-label", labels.close);
        this.bodyEl.empty();
        if (this.chosenBook !== null) {
            this.renderChapters(this.chosenBook, labels);
            return;
        }

        const books = filterNavigatorBooks(this.input.getBooks(), this.filtering ? this.searchEl.value : "");
        if (books.length === 0) {
            this.bodyEl.createDiv({ cls: "bible-reader-navigator-empty", text: labels.noBooks });
            return;
        }
        // The two groups of books (ids 1-39 and the rest) are parted by a line, with no names:
        // "Old/New Testament" does not fit every translation.
        const oldBooks = books.filter((book) => book.testament === "old");
        const newBooks = books.filter((book) => book.testament === "new");
        this.renderBookGrid(oldBooks);
        if (oldBooks.length > 0 && newBooks.length > 0) this.bodyEl.createEl("hr", { cls: "bible-reader-navigator-separator" });
        this.renderBookGrid(newBooks);
    }

    private renderBookGrid(books: NavigatorBook[]): void {
        if (books.length === 0) return;
        const gridEl = this.bodyEl.createDiv({ cls: ["bible-reader-navigator-grid", "bible-reader-navigator-books"] });
        for (const book of books) {
            const buttonEl = this.createGridButton(gridEl, book.shortName, book.name, () => this.chooseBook(book));
            buttonEl.toggleClass("is-current", book.id === this.currentBookId);
            buttonEl.dataset.book = String(book.id);
        }
    }

    private renderChapters(book: NavigatorBook, labels: BibleNavigatorLabels): void {
        const headerEl = this.bodyEl.createDiv({ cls: "bible-reader-navigator-chapters-header" });
        const backButtonEl = headerEl.createEl("button", { cls: "bible-reader-navigator-back", text: labels.backToBooks });
        backButtonEl.type = "button";
        backButtonEl.addEventListener("click", () => {
            this.chosenBook = null;
            this.render();
            this.searchEl.focus();
        });
        headerEl.createDiv({ cls: "bible-reader-navigator-book-name", text: book.name });
        const gridEl = this.bodyEl.createDiv({ cls: ["bible-reader-navigator-grid", "bible-reader-navigator-chapters"] });
        for (let chapter = 1; chapter <= (book.chapterCount ?? 1); chapter += 1) {
            this.createGridButton(gridEl, String(chapter), `${book.name} ${chapter}`, () => this.openChapter(book, chapter));
        }
        gridEl.querySelector("button")?.focus();
    }

    private createGridButton(gridEl: HTMLElement, text: string, label: string, onClick: () => void): HTMLButtonElement {
        const buttonEl = gridEl.createEl("button", { cls: "bible-reader-navigator-button", text });
        buttonEl.type = "button";
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            onClick();
        });
        return buttonEl;
    }

    // A book of one chapter (or of unknown chapters, from an old import) opens at once.
    private chooseBook(book: NavigatorBook): void {
        if (book.chapterCount === undefined || book.chapterCount <= 1) {
            this.openChapter(book, 1);
            return;
        }
        this.chosenBook = book;
        this.render();
    }

    private openChapter(book: NavigatorBook, chapter: number, verseStart?: number, verseEnd?: number): void {
        const lastChapter = book.chapterCount ?? chapter;
        this.close();
        this.input.onOpenChapter({
            book: book.id,
            chapter: Math.min(Math.max(chapter, 1), lastChapter),
            highlightedRanges: verseStart === undefined ? [] : [{ verseStart, verseEnd: verseEnd ?? verseStart }],
        });
    }

    // Enter: a typed chapter opens; a book alone (or the only book left) shows its chapters.
    private handleSearchKeydown(event: KeyboardEvent): void {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const books = this.input.getBooks();
        const target = parseNavigatorQuery(books, this.searchEl.value);
        if (target !== null && target.chapter !== undefined) {
            this.openChapter(target.book, target.chapter, target.verseStart, target.verseEnd);
            return;
        }
        const book = target?.book ?? onlyItem(filterNavigatorBooks(books, this.searchEl.value));
        if (book !== undefined) this.chooseBook(book);
    }
}

function onlyItem<T>(items: T[]): T | undefined {
    return items.length === 1 ? items[0] : undefined;
}
