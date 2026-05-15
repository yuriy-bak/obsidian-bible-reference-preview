import { BibleReference } from "../domain/BibleReference";
import { BibleIndex } from "../infrastructure/BibleIndex";
import { BibleTextBlock } from "./BibleTextBlock";
import { expandBibleReference } from "./expandBibleReference";

export async function getBibleTextBlocks(
    references: BibleReference[],
    bibleIndex: BibleIndex,
    translationId: string,
): Promise<BibleTextBlock[]> {
    const blocks: BibleTextBlock[] = [];

    for (const reference of references) {
        const parts = [];
        for (const range of expandBibleReference(reference)) {
            parts.push({
                range,
                bibleText: await bibleIndex.getBibleText({
                    translationId,
                    book: range.book,
                    chapter: range.chapter,
                    verseStart: range.verseStart,
                    verseEnd: range.verseEnd,
                }),
            });
        }

        if (!parts.some((part) => part.bibleText !== null && part.bibleText.verses.length > 0)) {
            continue;
        }

        blocks.push({ reference, parts });
    }

    return blocks;
}
