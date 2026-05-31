export type TranslationSettingsItem = {
    id: string;
    name: string;
    language: string;
    sourceFileName: string;
    bookCount: number;
    isActive: boolean;
    isComparisonEnabled: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
};

export type PreviewComparisonTranslationOption = {
    id: string;
    name: string;
    isSelected: boolean;
    isDisabled: boolean;
};
