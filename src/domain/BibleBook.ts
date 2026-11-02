export type BibleBook = {
    id: number;
    name: string;
    abbreviation: string;
    aliases?: string[];
    /** Names the user added in the settings: they take the place of any other meaning of the name. */
    customAliases?: string[];
    chapterCount?: number;
};
