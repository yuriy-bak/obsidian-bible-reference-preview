import { BibleReference } from "../domain/BibleReference";
import { BibleIndex } from "../infrastructure/BibleIndex";
import { BibleTextBlock } from "./BibleTextBlock";
import { expandBibleReference } from "./expandBibleReference";

export async function getBibleTextBlocks(
    references: BibleReference[],
    bibleIndex: BibleIndex,
    translationId: string,
    sourceText?: string,
): Promise<BibleTextBlock[]> {
    const blocks: BibleTextBlock[] = [];

    for (const reference of references) {
        const parts = [];
        const chapterCount = bibleIndex.getChapterCount?.(translationId, reference.book);
        for (const range of expandBibleReference(reference, chapterCount)) {
            const bibleText = await bibleIndex.getBibleText({
                translationId,
                book: range.book,
                chapter: range.chapter,
                verseStart: range.verseStart,
                verseEnd: range.verseEnd,
            });
            // Without chapterCount metadata, the first missing chapter after the start marks the end of the book.
            if (bibleText === null && parts.length > 0 && chapterCount === undefined) {
                break;
            }
            parts.push({ range, bibleText });
        }

        if (!parts.some((part) => part.bibleText !== null && part.bibleText.verses.length > 0)) {
            continue;
        }

        blocks.push({ reference, parts, sourceText });
    }

    return blocks;
}

export async function getBibleChapterTextBlock(
    book: number,
    chapter: number,
    bibleIndex: BibleIndex,
    translationId: string,
): Promise<BibleTextBlock | null> {
    const bibleText = await bibleIndex.getBibleText({ translationId, book, chapter, verseStart: 1 });
    if (bibleText === null || bibleText.verses.length === 0) {
        return null;
    }

    const lastVerse = Math.max(...bibleText.verses.map((verse) => verse.number));
    return {
        reference: { book, chapterStart: chapter, verseStart: 1, chapterEnd: chapter, verseEnd: lastVerse },
        parts: [{ range: { book, chapter, verseStart: 1 }, bibleText }],
    };
}
