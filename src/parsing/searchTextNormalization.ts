// One set of matching rules for book names: BookMapping normalizes whole aliases,
// the parser normalizes note text one character at a time with the same function.
const BIDI_CONTROL_CHARACTERS = /[؜‎‏‪-‮⁦-⁩]/g;
const COMBINING_DOT_ABOVE = /̇/g;

export function normalizeSearchText(value: string): string {
    return replaceArabicIndicDigits(value)
        .normalize("NFC")
        .toLowerCase()
        .replace(COMBINING_DOT_ABOVE, "")
        .replace(/ё/g, "е")
        .replace(BIDI_CONTROL_CHARACTERS, "");
}

function replaceArabicIndicDigits(value: string): string {
    return value
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0));
}
