import { BibleText, Verse } from "../../domain/BibleText";
import { BibleIndexV2Data } from "./BibleIndexV2Data";
import { CompactBibleBookData, CompactVerseData } from "./CompactBibleBookData";

type ExtractBibleTextInput = {
    translationId: string;
    book: number;
    bookName: string;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
    data: CompactBibleBookData;
};

type BibleTextQuery = {
    translationId: string;
    book: number;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
};

export function extractBibleTextFromCompactBook(input: ExtractBibleTextInput): BibleText | null;
export function extractBibleTextFromCompactBook(
    metadata: BibleIndexV2Data,
    data: CompactBibleBookData,
    input: BibleTextQuery,
): BibleText | null;
export function extractBibleTextFromCompactBook(
    first: ExtractBibleTextInput | BibleIndexV2Data,
    data?: CompactBibleBookData,
    query?: BibleTextQuery,
): BibleText | null {
    const input = isExtractBibleTextInput(first)
        ? first
        : createExtractBibleTextInput(first, data, query);

    const chapter = input.data.chapters[input.chapter];
    if (chapter === undefined || chapter === null) {
        return null;
    }

    const verses: Verse[] = [];
    const verseEnd = input.verseEnd ?? chapter.length - 1;

    for (let verseNumber = input.verseStart; verseNumber <= verseEnd; verseNumber += 1) {
        const compactVerse = chapter[verseNumber];
        if (compactVerse === undefined || compactVerse === null) {
            continue;
        }

        verses.push(toVerse(verseNumber, compactVerse));
    }

    return {
        translationId: input.translationId,
        book: input.book,
        bookName: input.bookName,
        chapter: input.chapter,
        verses,
    };
}

function isExtractBibleTextInput(value: ExtractBibleTextInput | BibleIndexV2Data): value is ExtractBibleTextInput {
    return "data" in value;
}

function createExtractBibleTextInput(
    metadata: BibleIndexV2Data,
    data: CompactBibleBookData | undefined,
    query: BibleTextQuery | undefined,
): ExtractBibleTextInput {
    if (data === undefined || query === undefined) {
        throw new Error("Invalid compact Bible text extraction arguments.");
    }

    const bookMetadata = metadata.translations[query.translationId]?.books[String(query.book)];

    return {
        translationId: query.translationId,
        book: query.book,
        bookName: bookMetadata?.name ?? String(query.book),
        chapter: query.chapter,
        verseStart: query.verseStart,
        verseEnd: query.verseEnd,
        data,
    };
}

function toVerse(number: number, compactVerse: CompactVerseData): Verse {
    if (typeof compactVerse === "string") {
        return {
            number,
            text: compactVerse,
            footnotes: [],
            paragraphStart: true,
        };
    }

    if (Array.isArray(compactVerse)) {
        return {
            number,
            text: compactVerse[0],
            footnotes: compactVerse[1] ?? [],
            paragraphStart: true,
        };
    }

    return {
        number,
        text: compactVerse.text,
        footnotes: compactVerse.footnotes ?? [],
        paragraphStart: compactVerse.paragraphStart ?? true,
    };
}
