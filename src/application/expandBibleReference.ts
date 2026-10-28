import { BibleReference } from "../domain/BibleReference";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";

// Psalms has 150 chapters; caps ranges for old imports without chapterCount metadata.
const MAX_CHAPTER_WITHOUT_METADATA = 150;

export function expandBibleReference(reference: BibleReference, chapterCount?: number): ChapterVerseRange[] {
    if (reference.chapterEnd < reference.chapterStart) {
        return [];
    }

    // A typo like "1:1-2000000:1" must not expand into millions of chapters.
    const maxChapter = chapterCount ?? MAX_CHAPTER_WITHOUT_METADATA;
    if (reference.chapterStart > maxChapter) {
        return [];
    }
    const isChapterEndClamped = reference.chapterEnd > maxChapter;
    const chapterEnd = isChapterEndClamped ? maxChapter : reference.chapterEnd;
    const lastChapterVerseEnd = isChapterEndClamped ? undefined : reference.verseEnd;

    if (reference.chapterStart === chapterEnd) {
        return [{
            book: reference.book,
            chapter: reference.chapterStart,
            verseStart: reference.verseStart,
            verseEnd: lastChapterVerseEnd,
        }];
    }

    const ranges: ChapterVerseRange[] = [{
        book: reference.book,
        chapter: reference.chapterStart,
        verseStart: reference.verseStart,
    }];

    for (let chapter = reference.chapterStart + 1; chapter < chapterEnd; chapter += 1) {
        ranges.push({
            book: reference.book,
            chapter,
            verseStart: 1,
        });
    }

    ranges.push({
        book: reference.book,
        chapter: chapterEnd,
        verseStart: 1,
        verseEnd: lastChapterVerseEnd,
    });

    return ranges;
}
