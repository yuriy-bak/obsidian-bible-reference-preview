export type Verse = {
    number: number;
    /** Last verse number of verses the translation joined into one ("16–17"). */
    numberEnd?: number;
    text: string;
    footnotes: string[];
    paragraphStart?: boolean;
};

export type BibleText = {
    translationId: string;
    book: number;
    bookName: string;
    chapter: number;
    verses: Verse[];
};
