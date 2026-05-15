export type Verse = {
    number: number;
    text: string;
    footnotes: string[];
};

export type BibleText = {
    translationId: string;
    book: number;
    bookName: string;
    chapter: number;
    verses: Verse[];
};
