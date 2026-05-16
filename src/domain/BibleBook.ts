export type BibleBook = {
    id: number;
    name: string;
    abbreviation: string;
    aliases?: string[];
    chapterCount?: number;
};
