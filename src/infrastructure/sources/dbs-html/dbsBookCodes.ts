// Two-letter book codes of the Digital Bible Society (dbs.org) readers: GN, S1 (1 Samuel), K1 (1 Kings),
// R1 (1 Chronicles), C1 (1 Corinthians), H1 (1 Thessalonians), J1 (1 John)…, by book number 1–66.
const DBS_BOOK_CODES = [
    "GN", "EX", "LV", "NU", "DT", "JS", "JG", "RT", "S1", "S2", "K1", "K2", "R1", "R2", "ER", "NH", "ET",
    "JB", "PS", "PR", "EC", "SS", "IS", "JR", "LM", "EK", "DN", "HS", "JL", "AM", "OB", "JH", "MC", "NM",
    "HK", "ZP", "HG", "ZC", "ML",
    "MT", "MK", "LK", "JN", "AC", "RM", "C1", "C2", "GL", "EP", "PP", "CL", "H1", "H2", "T1", "T2", "TT",
    "PM", "HB", "JM", "P1", "P2", "J1", "J2", "J3", "JD", "RV",
];

const BOOK_IDS_BY_CODE = new Map(DBS_BOOK_CODES.map((code, index) => [code, index + 1]));

/** Book number 1–66 of a DBS code; null for other books (deuterocanon and the like). */
export function getBookIdByDbsCode(code: string): number | null {
    return BOOK_IDS_BY_CODE.get(code.toUpperCase()) ?? null;
}
