export type CompactVerseData = string | [string, string[]];

export type CompactBibleBookData = {
    chapters: Array<Array<CompactVerseData | null> | null>;
};
