export type Verse = {
    number: number;
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
