import type { BibleBook } from "../../../domain/BibleBook";

// eBible.org EPUBs carry only full book names ("Евангелие от Матфея"), so references like "Мф 5:3" need
// abbreviations from a known tradition: the Russian Synodal one (Быт, Мф, 1Цар = 1 Samuel) and the
// English SBL Handbook one (Gen, Matt, 1 Sam). A table is applied only when the file's names follow it,
// because traditions disagree: in the NWT "1Цар" is 1 Kings, 3 Kings of the Synodal tradition.

type AbbreviationTableEntry = {
    abbreviation: string;
    /** Book number written before the name ("1 Samuel", "Первая книга Царств"); 0 for unnumbered books. */
    number: number;
    /** Matches the normalized full name of this book in the tradition. */
    stem: RegExp;
};

type AbbreviationTable = {
    ordinals: RegExp[];
    books: Record<number, AbbreviationTableEntry>;
};

/** Share of the file's books whose names must follow the table. */
const MIN_MATCHED_SHARE = 0.9;

/** 1–4 Samuel/Kings are where traditions number differently, so each of them present must match. */
const REQUIRED_MATCH_BOOK_IDS = [9, 10, 11, 12];

function entries(rows: [number, string, number, string][]): Record<number, AbbreviationTableEntry> {
    return Object.fromEntries(rows.map(([bookId, abbreviation, number, stem]) => [
        bookId,
        { abbreviation, number, stem: new RegExp(stem, "u") },
    ]));
}

const RUSSIAN_SYNODAL: AbbreviationTable = {
    ordinals: [/^перв/u, /^втор/u, /^трет/u, /^четв/u],
    books: entries([
        [1, "Быт", 0, "бытие|бытия"], [2, "Исх", 0, "исход"], [3, "Лев", 0, "левит"], [4, "Чис", 0, "числ"],
        [5, "Втор", 0, "второзакон"], [6, "Нав", 0, "навин"], [7, "Суд", 0, "суд"], [8, "Руф", 0, "руф"],
        [9, "1Цар", 1, "царств"], [10, "2Цар", 2, "царств"], [11, "3Цар", 3, "царств"], [12, "4Цар", 4, "царств"],
        [13, "1Пар", 1, "паралипоменон"], [14, "2Пар", 2, "паралипоменон"], [15, "Езд", 0, "ездр"],
        [16, "Неем", 0, "неем"], [17, "Есф", 0, "есфир"], [18, "Иов", 0, "иов"], [19, "Пс", 0, "псал"],
        [20, "Притч", 0, "притч"], [21, "Еккл", 0, "екклесиаст"], [22, "Песн", 0, "песн"], [23, "Ис", 0, "исаи"],
        [24, "Иер", 0, "иерем"], [25, "Плач", 0, "плач"], [26, "Иез", 0, "иезекиил"], [27, "Дан", 0, "даниил"],
        [28, "Ос", 0, "оси"], [29, "Иоил", 0, "иоил"], [30, "Ам", 0, "амос"], [31, "Авд", 0, "авди"],
        [32, "Иона", 0, "ион"], [33, "Мих", 0, "михе"], [34, "Наум", 0, "наум"], [35, "Авв", 0, "аввакум"],
        [36, "Соф", 0, "софони"], [37, "Агг", 0, "агге"], [38, "Зах", 0, "захари"], [39, "Мал", 0, "малахи"],
        [40, "Мф", 0, "матфе"], [41, "Мк", 0, "марк"], [42, "Лк", 0, "лук"], [43, "Ин", 0, "иоанн"],
        [44, "Деян", 0, "деяни"], [45, "Рим", 0, "римлян"], [46, "1Кор", 1, "коринф"], [47, "2Кор", 2, "коринф"],
        [48, "Гал", 0, "галат"], [49, "Еф", 0, "[еэ]фес"], [50, "Флп", 0, "фил+ип"], [51, "Кол", 0, "колосс"],
        [52, "1Фес", 1, "фессалоник"], [53, "2Фес", 2, "фессалоник"], [54, "1Тим", 1, "тимофе"], [55, "2Тим", 2, "тимофе"],
        [56, "Тит", 0, "тит"], [57, "Флм", 0, "филимон"], [58, "Евр", 0, "евре"], [59, "Иак", 0, "иаков"],
        [60, "1Пет", 1, "петр"], [61, "2Пет", 2, "петр"], [62, "1Ин", 1, "иоанн"], [63, "2Ин", 2, "иоанн"],
        [64, "3Ин", 3, "иоанн"], [65, "Иуд", 0, "иуд"], [66, "Откр", 0, "откровен"],
    ]),
};

