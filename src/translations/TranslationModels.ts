export type TranslationSettingsItem = {
    id: string;
    name: string;
    language: string;
    sourceFileName: string;
    bookCount: number;
    /** Key of the translation's numbering scheme. */
    versification: string;
    /** Code written after a reference to show it in this translation: "Пс 22:1 (СП)". */
    code: string;
    /** How many book names the user added to this translation. */
    customBookAliasCount: number;
    isActive: boolean;
    isComparisonEnabled: boolean;
};

export type PreviewComparisonTranslationOption = {
    id: string;
    name: string;
    isSelected: boolean;
    isDisabled: boolean;
};

/** A book in the "Book names" window. */
export type BookAliasesEditorBook = {
    id: number;
    name: string;
    /** Names from the imported file and the built-in ones: shown, not editable. */
    indexAliases: string[];
    /** Names the user added. */
    customAliases: string[];
};
