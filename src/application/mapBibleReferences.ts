import type { BibleReference } from "../domain/BibleReference";
import type { ChapterVerseRange } from "../domain/ChapterVerseRange";
import type { VersificationRegistry } from "../versification/VersificationRegistry";
import { expandBibleReference } from "./expandBibleReference";

/**
 * The same passages in another numbering scheme: Ps 22:1 of the Synodal scheme is Ps 23:1 in English.
 * A reference may become several (Ps 9:22–39 → Ps 10:1–18); neighbouring verses are joined back into one
 * reference, across a chapter boundary too. Equal or unknown schemes leave the references as they are.
 */
export function mapBibleReferences(
    references: BibleReference[],
    fromKey: string,
    toKey: string,
    registry: VersificationRegistry,
): BibleReference[] {
    const from = registry.get(fromKey);
    const to = registry.get(toKey);
    if (fromKey === toKey || from === null || to === null) {
        return references;
    }

    return references.flatMap((reference) => {
        const chapterCount = from.getChapterVerseCounts(reference.book)?.length;
        const ranges = expandBibleReference(reference, chapterCount)
            .flatMap((range) => registry.mapChapterVerseRange(range, fromKey, toKey));
        return joinRanges(ranges, (book, chapter) => to.getVerseCount(book, chapter));
    });
}

function joinRanges(ranges: ChapterVerseRange[], getVerseCount: (book: number, chapter: number) => number): BibleReference[] {
    const references: BibleReference[] = [];

    for (const range of ranges) {
        const verseEnd = range.verseEnd ?? range.verseStart;
        const last = references[references.length - 1];
        const continuesInChapter = last !== undefined
            && last.chapterEnd === range.chapter
            && last.verseEnd + 1 === range.verseStart;
        const continuesInNextChapter = last !== undefined
            && last.chapterEnd + 1 === range.chapter
            && range.verseStart === 1
            && last.verseEnd === getVerseCount(last.book, last.chapterEnd);

        if (last !== undefined && last.book === range.book && (continuesInChapter || continuesInNextChapter)) {
            last.chapterEnd = range.chapter;
            last.verseEnd = verseEnd;
            continue;
        }

        references.push({
            book: range.book,
            chapterStart: range.chapter,
            verseStart: range.verseStart,
            chapterEnd: range.chapter,
            verseEnd,
        });
    }

    return references;
}
