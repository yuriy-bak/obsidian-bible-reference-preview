export const LANGUAGE_BOOK_ALIASES: Record<string, Record<number, string[]>> = {
    ru: {
        19: ["Псалом"],
        23: ["Исаия"],
    },
    en: {
        // если понадобятся варианты английских названий
    },
    tr: {
        // если будут турецкие EPUB/алиасы
    },
};

export function getLanguageBookAliases(language: string, bookId: number): string[] {
    const normalizedLanguage = normalizeLanguage(language);
    const exactLanguageAliases = LANGUAGE_BOOK_ALIASES[normalizedLanguage]?.[bookId];

    if (exactLanguageAliases !== undefined) {
        return exactLanguageAliases;
    }

    const baseLanguage = normalizedLanguage.split("-")[0];
    return LANGUAGE_BOOK_ALIASES[baseLanguage]?.[bookId] ?? [];
}

function normalizeLanguage(language: string): string {
    return language.trim().toLowerCase().replace(/_/g, "-");
}
