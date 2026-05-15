import { BibleText, Verse } from "../domain/BibleText";
import { BibleIndex, GetBibleTextInput } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";

export class InMemoryBibleIndex implements BibleIndex {
    constructor(private readonly data: BibleIndexData) {}

    getBibleText(input: GetBibleTextInput): BibleText | null {
        const translation = this.data.translations[input.translationId];
        if (translation === undefined) {
            return null;
        }

        const book = translation.books[String(input.book)];
        if (book === undefined) {
            return null;
        }

        const chapter = book.chapters[String(input.chapter)];
        if (chapter === undefined) {
            return null;
        }

        const availableVerseNumbers = Object.keys(chapter)
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= input.verseStart)
            .sort((left, right) => left - right);

        if (availableVerseNumbers.length === 0) {
            return null;
        }

        const verseEnd = input.verseEnd ?? availableVerseNumbers[availableVerseNumbers.length - 1];
        const verses: Verse[] = [];

        for (const verseNumber of availableVerseNumbers) {
            if (verseNumber > verseEnd) {
                break;
            }

            const verse = chapter[String(verseNumber)];
            if (verse === undefined) {
                continue;
            }

            verses.push({
                number: verseNumber,
                text: verse.text,
                footnotes: [...verse.footnotes],
            });
        }

        if (verses.length === 0) {
            return null;
        }

        return {
            translationId: input.translationId,
            book: input.book,
            bookName: book.name,
            chapter: input.chapter,
            verses,
        };
    }
}
