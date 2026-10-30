// A translation code is the short name written in brackets after a reference to show that passage in that
// translation: "Пс 22:1 (СП)". The user can change it in the translation list; until then it is made from
// the translation's name.

/** What a code may look like: letters, digits, "-" and "." only, so it never swallows other bracketed text. */
const TRANSLATION_CODE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}.-]{0,11}$/u;

export const MAX_TRANSLATION_CODE_LENGTH = 12;

export function isValidTranslationCode(code: string): boolean {
    return TRANSLATION_CODE_PATTERN.test(code);
}

/** Codes are compared without case and without the ё/е difference. */
export function normalizeTranslationCode(code: string): string {
    return code.trim().toLocaleLowerCase().replace(/ё/gu, "е");
}

/**
 * Initials of the name's words ("Синодальный перевод" → "СП", "World English Bible" → "WEB"); a code in
 * brackets at the end of the name wins ("Yorumsuz Türkçe Çeviri (YTC)" → "YTC").
 */
export function createDefaultTranslationCode(name: string): string {
    const bracketed = /\(([\p{L}\p{N}.-]{2,12})\)\s*$/u.exec(name)?.[1];
    if (bracketed !== undefined && /\p{L}/u.test(bracketed)) {
        return bracketed.toLocaleUpperCase();
    }

    const initials = (name.match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter((word) => /\p{L}/u.test(word))
        .map((word) => word[0].toLocaleUpperCase())
        .join("")
        .slice(0, MAX_TRANSLATION_CODE_LENGTH);
    return initials.length > 0 ? initials : "T";
}

/**
 * The code of every translation, in the given order: the user's code when it is valid and still free,
 * otherwise the default one, numbered when another translation already has it ("СП", "СП2").
 */
export function resolveTranslationCodes(
    translations: { id: string; name: string }[],
    userCodes: Record<string, string>,
): Map<string, string> {
    const codes = new Map<string, string>();
    const taken = new Set<string>();
    const take = (translationId: string, code: string): void => {
        codes.set(translationId, code);
        taken.add(normalizeTranslationCode(code));
    };

    for (const translation of translations) {
        const userCode = userCodes[translation.id];
        if (userCode !== undefined && isValidTranslationCode(userCode) && !taken.has(normalizeTranslationCode(userCode))) {
            take(translation.id, userCode);
        }
    }

    for (const translation of translations) {
        if (codes.has(translation.id)) {
            continue;
        }
        const base = createDefaultTranslationCode(translation.name || translation.id);
        let code = base;
        for (let number = 2; taken.has(normalizeTranslationCode(code)); number += 1) {
            code = `${base.slice(0, MAX_TRANSLATION_CODE_LENGTH - String(number).length)}${number}`;
        }
        take(translation.id, code);
    }

    // Keep the order of `translations`.
    return new Map(translations.map((translation) => [translation.id, codes.get(translation.id) ?? ""]));
}