const ENGLISH_SBL: AbbreviationTable = {
    ordinals: [/^first/u, /^second/u, /^third/u, /^fourth/u],
    books: entries([
        [1, "Gen", 0, "genesis"], [2, "Exod", 0, "exod"], [3, "Lev", 0, "levit"], [4, "Num", 0, "numb"],
        [5, "Deut", 0, "deut"], [6, "Josh", 0, "josh"], [7, "Judg", 0, "judg"], [8, "Ruth", 0, "ruth"],
        [9, "1 Sam", 1, "samuel"], [10, "2 Sam", 2, "samuel"], [11, "1 Kgs", 1, "kings"], [12, "2 Kgs", 2, "kings"],
        [13, "1 Chr", 1, "chron"], [14, "2 Chr", 2, "chron"], [15, "Ezra", 0, "ezra"], [16, "Neh", 0, "nehem"],
        [17, "Esth", 0, "esth"], [18, "Job", 0, "job"], [19, "Ps", 0, "psalm"], [20, "Prov", 0, "prov"],
        [21, "Eccl", 0, "eccl"], [22, "Song", 0, "song|canticle"], [23, "Isa", 0, "isa"], [24, "Jer", 0, "jerem"],
        [25, "Lam", 0, "lament"], [26, "Ezek", 0, "ezek"], [27, "Dan", 0, "dan"], [28, "Hos", 0, "hos"],
        [29, "Joel", 0, "joel"], [30, "Amos", 0, "amos"], [31, "Obad", 0, "obad"], [32, "Jonah", 0, "jonah"],
        [33, "Mic", 0, "mic"], [34, "Nah", 0, "nah"], [35, "Hab", 0, "habak"], [36, "Zeph", 0, "zeph"],
        [37, "Hag", 0, "hag"], [38, "Zech", 0, "zech"], [39, "Mal", 0, "mal"], [40, "Matt", 0, "matt"],
        [41, "Mark", 0, "mark"], [42, "Luke", 0, "luke"], [43, "John", 0, "john"], [44, "Acts", 0, "acts"],
        [45, "Rom", 0, "roman"], [46, "1 Cor", 1, "corinth"], [47, "2 Cor", 2, "corinth"], [48, "Gal", 0, "galat"],
        [49, "Eph", 0, "ephes"], [50, "Phil", 0, "philip"], [51, "Col", 0, "colos"], [52, "1 Thess", 1, "thess"],
        [53, "2 Thess", 2, "thess"], [54, "1 Tim", 1, "tim"], [55, "2 Tim", 2, "tim"], [56, "Titus", 0, "tit"],
        [57, "Phlm", 0, "philem"], [58, "Heb", 0, "hebr"], [59, "Jas", 0, "james"], [60, "1 Pet", 1, "pet"],
        [61, "2 Pet", 2, "pet"], [62, "1 John", 1, "john"], [63, "2 John", 2, "john"], [64, "3 John", 3, "john"],
        [65, "Jude", 0, "jude"], [66, "Rev", 0, "revel"],
    ]),
};

const TABLES_BY_LANGUAGE: Record<string, AbbreviationTable> = {
    ru: RUSSIAN_SYNODAL,
    en: ENGLISH_SBL,
};

/**
 * The abbreviations of the tradition the translation's book names follow, by book id; empty when the
 * language has no table or the names do not follow it.
 */
export function findTraditionalBookAbbreviations(language: string, books: Pick<BibleBook, "id" | "name">[]): Map<number, string> {
    const table = TABLES_BY_LANGUAGE[language.split("-")[0]];
    const known = table === undefined ? [] : books.filter((book) => table.books[book.id] !== undefined);
    if (table === undefined || known.length === 0) {
        return new Map();
    }

    const matched = new Set(known.filter((book) => matchesTable(table, book.id, book.name)).map((book) => book.id));
    const requiredMissed = REQUIRED_MATCH_BOOK_IDS.some((bookId) => known.some((book) => book.id === bookId) && !matched.has(bookId));
    if (requiredMissed || matched.size / known.length < MIN_MATCHED_SHARE) {
        return new Map();
    }

    return new Map(known.map((book) => [book.id, table.books[book.id].abbreviation]));
}

function matchesTable(table: AbbreviationTable, bookId: number, name: string): boolean {
    const entry = table.books[bookId];
    const normalized = name.toLowerCase().replace(/ё/gu, "е").replace(/[.\s]+/gu, " ").trim();
    return entry.stem.test(normalized) && readLeadingNumber(table, normalized) === entry.number;
}

/** The book number written before the name as a digit, a Roman numeral or an ordinal word; 0 if none. */
function readLeadingNumber(table: AbbreviationTable, name: string): number {
    const digit = /^([1-4])(?!\d)/u.exec(name)?.[1];
    if (digit !== undefined) {
        return Number(digit);
    }
    const roman = /^(i{1,3}|iv) /u.exec(name)?.[1];
    if (roman !== undefined) {
        return roman === "iv" ? 4 : roman.length;
    }
    const ordinal = table.ordinals.findIndex((pattern) => pattern.test(name));
    // "Второзаконие" starts like "второй": an ordinal counts only as a separate word.
    return ordinal >= 0 && /^\S+ /u.test(name) && !/^второзакон/u.test(name) ? ordinal + 1 : 0;
}

/** The language of a table that the book names follow (see findTraditionalBookAbbreviations), for files that do not name their language. */
export function detectLanguageFromBookNames(books: Pick<BibleBook, "id" | "name">[]): string | null {
    return Object.keys(TABLES_BY_LANGUAGE).find((language) => findTraditionalBookAbbreviations(language, books).size > 0) ?? null;
}
