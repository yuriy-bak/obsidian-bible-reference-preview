import { BibleReference } from "../domain/BibleReference";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";

export function expandBibleReference(reference: BibleReference): ChapterVerseRange[] {
    if (reference.chapterEnd < reference.chapterStart) {
        return [];
    }

    if (reference.chapterStart === reference.chapterEnd) {
        return [{
            book: reference.book,
            chapter: reference.chapterStart,
            verseStart: reference.verseStart,
            verseEnd: reference.verseEnd,
        }];
    }

    const ranges: ChapterVerseRange[] = [{
        book: reference.book,
        chapter: reference.chapterStart,
        verseStart: reference.verseStart,
    }];

    for (let chapter = reference.chapterStart + 1; chapter < reference.chapterEnd; chapter += 1) {
        ranges.push({
            book: reference.book,
            chapter,
            verseStart: 1,
        });
    }

    ranges.push({
        book: reference.book,
        chapter: reference.chapterEnd,
        verseStart: 1,
        verseEnd: reference.verseEnd,
    });

    return ranges;
}
