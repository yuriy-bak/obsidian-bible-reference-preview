export type BibleIndexV2BookMetadata = {
    name: string;
    abbreviation: string;
    aliases: string[];
    path: string;
};

export type BibleIndexV2TranslationMetadata = {
    name: string;
    language: string;
    sourceFileName?: string;
    importedAt: string;
    books: Record<string, BibleIndexV2BookMetadata>;
};

export type BibleIndexV2Data = {
    version: 2;
    translations: Record<string, BibleIndexV2TranslationMetadata>;
};
