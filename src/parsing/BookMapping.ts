import { BibleBook } from "../domain/BibleBook";
import { normalizeSearchText } from "./searchTextNormalization";

export type BookMapping = {
    nameToId: Map<string, number>;
    idToDisplayName: Map<number, string>;
    bigBooks: Set<string>;
    shortBooks: Set<string>;
    oneChapterBooks: Set<number>;
};

/**
 * @param books the books of the main translation: all their names, abbreviations and generated prefixes.
 * @param otherTranslationsBooks books of the other imported translations: only their own names, abbreviations
 *   and aliases, added where they do not clash with the main translation; an alias pointing to different books
 *   in different other translations is dropped.
 */
export function createBookMapping(books: BibleBook[], otherTranslationsBooks: BibleBook[][] = []): BookMapping {
    const nameToId = new Map<string, number>();
    const idToDisplayName = new Map<number, string>();
    const bigBooks = new Set<string>();
    const shortBooks = new Set<string>();
    const oneChapterBooks = new Set<number>();
    const generatedAliases = new Map<string, Set<number>>();
    const ambiguousAliases = new Set<string>();

    const addAuthoritativeAlias = (alias: string, bookId: number): void => {
        for (const normalized of createAliasVariants(alias)) {
            if (normalized.length === 0 || ambiguousAliases.has(normalized)) {
                continue;
            }

            const existingBookId = nameToId.get(normalized);
            if (existingBookId !== undefined && existingBookId !== bookId) {
                nameToId.delete(normalized);
                bigBooks.delete(normalized);
                shortBooks.delete(normalized);
                ambiguousAliases.add(normalized);
                continue;
            }

            nameToId.set(normalized, bookId);
            getBookAliasSet(bookId, oneChapterBooks, bigBooks, shortBooks).add(normalized);
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
        if (book.chapterCount === 1) {
            oneChapterBooks.add(book.id);
        }

        const bookName = normalizeBookAlias(removeChapterNumberFromAlias(book.name));
        const bookAbbreviation = normalizeBookAlias(removeChapterNumberFromAlias(book.abbreviation));

        idToDisplayName.set(book.id, createDisplayName(bookAbbreviation || bookName));

        addAuthoritativeAlias(bookName, book.id);
        addAuthoritativeAlias(bookAbbreviation, book.id);

        for (const alias of book.aliases ?? []) {
            addAuthoritativeAlias(removeChapterNumberFromAlias(alias), book.id);
        }

        for (let j = 3; j <= 8; j += 1) {
            if (bookName.length >= j) {
                collectGeneratedAlias(bookName.slice(0, j), book.id);
            }
        }
    }

    for (const [alias, bookIds] of generatedAliases.entries()) {
        if (bookIds.size !== 1 || ambiguousAliases.has(alias)) {
            continue;
        }

        const bookId = [...bookIds][0];
        const existingBookId = nameToId.get(alias);

        if (existingBookId !== undefined && existingBookId !== bookId) {
            continue;
        }

        nameToId.set(alias, bookId);
        getBookAliasSet(bookId, oneChapterBooks, bigBooks, shortBooks).add(alias);
    }

    addOtherTranslationsAliases(otherTranslationsBooks, {
        nameToId,
        idToDisplayName,
        bigBooks,
        shortBooks,
        oneChapterBooks,
    }, ambiguousAliases);

    return {
        nameToId,
        idToDisplayName,
        bigBooks,
        shortBooks,
        oneChapterBooks,
    };
}

function addOtherTranslationsAliases(
    translationsBooks: BibleBook[][],
    mapping: BookMapping,
    mainAmbiguousAliases: ReadonlySet<string>,
): void {
    const otherAliases = new Map<string, Set<number>>();
    const otherBooks = new Map<number, BibleBook>();

    for (const books of translationsBooks) {
        for (const book of books) {
            if (!otherBooks.has(book.id)) {
                otherBooks.set(book.id, book);
            }
            const aliases = [book.name, book.abbreviation, ...(book.aliases ?? [])];
            for (const alias of aliases) {
                for (const normalized of createAliasVariants(removeChapterNumberFromAlias(alias))) {
                    if (normalized.length > 0) {
                        addGeneratedAlias(otherAliases, normalized, book.id);
                    }
                }
            }
        }
    }

    // A book missing from the main translation (deuterocanon) still needs its kind and a display name.
    for (const [bookId, book] of otherBooks) {
        if (mapping.idToDisplayName.has(bookId)) {
            continue;
        }
        if (book.chapterCount === 1) {
            mapping.oneChapterBooks.add(bookId);
        }
        const displayName = createDisplayName(removeChapterNumberFromAlias(book.abbreviation) || removeChapterNumberFromAlias(book.name));
        if (displayName.length > 0) {
            mapping.idToDisplayName.set(bookId, displayName);
        }
    }

    for (const [alias, bookIds] of otherAliases) {
        if (bookIds.size !== 1 || mapping.nameToId.has(alias) || mainAmbiguousAliases.has(alias)) {
            continue;
        }
        const bookId = [...bookIds][0];
        mapping.nameToId.set(alias, bookId);
        getBookAliasSet(bookId, mapping.oneChapterBooks, mapping.bigBooks, mapping.shortBooks).add(alias);
    }
}

export function normalizeBookAlias(value: string): string {
    return normalizeSearchText(value)
        .replace(/\./g, "")
        .trim()
        .replace(/\s+/g, " ");
}

// Book names never end with a number, so a trailing number in an alias is a chapter
// from EPUB navigation ("Иов 1"). Kept as is, it breaks "Иов 14:1" into "Иов 1" + "4:1".
export function removeChapterNumberFromAlias(alias: string): string {
    return alias.replace(/\s*[0-9٠-٩۰-۹]+$/, "");
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

function getBookAliasSet(
    bookId: number,
    oneChapterBooks: Set<number>,
    bigBooks: Set<string>,
    shortBooks: Set<string>,
): Set<string> {
    return oneChapterBooks.has(bookId) ? shortBooks : bigBooks;
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