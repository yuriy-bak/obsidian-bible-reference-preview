import { BibleText } from "../domain/BibleText";
import type { CompactBibleBookData } from "./bible-index/CompactBibleBookData";

export type GetBibleTextInput = {
    translationId: string;
    book: number;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
};

export type BibleIndex = {
    getBibleText: (input: GetBibleTextInput) => Promise<BibleText | null>;
    getChapterCount?: (translationId: string, book: number) => number | undefined;
    /** A whole book as stored, read without filling the preview's book cache (the text search reads every book). */
    readBook?: (translationId: string, book: number) => Promise<CompactBibleBookData | null>;
};

// Shared stand-in while no translation is imported.
export const EMPTY_BIBLE_INDEX: BibleIndex = Object.freeze({
    async getBibleText() {
        return null;
    },
});
