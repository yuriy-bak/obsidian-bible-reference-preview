// Full-text search in a translation: the query, the normalized verse text and the matches with their places.
import { normalizeSearchText } from "../parsing/searchTextNormalization";

export type TextSearchTerm = {
    /** Normalized words separated by single spaces. */
    text: string;
    /** In quotes: the words in a row, each whole; otherwise one word matched by its beginning. */
    phrase: boolean;
};

export type TextSearchScope = "all" | "old" | "new" | number;

export type SearchableVerse = {
    book: number;
    chapter: number;
    verse: number;
    verseEnd?: number;
    text: string;
    /** Words of `text` in lower case without accents, separated by single spaces. */
    normalized: string;
};

const LAST_OLD_TESTAMENT_BOOK = 39;
const QUOTED_PHRASE = /["«“„]([^"»”“]*)["»”“]?/gu;
// The breve stays: "й" is not "и"; other accents go ("é" = "e"); "ё" is "е" already.
const DROPPED_MARKS = /(?!̆)\p{M}/gu;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** Words and quoted phrases of the query; an empty list for a query without letters or digits. */
export function parseTextSearchQuery(query: string): TextSearchTerm[] {
    const terms: TextSearchTerm[] = [];
    const rest = query.replace(QUOTED_PHRASE, (_match, phrase: string) => {
        const text = normalizeForTextSearch(phrase).text;
        if (text.length > 0) terms.push({ text, phrase: true });
        return " ";
    });
    for (const word of normalizeForTextSearch(rest).text.split(" ")) {
        if (word.length > 0) terms.push({ text: word, phrase: false });
    }
    return terms;
}

/**
 * The text as words in lower case without accents, separated by single spaces, and for each character of the
 * result the index of the original character it comes from (to highlight matches in the original text).
 */
export function normalizeForTextSearch(text: string): { text: string; sourceIndexes: number[] } {
    let result = "";
    const sourceIndexes: number[] = [];
    let pendingSpace = false;
    let index = 0;
    for (const character of text) {
        const normalized = normalizeSearchText(character.normalize("NFD").replace(DROPPED_MARKS, "")).normalize("NFC");
        for (const part of normalized) {
            if (WORD_CHARACTER.test(part)) {
                if (pendingSpace && result.length > 0) {
                    result += " ";
                    sourceIndexes.push(index);
                }
                pendingSpace = false;
                result += part;
                sourceIndexes.push(index);
            } else if (part.length > 0 && !/\p{M}/u.test(part)) {
                pendingSpace = true;
            }
        }
        index += character.length;
    }
    return { text: result, sourceIndexes };
}

export function createSearchableVerse(verse: Omit<SearchableVerse, "normalized">): SearchableVerse {
    return { ...verse, normalized: normalizeForTextSearch(verse.text).text };
}

export function isBookInScope(book: number, scope: TextSearchScope): boolean {
    if (scope === "all") return true;
    if (scope === "old") return book <= LAST_OLD_TESTAMENT_BOOK;
    if (scope === "new") return book > LAST_OLD_TESTAMENT_BOOK;
    return book === scope;
}

/** Whether every term occurs in the normalized text: a word at a word start, a phrase as whole words. */
export function matchesTextSearch(normalized: string, terms: TextSearchTerm[]): boolean {
    return terms.length > 0 && terms.every((term) => findTermOccurrences(normalized, term, true).length > 0);
}

/** The verses where every term occurs, in the given order; the highlights point into the original text. */
export function searchVerses(verses: Iterable<SearchableVerse>, terms: TextSearchTerm[], scope: TextSearchScope): SearchableVerse[] {
    if (terms.length === 0) return [];
    const found: SearchableVerse[] = [];
    for (const verse of verses) {
        if (isBookInScope(verse.book, scope) && matchesTextSearch(verse.normalized, terms)) found.push(verse);
    }
    return found;
}

/** The ranges of the verse's original text that the terms match, merged where they touch. */
export function getTextSearchHighlights(text: string, terms: TextSearchTerm[]): Array<[number, number]> {
    const { text: normalized, sourceIndexes } = normalizeForTextSearch(text);
    const ranges: Array<[number, number]> = [];
    for (const term of terms) {
        for (const start of findTermOccurrences(normalized, term, false)) {
            const end = term.phrase ? start + term.text.length : findWordEnd(normalized, start);
            const sourceStart = sourceIndexes[start];
            const lastSource = sourceIndexes[end - 1];
            const sourceEnd = lastSource + ((text.codePointAt(lastSource) ?? 0) > 0xffff ? 2 : 1);
            ranges.push([sourceStart, sourceEnd]);
        }
    }
    ranges.sort((left, right) => left[0] - right[0]);
    const merged: Array<[number, number]> = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last !== undefined && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push([...range]);
    }
    return merged;
}

function findTermOccurrences(normalized: string, term: TextSearchTerm, firstOnly: boolean): number[] {
    const starts: number[] = [];
    for (let from = 0; ;) {
        const start = normalized.indexOf(term.text, from);
        if (start < 0) break;
        const end = start + term.text.length;
        const atWordStart = start === 0 || normalized[start - 1] === " ";
        const atWordEnd = !term.phrase || end === normalized.length || normalized[end] === " ";
        if (atWordStart && atWordEnd) {
            starts.push(start);
            if (firstOnly) break;
        }
        from = start + 1;
    }
    return starts;
}

function findWordEnd(normalized: string, start: number): number {
    const end = normalized.indexOf(" ", start);
    return end < 0 ? normalized.length : end;
}
