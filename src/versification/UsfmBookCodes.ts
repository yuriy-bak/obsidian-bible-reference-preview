/** USFM/Paratext book codes of the 66 canonical books; the position + 1 is the plugin's book id. */
export const USFM_BOOK_CODES: readonly string[] = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
    "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
    "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

const BOOK_ID_BY_USFM_CODE = new Map(USFM_BOOK_CODES.map((code, index) => [code, index + 1]));

/** Book id 1–66, or null for a non-canonical book or an unknown code. */
export function getBookIdByUsfmCode(code: string): number | null {
    return BOOK_ID_BY_USFM_CODE.get(code.toUpperCase()) ?? null;
}

export function getUsfmCodeByBookId(bookId: number): string | null {
    return USFM_BOOK_CODES[bookId - 1] ?? null;
}
