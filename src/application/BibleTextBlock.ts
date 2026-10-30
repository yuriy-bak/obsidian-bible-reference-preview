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
    sourceText?: string;
    /** Verses to highlight when the passage is shown in a chapter view; the view's own ranges otherwise. */
    highlightedReferences?: BibleReference[];
};
