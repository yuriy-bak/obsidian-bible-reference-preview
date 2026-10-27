import type { BibleReference } from "../domain/BibleReference";

export type BibleChapterLocation = {
    book: number;
    chapter: number;
};

export type BibleVerseRange = {
    verseStart: number;
    verseEnd?: number;
};

export type BibleChapterTarget = BibleChapterLocation & {
    highlightedRanges: BibleVerseRange[];
};

export type BibleChapterDirection = -1 | 1;

export type BibleChapterProbe = {
    getBookIds: () => number[];
    getChapterCount: (book: number) => number | undefined;
    hasChapter: (book: number, chapter: number) => Promise<boolean>;
};

// Psalms has 150 chapters; used only for old imports without chapterCount metadata.
const MAX_PROBED_CHAPTER = 150;

export function getChapterTargetFromReferences(references: BibleReference[]): BibleChapterTarget | null {
    const firstReference = references[0];
    if (firstReference === undefined) {
        return null;
    }

    const location = { book: firstReference.book, chapter: firstReference.chapterStart };
    return {
        ...location,
        highlightedRanges: getHighlightedRangesInChapter(references, location),
    };
}

export function getHighlightedRangesInChapter(references: BibleReference[], location: BibleChapterLocation): BibleVerseRange[] {
    return references
        .filter((reference) => reference.book === location.book
            && reference.chapterStart <= location.chapter
            && reference.chapterEnd >= location.chapter)
        .map((reference) => ({
            verseStart: reference.chapterStart === location.chapter ? reference.verseStart : 1,
            verseEnd: reference.chapterEnd === location.chapter ? reference.verseEnd : undefined,
        }));
}

export function isVerseInRanges(verseNumber: number, ranges: BibleVerseRange[]): boolean {
    return ranges.some((range) => verseNumber >= range.verseStart
        && (range.verseEnd === undefined || verseNumber <= range.verseEnd));
}

export function isSameChapterLocation(left: BibleChapterLocation, right: BibleChapterLocation): boolean {
    return left.book === right.book && left.chapter === right.chapter;
}

export async function findAdjacentChapter(
    location: BibleChapterLocation,
    direction: BibleChapterDirection,
    probe: BibleChapterProbe,
): Promise<BibleChapterLocation | null> {
    const bookIds = probe.getBookIds();
    const bookIndex = bookIds.indexOf(location.book);
    if (bookIndex < 0) {
        return null;
    }

    if (direction === 1) {
        const chapterCount = probe.getChapterCount(location.book);
        const hasNextChapterInBook = chapterCount !== undefined
            ? location.chapter < chapterCount
            : await probe.hasChapter(location.book, location.chapter + 1);
        if (hasNextChapterInBook) {
            return { book: location.book, chapter: location.chapter + 1 };
        }

        const nextBook = bookIds[bookIndex + 1];
        return nextBook === undefined ? null : { book: nextBook, chapter: 1 };
    }

    if (location.chapter > 1) {
        return { book: location.book, chapter: location.chapter - 1 };
    }

    const previousBook = bookIds[bookIndex - 1];
    if (previousBook === undefined) {
        return null;
    }

    const lastChapter = await findLastChapter(previousBook, probe);
    return lastChapter === null ? null : { book: previousBook, chapter: lastChapter };
}

async function findLastChapter(book: number, probe: BibleChapterProbe): Promise<number | null> {
    const chapterCount = probe.getChapterCount(book);
    if (chapterCount !== undefined && chapterCount > 0) {
        return chapterCount;
    }

    for (let chapter = MAX_PROBED_CHAPTER; chapter >= 1; chapter -= 1) {
        if (await probe.hasChapter(book, chapter)) {
            return chapter;
        }
    }

    return null;
}
