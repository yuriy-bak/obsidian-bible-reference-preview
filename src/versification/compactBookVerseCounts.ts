import type { CompactBibleBookData } from "../infrastructure/v2/CompactBibleBookData";

/** The last verse number of every chapter of a stored book; index 0 is unused, 0 means no verses. */
export function getCompactBookChapterVerseCounts(book: CompactBibleBookData): number[] {
    return book.chapters.map((chapter, chapterNumber) => {
        if (chapterNumber === 0 || chapter === null || chapter === undefined) {
            return 0;
        }
        for (let verse = chapter.length - 1; verse > 0; verse -= 1) {
            if (chapter[verse] !== null && chapter[verse] !== undefined) {
                return verse;
            }
        }
        return 0;
    });
}

