import { BibleReference } from "../domain/BibleReference";
import { BibleIndex } from "../infrastructure/BibleIndex";
import { BibleTextBlock } from "./BibleTextBlock";
import { expandBibleReference } from "./expandBibleReference";

export function getBibleTextBlocks(
    references: BibleReference[],
    bibleIndex: BibleIndex,
    translationId: string,
): BibleTextBlock[] {
    const blocks: BibleTextBlock[] = [];

    for (const reference of references) {
        const parts = expandBibleReference(reference).map((range) => ({
            range,
            bibleText: bibleIndex.getBibleText({
                translationId,
                book: range.book,
                chapter: range.chapter,
                verseStart: range.verseStart,
                verseEnd: range.verseEnd,
            }),
        }));

        const hasAnyVerse = parts.some((part) => part.bibleText !== null && part.bibleText.verses.length > 0);
        if (!hasAnyVerse) {
            continue;
        }

        blocks.push({
            reference,
            parts,
        });
    }

    return blocks;
}
