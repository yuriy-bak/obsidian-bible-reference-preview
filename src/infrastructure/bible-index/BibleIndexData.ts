export type BibleIndexBookMetadata = {
    name: string;
    abbreviation: string;
    aliases: string[];
    path: string;
    chapterCount?: number;
};

export type BibleIndexTranslationMetadata = {
    name: string;
    language: string;
    sourceFileName?: string;
    importedAt: string;
    /** Versification scheme key ("builtin:eng"); missing in indexes written before 0.3.0. */
    versification?: string;
    /** Book ids in the translation's own order (the Synodal one puts James right after Acts). */
    bookOrder?: number[];
    books: Record<string, BibleIndexBookMetadata>;
};

export type BibleIndexData = {
    version: 2;
    translations: Record<string, BibleIndexTranslationMetadata>;
};
