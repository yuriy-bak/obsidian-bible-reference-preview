import { BibleBook } from "../../domain/BibleBook";
import { BookMapping, createBookMapping } from "../../parsing/BookMapping";
import type { CustomBookAliases } from "../../parsing/customBookAliases";
import { getLanguageBookAliases } from "../../parsing/languageBookAliases";
import { BibleIndexV2Data, BibleIndexV2TranslationMetadata } from "./BibleIndexV2Data";

/** Book names of one translation (display names, comparison blocks). */
export function createBookMappingFromBibleIndexV2Data(data: BibleIndexV2Data, translationId: string): BookMapping {
    const translation = data.translations[translationId];
    if (translation === undefined) return createBookMapping([]);

    return createBookMapping(getTranslationBooks(translation));
}

/**
 * Book names for the parser: the main translation in full, plus the names and abbreviations of every other
 * imported translation where they do not clash with the main one. The user's names of each translation
 * (`customAliases`) count as its own.
 */
export function createCombinedBookMappingFromBibleIndexV2Data(
    data: BibleIndexV2Data,
    mainTranslationId: string,
    customAliases: CustomBookAliases = {},
): BookMapping {
    const translation = data.translations[mainTranslationId];
    if (translation === undefined) return createBookMapping([]);

    const otherTranslationsBooks = Object.keys(data.translations)
        .filter((translationId) => translationId !== mainTranslationId)
        .sort()
        .map((translationId) => getTranslationBooks(data.translations[translationId], customAliases[translationId]));

    return createBookMapping(getTranslationBooks(translation, customAliases[mainTranslationId]), otherTranslationsBooks);
}

/** The translation's books with their names from the file and the built-in ones, plus the user's names when given. */
export function getTranslationBooks(translation: BibleIndexV2TranslationMetadata, customAliases?: Record<string, string[]>): BibleBook[] {
    return Object.entries(translation.books)
        .map(([id, book]) => {
            const bookId = Number(id);

            return {
                id: bookId,
                name: book.name,
                abbreviation: book.abbreviation,
                aliases: [
                    ...book.aliases,
                    ...getLanguageBookAliases(translation.language, bookId),
                ],
                chapterCount: book.chapterCount,
                ...(customAliases?.[id] === undefined ? {} : { customAliases: customAliases[id] }),
            };
        })
        .filter((book) => Number.isInteger(book.id) && book.id > 0)
        .sort((left, right) => left.id - right.id);
}
