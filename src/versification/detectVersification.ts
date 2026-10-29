import type { VersificationRegistry } from "./VersificationRegistry";

/** The last verse number of every imported chapter, by book id; index 0 of each array is unused. */
export type ChapterVerseCounts = Record<number, number[]>;

export type VersificationScore = {
    key: string;
    matchedChapters: number;
};

export type VersificationDetection = {
    /** The best scheme, or null if no chapter was given. */
    key: string | null;
    /** True when the best scheme fits clearly enough to be used without asking the user. */
    confident: boolean;
    totalChapters: number;
    /** All schemes, best first. */
    scores: VersificationScore[];
};

const MIN_MATCHED_SHARE = 0.95;
const MIN_LEAD_SHARE = 0.02;

/**
 * Picks the scheme whose verse counts match the most chapters. Translations deviate from their scheme
 * in a few places (NWT omits Mark 16:9–20, John 7:53), so the best match, not an exact one, wins.
 * Ties go to the scheme registered first.
 */
export function detectVersification(counts: ChapterVerseCounts, registry: VersificationRegistry): VersificationDetection {
    let totalChapters = 0;
    for (const chapters of Object.values(counts)) {
        totalChapters += chapters.filter((count, chapter) => chapter > 0 && count > 0).length;
    }

    const scores = registry.getAll().map((scheme): VersificationScore => {
        let matchedChapters = 0;
        for (const [book, chapters] of Object.entries(counts)) {
            chapters.forEach((count, chapter) => {
                if (chapter > 0 && count > 0 && scheme.getVerseCount(Number(book), chapter) === count) {
                    matchedChapters += 1;
                }
            });
        }
        return { key: scheme.key, matchedChapters };
    });
    // Array.prototype.sort is stable, so equal scores keep the registration order.
    scores.sort((left, right) => right.matchedChapters - left.matchedChapters);

    const best = scores[0];
    if (totalChapters === 0 || best === undefined) {
        return { key: null, confident: false, totalChapters, scores };
    }

    const secondMatched = scores[1]?.matchedChapters ?? 0;
    const confident = best.matchedChapters / totalChapters >= MIN_MATCHED_SHARE
        && (best.matchedChapters - secondMatched) / totalChapters >= MIN_LEAD_SHARE;
    return { key: best.key, confident, totalChapters, scores };
}
