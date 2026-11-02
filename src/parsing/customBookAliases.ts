// Book names the user adds to a translation (settings → translation → Book names): kept in the plugin
// settings by translation and book, so a re-import of the translation keeps them.
import type { BibleBook } from "../domain/BibleBook";
import { normalizeBookAlias, removeChapterNumberFromAlias } from "./BookMapping";

/** Book names the user added: by translation id, then by book id. */
export type CustomBookAliases = Record<string, Record<string, string[]>>;

export const MAX_CUSTOM_BOOK_ALIAS_LENGTH = 40;
export const MAX_CUSTOM_BOOK_ALIASES_PER_BOOK = 30;

/**
 * Cleans what the user typed: trimmed, single spaces, no chapter number at the end ("Ин 3" → "Ин"),
 * at least one letter, one entry per normalized form, as typed otherwise.
 */
export function normalizeCustomBookAliases(aliases: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of aliases) {
        const alias = removeChapterNumberFromAlias(raw.trim().replace(/\s+/gu, " ")).trim();
        if (alias.length === 0 || alias.length > MAX_CUSTOM_BOOK_ALIAS_LENGTH || !/\p{L}/u.test(alias)) {
            continue;
        }
        const key = normalizeBookAlias(alias);
        if (key.length === 0 || seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(alias);
        if (result.length >= MAX_CUSTOM_BOOK_ALIASES_PER_BOOK) {
            break;
        }
    }
    return result;
}

/** Splits the text of the edit field: names are separated by commas or semicolons. */
export function parseCustomBookAliasesInput(text: string): string[] {
    return normalizeCustomBookAliases(text.split(/[,;]/u));
}

/** The names a book already has in the translation (from the file and the built-in ones), one per normalized form. */
export function getBookIndexAliases(book: BibleBook): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of [book.name, book.abbreviation, ...(book.aliases ?? [])]) {
        const alias = removeChapterNumberFromAlias(raw).trim();
        const key = normalizeBookAlias(alias);
        if (key.length === 0 || seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(alias);
    }
    return result;
}

export type CustomBookAliasConflict = {
    /** The name as the user typed it. */
    alias: string;
    /** The other book that already has this name. */
    bookId: number;
};

/**
 * Names that another book of the same translation already has: its own names from the file or names the
 * user gave it. Generated prefixes ("Иса", "Мат") are not a conflict: the user's name takes their place.
 */
export function findCustomBookAliasConflicts(books: readonly BibleBook[], bookId: number, aliases: readonly string[]): CustomBookAliasConflict[] {
    const taken = new Map<string, number>();
    for (const book of books) {
        if (book.id === bookId) {
            continue;
        }
        for (const alias of [...getBookIndexAliases(book), ...(book.customAliases ?? [])]) {
            for (const key of getAliasKeys(alias)) {
                if (!taken.has(key)) {
                    taken.set(key, book.id);
                }
            }
        }
    }

    const conflicts: CustomBookAliasConflict[] = [];
    for (const alias of aliases) {
        const otherBookId = getAliasKeys(alias).map((key) => taken.get(key)).find((id) => id !== undefined);
        if (otherBookId !== undefined) {
            conflicts.push({ alias, bookId: otherBookId });
        }
    }
    return conflicts;
}

// "1Ин" and "1 Ин" are the same name for the parser.
function getAliasKeys(alias: string): string[] {
    const normalized = normalizeBookAlias(removeChapterNumberFromAlias(alias));
    if (normalized.length === 0) {
        return [];
    }
    return [...new Set([normalized, normalized.replace(/^(\d)\s+/u, "$1"), normalized.replace(/^(\d)(?=\S)/u, "$1 ")])];
}
