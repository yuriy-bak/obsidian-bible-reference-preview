import type { BibleChapterLocation } from "../application/BibleChapterNavigation";
import type { BibleReference } from "../domain/BibleReference";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";

export type ReferenceUsageResultGroup = {
    title: string;
    results: ReferenceUsageSearchResult[];
};

// The part of a usage that falls into the chapter; verseEnd is null when the usage runs into the next chapter.
export type ChapterUsageVerseSpan = {
    verseStart: number;
    verseEnd: number | null;
};

export function createChapterUsageQuery(location: BibleChapterLocation): BibleReference {
    return {
        book: location.book,
        chapterStart: location.chapter,
        verseStart: 1,
        chapterEnd: location.chapter,
        verseEnd: Number.MAX_SAFE_INTEGER,
    };
}

export function isWholeChapterUsageSpan(span: ChapterUsageVerseSpan): boolean {
    return span.verseStart === 1 && span.verseEnd === null;
}

// Groups usages by the verses they cover in the chapter: whole-chapter usages first, then in verse order.
export function groupReferenceUsagesByChapterVerses(
    results: ReferenceUsageSearchResult[],
    location: BibleChapterLocation,
    formatTitle: (span: ChapterUsageVerseSpan) => string,
): ReferenceUsageResultGroup[] {
    const groups = new Map<string, { span: ChapterUsageVerseSpan; results: ReferenceUsageSearchResult[] }>();
    for (const result of results) {
        const span = getChapterUsageVerseSpan(result, location);
        const key = `${span.verseStart}-${span.verseEnd ?? "end"}`;
        const group = groups.get(key);
        if (group === undefined) {
            groups.set(key, { span, results: [result] });
        } else {
            group.results.push(result);
        }
    }

    return [...groups.values()]
        .sort((left, right) => compareChapterUsageSpans(left.span, right.span))
        .map((group) => ({ title: formatTitle(group.span), results: group.results }));
}

function getChapterUsageVerseSpan(reference: BibleReference, location: BibleChapterLocation): ChapterUsageVerseSpan {
    return {
        verseStart: reference.chapterStart < location.chapter ? 1 : reference.verseStart,
        verseEnd: reference.chapterEnd > location.chapter ? null : reference.verseEnd,
    };
}

function compareChapterUsageSpans(left: ChapterUsageVerseSpan, right: ChapterUsageVerseSpan): number {
    const leftWhole = isWholeChapterUsageSpan(left);
    const rightWhole = isWholeChapterUsageSpan(right);
    if (leftWhole !== rightWhole) {
        return leftWhole ? -1 : 1;
    }
    return left.verseStart - right.verseStart
        || (left.verseEnd ?? Number.MAX_SAFE_INTEGER) - (right.verseEnd ?? Number.MAX_SAFE_INTEGER);
}
