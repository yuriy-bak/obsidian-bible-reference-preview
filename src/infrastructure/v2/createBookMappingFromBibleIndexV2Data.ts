import { BibleBook } from "../../domain/BibleBook";
import { BookMapping, createBookMapping } from "../../parsing/BookMapping";
import { BibleIndexV2Data } from "./BibleIndexV2Data";

export function createBookMappingFromBibleIndexV2Data(data: BibleIndexV2Data, translationId: string): BookMapping {
    const translation = data.translations[translationId];
    if (translation === undefined) return createBookMapping([]);
    const books: BibleBook[] = Object.entries(translation.books)
        .map(([id, book]) => ({ id: Number(id), name: book.name, abbreviation: book.abbreviation, aliases: book.aliases }))
        .filter((book) => Number.isInteger(book.id) && book.id > 0)
        .sort((left, right) => left.id - right.id);
    return createBookMapping(books);
}
