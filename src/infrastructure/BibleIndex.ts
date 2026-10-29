import { BibleText } from "../domain/BibleText";

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
};

// Shared stand-in while no translation is imported.
export const EMPTY_BIBLE_INDEX: BibleIndex = Object.freeze({
    async getBibleText() {
        return null;
    },
});
