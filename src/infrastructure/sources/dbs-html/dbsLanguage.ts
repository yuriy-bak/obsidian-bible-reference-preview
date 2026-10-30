import { normalizeLanguage } from "../BibleIndexBuilder";

/** ISO 639-3 codes of dbs.org files as the two-letter codes the plugin uses elsewhere. */
const TWO_LETTER_LANGUAGES: Record<string, string> = {
    rus: "ru", eng: "en", ukr: "uk", bel: "be", deu: "de", fra: "fr", spa: "es", por: "pt", ita: "it", pol: "pl", tur: "tr",
};

/** "rus" → "ru", "rus-RU" → "ru"; other codes are only normalized. */
export function toTwoLetterLanguage(language: string): string {
    const normalized = normalizeLanguage(language);
    const base = normalized.split("-")[0];
    return TWO_LETTER_LANGUAGES[base] ?? normalized;
}
