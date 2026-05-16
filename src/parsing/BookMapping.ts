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
        for (const normalized of createAliasVariants(alias)) {
            if (normalized.length === 0) {
                continue;
            }

            nameToId.set(normalized, bookId);
            getBookAliasSet(bookId, bigBooks, shortBooks).add(normalized);
        }
    };

    const collectGeneratedAlias = (alias: string, bookId: number): void => {
        for (const normalized of createAliasVariants(alias)) {
            if (normalized.length === 0) {
                continue;
            }

            addGeneratedAlias(generatedAliases, normalized, bookId);
        }
    };

    for (const book of books) {
        const bookName = normalizeBookAlias(book.name);
        const bookAbbreviation = normalizeBookAlias(book.abbreviation);

        idToDisplayName.set(book.id, createDisplayName(bookAbbreviation || bookName));

        addAuthoritativeAlias(bookName, book.id);
        addAuthoritativeAlias(bookAbbreviation, book.id);

        for (const alias of book.aliases ?? []) {
            addAuthoritativeAlias(alias, book.id);
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

export function normalizeBookAlias(value: string): string {
    return normalizeSearchText(value)
        .replace(/\./g, "")
        .trim()
        .replace(/\s+/g, " ");
}

function normalizeSearchText(value: string): string {
    return replaceArabicIndicDigits(value)
        .normalize("NFC")
        .toLowerCase()
        .replace(/\u0307/g, "")
        .replace(/ё/g, "е")
        .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}

function replaceArabicIndicDigits(value: string): string {
    return value
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0));
}

function createAliasVariants(value: string): Set<string> {
    const normalized = normalizeBookAlias(value);
    const variants = new Set<string>();

    if (normalized.length === 0) {
        return variants;
    }

    variants.add(normalized);

    const compactLeadingDigit = normalized.replace(/^(\d)\s+/, "$1");
    variants.add(compactLeadingDigit);

    const spacedLeadingDigit = normalized.replace(/^(\d)(?=\S)/, "$1 ");
    variants.add(spacedLeadingDigit);

    return variants;
}

function addGeneratedAlias(aliases: Map<string, Set<number>>, alias: string, bookId: number): void {
    const bookIds = aliases.get(alias) ?? new Set<number>();
    bookIds.add(bookId);
    aliases.set(alias, bookIds);
}

function getBookAliasSet(bookId: number, bigBooks: Set<string>, shortBooks: Set<string>): Set<string> {
    return ONE_CHAPTER_BOOK_IDS.has(bookId) ? shortBooks : bigBooks;
}

function createDisplayName(value: string): string {
    const normalized = normalizeBookAlias(value);

    if (normalized.length === 0) {
        return "";
    }

    if (/^\d\s/.test(normalized)) {
        return `${normalized[0]}${capitalizeFirstLetter(normalized.slice(1).trim())}`;
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