export type BibleIndexV2BookMetadata = {
    name: string;
    abbreviation: string;
    aliases: string[];
    path: string;
    chapterCount?: number;
};

export type BibleIndexV2TranslationMetadata = {
    name: string;
    language: string;
    sourceFileName?: string;
    importedAt: string;
    /** Versification scheme key ("builtin:eng"); missing in indexes written before 0.3.0. */
    versification?: string;
    /** Book ids in the translation's own order (the Synodal one puts James right after Acts). */
    bookOrder?: number[];
    books: Record<string, BibleIndexV2BookMetadata>;
};

export type BibleIndexV2Data = {
    version: 2;
    translations: Record<string, BibleIndexV2TranslationMetadata>;
};
