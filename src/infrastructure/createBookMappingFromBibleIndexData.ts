
import { BibleBook } from "../domain/BibleBook";
import { BookMapping, createBookMapping } from "../parsing/BookMapping";
import { BibleIndexData } from "./BibleIndexData";

export function createBookMappingFromBibleIndexData(
    data: BibleIndexData,
    translationId: string,
): BookMapping {
    const translation = data.translations[translationId];

    if (translation === undefined) {
        return createBookMapping([]);
    }

    const books: BibleBook[] = Object.entries(translation.books)
        .map(([bookId, book]) => ({
            id: Number(bookId),
            name: book.name,
            abbreviation: book.abbreviation ?? book.name,
            aliases: book.aliases ?? [],
        }))
        .filter((book) => Number.isInteger(book.id) && book.id > 0)
        .sort((left, right) => left.id - right.id);

    return createBookMapping(books);
}
