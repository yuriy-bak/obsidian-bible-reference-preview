export type BibleIndexVerseData = {
    text: string;
    footnotes: string[];
};

export type BibleIndexChapterData = Record<string, BibleIndexVerseData>;

export type BibleIndexBookData = {
    name: string;
    chapters: Record<string, BibleIndexChapterData>;
};

export type BibleIndexTranslationData = {
    name: string;
    books: Record<string, BibleIndexBookData>;
};

export type BibleIndexData = {
    translations: Record<string, BibleIndexTranslationData>;
};
