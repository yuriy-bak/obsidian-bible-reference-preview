import { BibleReference } from "../domain/BibleReference";
import { BibleText } from "../domain/BibleText";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";

export type BibleTextPart = {
    range: ChapterVerseRange;
    bibleText: BibleText | null;
};

export type BibleTextBlock = {
    reference: BibleReference;
    parts: BibleTextPart[];
};
