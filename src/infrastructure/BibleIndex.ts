import { BibleText } from "../domain/BibleText";

export type GetBibleTextInput = {
    translationId: string;
    book: number;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
};

export type BibleIndex = {
    getBibleText(input: GetBibleTextInput): Promise<BibleText | null>;
};
