// What the reference suggestions offer for typed text: the reference once it is complete, else the books it starts.
import { filterNavigatorBooks, type NavigatorBook } from "../application/BibleNavigatorModel";
import type { BibleInsertFormat } from "./BibleTextMarkdown";

export type ReferenceSuggestion =
    | { kind: "book"; book: NavigatorBook }
    | { kind: "reference"; text: string }
    | { kind: "reference-with-text"; text: string; format?: BibleInsertFormat };

const MAX_BOOK_SUGGESTIONS = 8;

/**
 * Typed text that is one whole reference ("Ин 3:16") gives the reference and the reference with its text
 * in each of the formats (a callout, a collapsed callout, a bible block);
 * other text gives the books whose names start with it, from every translation, without repeats.
 */
export function getReferenceSuggestions(
    query: string,
    books: NavigatorBook[],
    parseMatches: (text: string) => { from: number; to: number }[],
    options: { withText: boolean; formats?: BibleInsertFormat[] },
): ReferenceSuggestion[] {
    const text = query.trim();
    if (text.length === 0) return [];
    const matches = parseMatches(text);
    if (matches.length === 1 && matches[0].from === 0 && matches[0].to === text.length) {
        if (!options.withText) return [{ kind: "reference", text }];
        const formats = options.formats ?? [];
        if (formats.length === 0) return [{ kind: "reference", text }, { kind: "reference-with-text", text }];
        return [{ kind: "reference", text }, ...formats.map((format): ReferenceSuggestion => ({ kind: "reference-with-text", text, format }))];
    }
    // The chapter and verse are being typed ("Ин 3:1"): a book would drop them.
    if (/\p{L}.*\d/u.test(text)) return [];
    const seen = new Set<string>();
    const suggestions: ReferenceSuggestion[] = [];
    for (const book of filterNavigatorBooks(books, text)) {
        const key = `${book.name}\u0000${book.shortName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({ kind: "book", book });
        if (suggestions.length >= MAX_BOOK_SUGGESTIONS) break;
    }
    return suggestions;
}
