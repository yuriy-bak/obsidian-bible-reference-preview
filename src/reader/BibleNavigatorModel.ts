// The Bible reader's navigator: books of a translation, filtering them by what is typed and reading
// a typed reference ("Ин 3:16", "1 Кор 13", "Gen") into a chapter to open.
import { normalizeBookAlias, removeChapterNumberFromAlias } from "../parsing/BookMapping";

/** Book ids 1–39 are the Old Testament, 40–66 the New one (USFM order). */
const LAST_OLD_TESTAMENT_BOOK = 39;

export type NavigatorBook = {
    id: number;
    name: string;
    /** For the grid button: the abbreviation, or the name without one. */
    shortName: string;
    /** Unknown in old imports; the navigator then offers the chapters it can probe. */
    chapterCount: number | undefined;
    testament: "old" | "new";
    /** Normalized names and aliases without spaces, to match typed text. */
    searchKeys: string[];
};

export type NavigatorBookSource = {
    id: number;
    name: string;
    abbreviation: string;
    aliases: string[];
    chapterCount?: number;
};

export type NavigatorTarget = {
    book: NavigatorBook;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
};

/** The books in the given order (the translation's own), ready for the grid and the search. */
export function createNavigatorBooks(sources: NavigatorBookSource[], bookOrder: number[]): NavigatorBook[] {
    const byId = new Map(sources.map((source) => [source.id, source]));
    const orderedIds = [...bookOrder.filter((id) => byId.has(id)), ...sources.map((source) => source.id).filter((id) => !bookOrder.includes(id)).sort((left, right) => left - right)];
    return orderedIds.map((id) => {
        const source = byId.get(id) as NavigatorBookSource;
        const name = removeChapterNumberFromAlias(source.name).trim() || source.name;
        const abbreviation = removeChapterNumberFromAlias(source.abbreviation).trim();
        const searchKeys = new Set<string>();
        for (const alias of [name, abbreviation, ...source.aliases]) {
            const key = toSearchKey(alias);
            if (key.length > 0) searchKeys.add(key);
        }
        return {
            id,
            name,
            shortName: abbreviation || name,
            chapterCount: source.chapterCount,
            testament: id <= LAST_OLD_TESTAMENT_BOOK ? "old" : "new",
            searchKeys: [...searchKeys],
        };
    });
}

/** Books whose name or alias starts with the typed book part ("1 кор", "ин"); all books for empty text. */
export function filterNavigatorBooks(books: NavigatorBook[], query: string): NavigatorBook[] {
    const key = toSearchKey(splitNavigatorQuery(query).bookText);
    if (key.length === 0) return books;
    return books.filter((book) => book.searchKeys.some((searchKey) => searchKey.startsWith(key)));
}

/**
 * The book and, when typed, the chapter and verses: "Ин 3:16" → John 3:16; "Ин" → John. An exact name or
 * alias wins over a prefix ("Ин" is John, not a book starting with "Ин…"); a prefix of one book only also works.
 */
export function parseNavigatorQuery(books: NavigatorBook[], query: string): NavigatorTarget | null {
    const { bookText, chapter, verseStart, verseEnd } = splitNavigatorQuery(query);
    const key = toSearchKey(bookText);
    if (key.length === 0) return null;
    const book = books.find((candidate) => candidate.searchKeys.includes(key))
        ?? onlyItem(books.filter((candidate) => candidate.searchKeys.some((searchKey) => searchKey.startsWith(key))));
    if (book === undefined) return null;
    return {
        book,
        ...(chapter === undefined ? {} : { chapter }),
        ...(verseStart === undefined ? {} : { verseStart }),
        ...(verseEnd === undefined ? {} : { verseEnd }),
    };
}

type NavigatorQueryParts = {
    bookText: string;
    chapter?: number;
    verseStart?: number;
    verseEnd?: number;
};

// "1 Кор 13:4-7" → "1 Кор", 13, 4, 7. A leading digit belongs to the book name.
const QUERY_PATTERN = /^\s*(\d?\s*[^\d]*?)\s*(?:(\d+)\s*(?:[:,.]\s*(\d+)\s*(?:[-–—]\s*(\d+))?)?)?\s*$/u;

function splitNavigatorQuery(query: string): NavigatorQueryParts {
    const match = QUERY_PATTERN.exec(query);
    if (match === null) return { bookText: query };
    const [, bookText = "", chapter, verseStart, verseEnd] = match;
    return {
        bookText,
        ...(chapter === undefined ? {} : { chapter: Number(chapter) }),
        ...(verseStart === undefined ? {} : { verseStart: Number(verseStart) }),
        ...(verseEnd === undefined ? {} : { verseEnd: Number(verseEnd) }),
    };
}

function toSearchKey(value: string): string {
    return normalizeBookAlias(value).replace(/\s+/g, "");
}

function onlyItem<T>(items: T[]): T | undefined {
    return items.length === 1 ? items[0] : undefined;
}
