export type TranslationSettingsItem = {
    id: string;
    name: string;
    language: string;
    sourceFileName: string;
    bookCount: number;
    /** Key of the translation's numbering scheme. */
    versification: string;
    isActive: boolean;
    isComparisonEnabled: boolean;
};

export type PreviewComparisonTranslationOption = {
    id: string;
    name: string;
    isSelected: boolean;
    isDisabled: boolean;
};
