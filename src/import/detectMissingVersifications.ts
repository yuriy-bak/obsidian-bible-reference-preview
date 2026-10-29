import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { getCompactBookChapterVerseCounts } from "../versification/compactBookVerseCounts";
import { detectVersification, type ChapterVerseCounts } from "../versification/detectVersification";
import { DEFAULT_VERSIFICATION_KEY, getVersificationRegistry } from "../versification/VersificationRegistry";

/**
 * Translations imported before 0.3.0 have no stored versification: reads their books once, detects the
 * scheme and saves it with the book order. Returns true if the index file changed.
 */
export async function detectMissingVersifications(repository: ObsidianBibleIndexV2Repository): Promise<boolean> {
    const translations = repository.getV2Data()?.translations ?? {};
    let changed = false;

    for (const [translationId, translation] of Object.entries(translations)) {
        if (translation.versification !== undefined) {
            continue;
        }

        const bookIds = Object.keys(translation.books).map(Number).sort((left, right) => left - right);
        const counts: ChapterVerseCounts = {};
        for (const bookId of bookIds) {
            const book = await repository.loadBook(translationId, bookId);
            if (book !== null) {
                counts[bookId] = getCompactBookChapterVerseCounts(book);
            }
        }

        const detection = detectVersification(counts, getVersificationRegistry());
        await repository.updateTranslationVersification(translationId, {
            versification: detection.key ?? DEFAULT_VERSIFICATION_KEY,
            bookOrder: translation.bookOrder ?? bookIds,
        });
        changed = true;
    }

    return changed;
}
