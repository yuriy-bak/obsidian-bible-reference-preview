import { BibleBook } from "../domain/BibleBook";

export type BookMapping = {
    nameToId: Map<string, number>;
    idToDisplayName: Map<number, string>;
    bigBooks: Set<string>;
    shortBooks: Set<string>;
};

export const ONE_CHAPTER_BOOK_IDS = new Set<number>([31, 57, 63, 64, 65]);

export function createBookMapping(books: BibleBook[]): BookMapping {
    const nameToId = new Map<string, number>();
    const idToDisplayName = new Map<number, string>();
    const bigBooks = new Set<string>();
    const shortBooks = new Set<string>();
    const generatedAliases = new Map<string, Set<number>>();

    const addAuthoritativeAlias = (alias: string, bookId: number): void => {
        const normalized = normalizeBookAlias(alias);
        if (normalized.length === 0) {
            return;
        }

        nameToId.set(normalized, bookId);
        getBookAliasSet(bookId, bigBooks, shortBooks).add(normalized);

        const spacedDigitAlias = addSpaceAfterLeadingDigit(normalized);
        if (spacedDigitAlias !== normalized) {
            nameToId.set(spacedDigitAlias, bookId);
            getBookAliasSet(bookId, bigBooks, shortBooks).add(spacedDigitAlias);
        }
    };

    const collectGeneratedAlias = (alias: string, bookId: number): void => {
        const normalized = normalizeBookAlias(alias);
        if (normalized.length === 0) {
            return;
        }

        addGeneratedAlias(generatedAliases, normalized, bookId);

        const spacedDigitAlias = addSpaceAfterLeadingDigit(normalized);
        if (spacedDigitAlias !== normalized) {
            addGeneratedAlias(generatedAliases, spacedDigitAlias, bookId);
        }
    };

    for (const book of books) {
        const bookName = normalizeBookAlias(book.name);
        const bookAbbreviation = normalizeBookAlias(book.abbreviation);

        idToDisplayName.set(book.id, createDisplayName(bookAbbreviation || bookName));

        addAuthoritativeAlias(bookName, book.id);
        addAuthoritativeAlias(bookAbbreviation, book.id);

        if (bookName === "псалмы") {
            addAuthoritativeAlias("псалом", book.id);
        }

        for (let j = 3; j <= 8; j += 1) {
            if (bookName.length >= j) {
                collectGeneratedAlias(bookName.slice(0, j), book.id);
            }
        }
    }

    for (const [alias, bookIds] of generatedAliases.entries()) {
        if (bookIds.size !== 1) {
            continue;
        }

        const bookId = [...bookIds][0];
        const existingBookId = nameToId.get(alias);

        if (existingBookId !== undefined && existingBookId !== bookId) {
            continue;
        }

        nameToId.set(alias, bookId);
        getBookAliasSet(bookId, bigBooks, shortBooks).add(alias);
    }

    return {
        nameToId,
        idToDisplayName,
        bigBooks,
        shortBooks,
    };
}

export function createFallbackRussianBookMapping(): BookMapping {
    return createBookMapping([
        { id: 19, name: "псалмы", abbreviation: "пс" },
        { id: 43, name: "иоанна", abbreviation: "ин" },
        { id: 45, name: "римлянам", abbreviation: "рим" },
        { id: 46, name: "1коринфянам", abbreviation: "1кор" },
        { id: 65, name: "иуды", abbreviation: "иуд" },
    ]);
}

export function normalizeBookAlias(value: string): string {
    return value
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\./g, "")
        .trim()
        .replace(/\s+/g, " ");
}

function addGeneratedAlias(aliases: Map<string, Set<number>>, alias: string, bookId: number): void {
    const bookIds = aliases.get(alias) ?? new Set<number>();
    bookIds.add(bookId);
    aliases.set(alias, bookIds);
}

function getBookAliasSet(bookId: number, bigBooks: Set<string>, shortBooks: Set<string>): Set<string> {
    return ONE_CHAPTER_BOOK_IDS.has(bookId) ? shortBooks : bigBooks;
}

function addSpaceAfterLeadingDigit(value: string): string {
    if (!/^\d\S/.test(value)) {
        return value;
    }

    return `${value[0]} ${value.slice(1)}`;
}

function createDisplayName(value: string): string {
    const normalized = normalizeBookAlias(value);
    if (normalized.length === 0) {
        return "";
    }

    if (/^\d/.test(normalized)) {
        return `${normalized[0]}${capitalizeFirstLetter(normalized.slice(1))}`;
    }

    return capitalizeFirstLetter(normalized);
}

function capitalizeFirstLetter(value: string): string {
    if (value.length === 0) {
        return value;
    }

    return `${value[0].toUpperCase()}${value.slice(1)}`;
}
