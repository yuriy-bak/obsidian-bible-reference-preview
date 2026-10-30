export type CompactVerseData =
    | string
    | [string, string[]]
    | {
        text: string;
        footnotes?: string[];
        paragraphStart?: boolean;
        /** Joined verses are stored at the first number; the following numbers stay empty. */
        verseEnd?: number;
        /** A title without a verse number before this verse (a psalm title such as "Псалом Давида."). */
        heading?: string;
    };

export type CompactBibleBookData = {
    chapters: Array<Array<CompactVerseData | null> | null>;
};
