import { App, Modal, setIcon } from "obsidian";
import { parseCustomBookAliasesInput, type CustomBookAliasConflict } from "../parsing/customBookAliases";
import { normalizeBookAlias } from "../parsing/BookMapping";
import type { BookAliasesEditorBook } from "../translations/TranslationModels";
import { ICONS } from "./Icons";

export type BookAliasesModalI18nKey =
    | "modal.bookAliases.title"
    | "modal.bookAliases.description"
    | "modal.bookAliases.search"
    | "modal.bookAliases.edit"
    | "modal.bookAliases.placeholder"
    | "modal.bookAliases.conflict"
    | "modal.bookAliases.noBooks";

export type BookAliasesModalInput = {
    translationName: string;
    translate: (key: BookAliasesModalI18nKey, params?: Record<string, string | number>) => string;
    getBooks: () => BookAliasesEditorBook[];
    /** Resolves with the names other books already have; nothing is saved then. */
    save: (bookId: number, aliases: string[]) => Promise<CustomBookAliasConflict[]>;
    showError: (message: string) => void;
    onClose: () => void;
};

export function openBookAliasesModal(app: App, input: BookAliasesModalInput): void {
    new BookAliasesModal(app, input).open();
}

/**
 * The books of one translation: the names they already have as chips, the user's own names as chips of
 * another color, and a pencil that turns them into a field (Enter saves, Escape cancels).
 */
class BookAliasesModal extends Modal {
    private books: BookAliasesEditorBook[] = [];
    private query = "";
    private listEl: HTMLElement | null = null;

    constructor(app: App, private readonly input: BookAliasesModalInput) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, input } = this;
        contentEl.empty();
        this.modalEl.addClass("bible-book-aliases-modal");
        this.setTitle(input.translate("modal.bookAliases.title", { translationName: input.translationName }));
        contentEl.createEl("p", { cls: "bible-book-aliases-description", text: input.translate("modal.bookAliases.description") });

        const searchEl = contentEl.createEl("input", {
            cls: "bible-book-aliases-search",
            attr: { type: "search", placeholder: input.translate("modal.bookAliases.search") },
        });
        searchEl.addEventListener("input", () => {
            this.query = searchEl.value;
            this.renderList();
        });

        this.listEl = contentEl.createDiv({ cls: "bible-book-aliases-list" });
        this.books = input.getBooks();
        this.renderList();
    }

    onClose(): void {
        this.contentEl.empty();
        this.input.onClose();
    }

    private renderList(): void {
        const listEl = this.listEl;
        if (listEl === null) {
            return;
        }
        listEl.empty();
        const books = this.books.filter((book) => matchesQuery(book, this.query));
        if (books.length === 0) {
            listEl.createDiv({ cls: "bible-book-aliases-empty", text: this.input.translate("modal.bookAliases.noBooks") });
            return;
        }
        for (const book of books) {
            this.renderBook(listEl.createDiv({ cls: "bible-book-aliases-row" }), book);
        }
    }

    private renderBook(rowEl: HTMLElement, book: BookAliasesEditorBook): void {
        rowEl.empty();
        rowEl.dataset.bookId = String(book.id);
        const infoEl = rowEl.createDiv({ cls: "bible-book-aliases-info" });
        infoEl.createDiv({ cls: "bible-book-aliases-name", text: book.name });
        const chipsEl = infoEl.createDiv({ cls: "bible-book-aliases-chips" });
        for (const alias of book.indexAliases) {
            chipsEl.createSpan({ cls: "bible-book-alias-chip", text: alias });
        }
        for (const alias of book.customAliases) {
            chipsEl.createSpan({ cls: "bible-book-alias-chip mod-custom", text: alias });
        }

        const editButton = rowEl.createEl("button", {
            cls: "clickable-icon bible-book-aliases-edit",
            attr: { type: "button", "aria-label": this.input.translate("modal.bookAliases.edit") },
        });
        setIcon(editButton, ICONS.rename);
        editButton.addEventListener("click", (event) => {
            event.preventDefault();
            this.startEdit(rowEl, infoEl, editButton, book);
        });
    }

    private startEdit(rowEl: HTMLElement, infoEl: HTMLElement, editButton: HTMLElement, book: BookAliasesEditorBook): void {
        editButton.remove();
        infoEl.querySelector(".bible-book-aliases-chips")?.addClass("is-editing");
        const inputEl = infoEl.createEl("input", {
            cls: "bible-book-aliases-input",
            attr: { type: "text", placeholder: this.input.translate("modal.bookAliases.placeholder") },
        });
        inputEl.value = book.customAliases.join(", ");
        const errorEl = infoEl.createDiv({ cls: "bible-book-aliases-error" });
        let busy = false;
        let finished = false;

        const cancel = (): void => {
            if (finished) {
                return;
            }
            finished = true;
            this.renderBook(rowEl, book);
        };
        const save = async (): Promise<void> => {
            if (finished || busy) {
                return;
            }
            const aliases = parseCustomBookAliasesInput(inputEl.value);
            if (aliases.join("\n") === book.customAliases.join("\n")) {
                cancel();
                return;
            }
            busy = true;
            const conflicts = await this.input.save(book.id, aliases);
            busy = false;
            if (conflicts.length > 0) {
                // The field stays open until the name is fixed or the edit is cancelled.
                const message = conflicts
                    .map((conflict) => this.input.translate("modal.bookAliases.conflict", {
                        alias: conflict.alias,
                        book: this.books.find((other) => other.id === conflict.bookId)?.name ?? String(conflict.bookId),
                    }))
                    .join("\n");
                errorEl.setText(message);
                inputEl.addClass("mod-error");
                this.input.showError(message);
                return;
            }
            finished = true;
            this.books = this.input.getBooks();
            const updated = this.books.find((other) => other.id === book.id) ?? book;
            this.renderBook(rowEl, updated);
        };

        inputEl.addEventListener("input", () => {
            errorEl.setText("");
            inputEl.removeClass("mod-error");
        });
        inputEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                void save();
            } else if (event.key === "Escape") {
                // Escape would also close the window.
                event.preventDefault();
                event.stopPropagation();
                cancel();
            }
        });
        inputEl.addEventListener("blur", () => {
            void save();
        });
        inputEl.focus();
    }
}

function matchesQuery(book: BookAliasesEditorBook, query: string): boolean {
    const key = normalizeBookAlias(query).replace(/\s+/gu, "");
    if (key.length === 0) {
        return true;
    }
    return [book.name, ...book.indexAliases, ...book.customAliases]
        .some((alias) => normalizeBookAlias(alias).replace(/\s+/gu, "").includes(key));
}
