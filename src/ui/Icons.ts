import { setIcon } from "obsidian";
import { BOOK_ICON } from "../application/BiblePreviewModel";

/** Lucide icons (built into Obsidian) used on the plugin's buttons. */
export const ICONS = {
    book: "book-open",
    openChapter: "book-open-text",
    findUsages: "search",
    highlight: "highlighter",
    back: "undo-2",
    previousChapter: "chevron-left",
    nextChapter: "chevron-right",
    openInPanel: "panel-right",
    openFloating: "picture-in-picture-2",
    collapse: "minus",
    close: "x",
    caret: "chevron-down",
    copy: "copy",
    copied: "check",
    comparison: "library-big",
} as const;

/** Replaces the element's content with a Lucide icon followed by an optional text label. */
export function setIconWithText(el: HTMLElement, icon: string, text?: string): void {
    setIcon(el, icon);
    if (text !== undefined && text.length > 0) {
        el.createSpan({ cls: "bible-preview-icon-text", text });
    }
}

/** Removes the leading 📖 of a model title (the plain-text form keeps it for copying). */
export function stripBookIcon(title: string): string {
    return title.startsWith(BOOK_ICON) ? title.slice(BOOK_ICON.length).trimStart() : title;
}

/** Renders a title that may start with 📖 as the Lucide book icon and the text. */
export function setBookTitle(el: HTMLElement, title: string): void {
    el.empty();
    const text = stripBookIcon(title);
    if (text !== title) {
        setIcon(el.createSpan({ cls: "bible-preview-title-icon" }), ICONS.book);
    }
    el.appendText(text);
}
