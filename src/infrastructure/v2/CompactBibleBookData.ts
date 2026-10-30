export type CompactVerseData =
    | string
    | [string, string[]]
    | {
        text: string;
        footnotes?: string[];
        paragraphStart?: boolean;
        /** Joined verses are stored at the first number; the following numbers stay empty. */
        verseEnd?: number;
    };

export type CompactBibleBookData = {
    chapters: Array<Array<CompactVerseData | null> | null>;
};
