export type CompactVerseData =
    | string
    | [string, string[]]
    | {
        text: string;
        footnotes?: string[];
        paragraphStart?: boolean;
    };

export type CompactBibleBookData = {
    chapters: Array<Array<CompactVerseData | null> | null>;
};
