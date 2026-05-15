import { BibleText, Verse } from "../../domain/BibleText";
import { GetBibleTextInput } from "../BibleIndex";
import { BibleIndexV2Data } from "./BibleIndexV2Data";
import { CompactBibleBookData, CompactVerseData } from "./CompactBibleBookData";

export function extractBibleTextFromCompactBook(
    metadata: BibleIndexV2Data,
    book: CompactBibleBookData,
    input: GetBibleTextInput,
): BibleText | null {
    const bookMetadata = metadata.translations[input.translationId]?.books[String(input.book)];
    const chapter = book.chapters[input.chapter];
    if (bookMetadata === undefined || chapter === undefined || chapter === null) return null;

    const verseEnd = input.verseEnd ?? findLastVerseNumber(chapter);
    const verses: Verse[] = [];
    for (let verseNumber = input.verseStart; verseNumber <= verseEnd; verseNumber += 1) {
        const verseData = chapter[verseNumber];
        if (verseData !== undefined && verseData !== null) verses.push(toVerse(verseNumber, verseData));
    }
    if (verses.length === 0) return null;
    return { translationId: input.translationId, book: input.book, bookName: bookMetadata.name, chapter: input.chapter, verses };
}

function findLastVerseNumber(chapter: Array<CompactVerseData | null>): number {
    for (let index = chapter.length - 1; index >= 0; index -= 1) {
        if (chapter[index] !== undefined && chapter[index] !== null) return index;
    }
    return 0;
}

function toVerse(number: number, data: CompactVerseData): Verse {
    return typeof data === "string"
        ? { number, text: data, footnotes: [] }
        : { number, text: data[0], footnotes: [...data[1]] };
}
