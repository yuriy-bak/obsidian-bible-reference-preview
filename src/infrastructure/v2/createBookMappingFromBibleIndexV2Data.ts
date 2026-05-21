import { BibleBook } from "../../domain/BibleBook";
import { BookMapping, createBookMapping } from "../../parsing/BookMapping";
import { getLanguageBookAliases } from "../../parsing/languageBookAliases";
import { BibleIndexV2Data } from "./BibleIndexV2Data";

export function createBookMappingFromBibleIndexV2Data(data: BibleIndexV2Data, translationId: string): BookMapping {
    const translation = data.translations[translationId];
    if (translation === undefined) return createBookMapping([]);

    const books: BibleBook[] = Object.entries(translation.books)
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
            };
        })
        .filter((book) => Number.isInteger(book.id) && book.id > 0)
        .sort((left, right) => left.id - right.id);

    return createBookMapping(books);
}