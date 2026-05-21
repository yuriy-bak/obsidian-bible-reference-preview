import { BibleBook } from "../../domain/BibleBook";

export type ExtractedVerse = {
    chapter: number;
    verse: number;
    text: string;
    footnotes: string[];
    paragraphStart?: boolean;
};

export type ExtractedBookTable = {
    books: BibleBook[];
    hrefToBookId: Record<string, number>;
};

export function extractBookTableFromHtml(html: string): ExtractedBookTable | null {
    const tableBookList = extractBookTableFromRows(html);
    if (tableBookList !== null) {
        return tableBookList;
    }

    return extractBookTableFromNavigationLinks(html);
}

export function enrichBookTableFromNavigationHtml(bookTable: ExtractedBookTable, path: string, html: string): void {
    const navigationFileName = normalizeHrefFileName(path);
    const bookId = getBookIdFromNavigationHref(navigationFileName, bookTable);
    if (bookId === null) {
        return;
    }

    const bookName = extractBookNameFromNavigationHtml(html);
    if (bookName !== null) {
        const book = bookTable.books.find((candidate) => candidate.id === bookId);
        if (book !== undefined && book.name === book.abbreviation) {
            book.name = bookName;
            book.aliases = [book.name, book.abbreviation];
        }
    }

    addBookContentHrefsFromNavigationHtml(bookTable, bookId, html);
}

export function extractBookIdFromHtmlOrPath(html: string, path: string, books: BibleBook[]): number | null {
    const explicitBookId = extractNumericAttribute(html, ["data-book-id", "data-book", "book-id"]);
    if (explicitBookId !== null) {
        return explicitBookId;
    }

    const pathBookId = extractBookIdFromPath(path);
    if (pathBookId !== null && books.some((book) => book.id === pathBookId)) {
        return pathBookId;
    }

    const headingText = normalizeText(stripTags(extractFirstHeading(html) ?? "")).toLowerCase();
    if (headingText.length === 0) {
        return null;
    }

    const matchingBook = books.find((book) => {
        const bookName = book.name.toLowerCase();
        const bookAbbreviation = book.abbreviation.toLowerCase();

        return headingText.includes(bookName) || headingText.includes(bookAbbreviation);
    });

    return matchingBook?.id ?? null;
}

export function extractVersesFromHtml(html: string): ExtractedVerse[] {
    const verseMarkers = Array.from(html.matchAll(/<(?:span|a)\b([^>]*\bid=["']chapter(\d+)_verse(\d+)["'][^>]*)>/gi));
    const result: ExtractedVerse[] = [];
    const footnoteGroupIndex = findFootnoteGroupIndex(html);

    for (let index = 0; index < verseMarkers.length; index += 1) {
        const marker = verseMarkers[index];
        const nextMarker = verseMarkers[index + 1];
        const markerIndex = marker.index ?? 0;
        const previousMarkerIndex = verseMarkers[index - 1]?.index;

        const contentStart = markerIndex + marker[0].length;
        const contentEnd = Math.min(
            nextMarker?.index ?? html.length,
            footnoteGroupIndex !== null && footnoteGroupIndex > contentStart ? footnoteGroupIndex : html.length,
        );

        const rawVerseHtml = html.slice(contentStart, contentEnd);
        const footnotes = extractFootnotes(rawVerseHtml, html);
        const text = normalizeVerseText(stripTagsForVerse(removeVerseNumberMarkup(preserveFootnoteLinkMarkers(rawVerseHtml))));

        if (text.length === 0) {
            continue;
        }

        result.push({
            chapter: Number(marker[2]),
            verse: Number(marker[3]),
            text,
            footnotes,
            paragraphStart: isParagraphStart(html, markerIndex, previousMarkerIndex),
        });
    }

    return result;
}

function isParagraphStart(html: string, markerIndex: number, previousMarkerIndex: number | undefined): boolean {
    const paragraphStartIndex = findLastParagraphStartIndex(html, markerIndex);

    if (paragraphStartIndex === null) {
        return true;
    }

    const paragraphEndBeforeMarker = html.lastIndexOf("</p>", markerIndex);

    if (paragraphEndBeforeMarker > paragraphStartIndex) {
        return true;
    }

    return previousMarkerIndex === undefined || previousMarkerIndex < paragraphStartIndex;
}

function findLastParagraphStartIndex(html: string, beforeIndex: number): number | null {
    const paragraphStartPattern = /<p\b[^>]*>/gi;
    let lastParagraphStartIndex: number | null = null;

    for (let match = paragraphStartPattern.exec(html); match !== null; match = paragraphStartPattern.exec(html)) {
        if (match.index >= beforeIndex) {
            break;
        }

        lastParagraphStartIndex = match.index;
    }

    return lastParagraphStartIndex;
}

function extractBookTableFromRows(html: string): ExtractedBookTable | null {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const books: BibleBook[] = [];
    const hrefToBookId: Record<string, number> = {};

    for (const row of rows) {
        const cells = Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi));
        if (cells.length < 3) {
            continue;
        }

        const href = extractFirstHref(cells[0][1]);
        if (href === null || !isCanonicalBibleBookHref(href)) {
            continue;
        }

        const name = normalizeText(stripTags(cells[0][1]));
        const abbreviation = extractBookTableAbbreviation(cells);

        if (name.length === 0 || abbreviation === null || !isLikelyBookTableName(name)) {
            continue;
        }

        const id = books.length + 1;
        books.push({
            id,
            name,
            abbreviation,
            aliases: [name, abbreviation],
        });
        hrefToBookId[normalizeHrefFileName(href)] = id;
    }

    if (!isCompleteBibleBookTable(books)) {
        return null;
    }

    return {
        books,
        hrefToBookId,
    };
}

function isLikelyBookTableName(value: string): boolean {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
        return false;
    }

    if (isKnownNonBookTableAbbreviation(normalizedValue)) {
        return false;
    }

    if (isUnicodeNumber(normalizedValue)) {
        return false;
    }

    return /[\p{L}]/u.test(normalizedValue);
}

function extractBookTableAbbreviation(cells: RegExpMatchArray[]): string | null {
    for (let index = 1; index < cells.length; index += 1) {
        if (extractFirstHref(cells[index][1]) !== null) {
            continue;
        }

        const candidate = normalizeText(stripTags(cells[index][1]));

        if (isLikelyBookTableAbbreviation(candidate)) {
            return candidate;
        }
    }

    return null;
}

function isLikelyBookTableAbbreviation(value: string): boolean {
    const normalizedValue = normalizeBookTableToken(value);

    if (normalizedValue.length === 0) {
        return false;
    }

    if (isKnownNonBookTableAbbreviation(normalizedValue)) {
        return false;
    }

    if (isUnicodeNumber(normalizedValue)) {
        return false;
    }

    if (!/[\p{L}]/u.test(normalizedValue)) {
        return false;
    }

    if (/\s/.test(normalizedValue) && !isNumberedBookAbbreviation(normalizedValue)) {
        return false;
    }

    return normalizedValue.length <= 16;
}

function normalizeBookTableToken(value: string): string {
    return value
        .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
        .trim();
}

function isUnicodeNumber(value: string): boolean {
    return /^[0-9٠-٩۰-۹]+$/.test(value.trim());
}

function isNumberedBookAbbreviation(value: string): boolean {
    return /^[0-9٠-٩۰-۹]+\s+[\p{L}\p{M}]+$/u.test(normalizeBookTableToken(value));
}


function isKnownNonBookTableAbbreviation(value: string): boolean {
    return /^(outline|overview|summary|contents?|page)$/i.test(value);
}

function extractBookTableFromNavigationLinks(html: string): ExtractedBookTable | null {
    const links = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']*BIBLE_(\d{2})\.xhtml)["'][^>]*>([\s\S]*?)<\/a>/gi));
    const booksById = new Map<number, BibleBook>();
    const hrefToBookId: Record<string, number> = {};

    for (const link of links) {
        const id = Number(link[2]);
        if (id < 1 || id > 66 || booksById.has(id)) {
            continue;
        }

        const abbreviation = normalizeText(stripTags(link[3]));
        if (!isBookNavigationAlias(abbreviation)) {
            continue;
        }

        booksById.set(id, {
            id,
            name: abbreviation,
            abbreviation,
            aliases: [abbreviation],
        });
        hrefToBookId[normalizeHrefFileName(link[1])] = id;
    }

    if (booksById.size !== 66) {
        return null;
    }

    return {
        books: Array.from(booksById.values()).sort((left, right) => left.id - right.id),
        hrefToBookId,
    };
}

function addBookContentHrefsFromNavigationHtml(bookTable: ExtractedBookTable, bookId: number, html: string): void {
    const hrefs = Array.from(html.matchAll(/href=["']([^"']+\.xhtml(?:#[^"']*)?)["']/gi));
    for (const hrefMatch of hrefs) {
        const href = hrefMatch[1];
        const fileName = normalizeHrefFileName(href);
        if (fileName.length === 0 || fileName.startsWith("biblechapter") || fileName.startsWith("bibleverse")) {
            continue;
        }

        const hrefFragment = href.split("#")[1] ?? "";
        if (hrefFragment.length > 0 && !/^chapter\d+_verse\d+$/i.test(hrefFragment)) {
            continue;
        }

        addBookHrefIfSafe(bookTable, fileName, bookId);
        addBookHrefIfSafe(bookTable, canonicalVerseDocumentFileName(fileName), bookId);
    }
}

function addBookHrefIfSafe(bookTable: ExtractedBookTable, fileName: string, bookId: number): void {
    const existingBookId = bookTable.hrefToBookId[fileName];
    if (existingBookId === undefined || existingBookId === bookId) {
        bookTable.hrefToBookId[fileName] = bookId;
    }
}

function extractBookNameFromNavigationHtml(html: string): string | null {
    const title = removeNavigationSuffix(normalizeText(stripTags(extractTitle(html) ?? "")));
    if (isBookNavigationAlias(title)) {
        return title;
    }

    const heading = removeNavigationSuffix(normalizeText(stripTags(extractFirstHeading(html) ?? "")));
    if (isBookNavigationAlias(heading)) {
        return heading;
    }

    return null;
}

function removeNavigationSuffix(value: string): string {
    return value.replace(/\s*\([^)]*Navigation[^)]*\)\s*$/i, "").trim();
}

function extractFirstHref(html: string): string | null {
    const match = /href=["']([^"']+)["']/i.exec(html);
    return match?.[1] ?? null;
}

function isCanonicalBibleBookHref(href: string): boolean {
    const fileName = normalizeHrefFileName(href);

    if (!/^\d+\.xhtml$/i.test(fileName)) {
        return false;
    }

    if (/-split\d+\.xhtml$/i.test(fileName)) {
        return false;
    }

    return true;
}

function normalizeHrefFileName(href: string): string {
    return href.split("#")[0].split("?")[0].split("/").pop() ?? href;
}

function canonicalVerseDocumentFileName(fileName: string): string {
    return fileName.replace(/-split\d+(?=\.xhtml$)/i, "");
}

function isCompleteBibleBookTable(books: BibleBook[]): boolean {
    return books.length === 66;
}

function normalizeBookTableName(value: string): string {
    return value
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractNumericAttribute(html: string, names: string[]): number | null {
    for (const name of names) {
        const pattern = new RegExp(`${escapeRegExp(name)}=["'](\d+)["']`, "i");
        const match = pattern.exec(html);

        if (match !== null) {
            return Number(match[1]);
        }
    }

    return null;
}

function extractBookIdFromPath(path: string): number | null {
    const fileName = path.split("/").pop() ?? path;
    const match = /(?:^|[^\d])(\d{1,2})(?:[^\d]|$)/.exec(fileName);

    if (match === null) {
        return null;
    }

    return Number(match[1]);
}

function extractTitle(html: string): string | null {
    const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match?.[1] ?? null;
}

function extractFirstHeading(html: string): string | null {
    const match = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
    return match?.[1] ?? null;
}

function findFootnoteGroupIndex(html: string): number | null {
    const patterns = [
        /<div\b[^>]*class=["'][^"']*groupFootnote[^"']*["'][^>]*>/i,
        /<aside\b[^>]*epub:type=["']footnote["'][^>]*>/i,
        /<div\b[^>]*epub:type=["']footnote["'][^>]*>/i,
    ];
    const indexes = patterns
        .map((pattern) => pattern.exec(html)?.index)
        .filter((index): index is number => index !== undefined);

    if (indexes.length === 0) {
        return null;
    }

    return Math.min(...indexes);
}

function extractFootnotes(rawVerseHtml: string, fullHtml: string): string[] {
    const footnotes: string[] = [];
    const hrefPattern = /<a\b[^>]*href=["']#([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;

    for (let match = hrefPattern.exec(rawVerseHtml); match !== null; match = hrefPattern.exec(rawVerseHtml)) {
        const footnoteText = extractElementTextById(fullHtml, match[1]);
        if (footnoteText.length > 0) {
            footnotes.push(footnoteText);
        }
    }

    return footnotes;
}

function extractElementTextById(html: string, id: string): string {
    const escapedId = escapeRegExp(id);
    const elementPattern = new RegExp(
        String.raw`<([a-z0-9]+)\b[^>]*id=["']${escapedId}["'][^>]*>([\s\S]*?)<\/\1>`,
        "i",
    );
    const match = elementPattern.exec(html);

    if (match === null) {
        return "";
    }

    return cleanupFootnoteText(normalizeText(stripTags(match[2])));
}

function preserveFootnoteLinkMarkers(html: string): string {
    return html.replace(
        /<a\b[^>]*href=["']#[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_match, label) => stripTags(label),
    );
}

function stripTagsForVerse(html: string): string {
    const withLineBreaks = html
        .replace(/<br\b[^>]*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n");

    const withoutBlockTags = withLineBreaks
        .replace(/<p\b[^>]*>/gi, "")
        .replace(/<\/p>/gi, "");

    return decodeHtmlEntities(withoutBlockTags.replace(/<[^>]+>/g, " "));
}

function normalizeVerseText(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line
            .replace(/[ \t\f\v\u00a0\u202f]+/g, " ")
            .replace(/\s+([*.,;:!?])/g, "$1")
            .trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function removeVerseNumberMarkup(html: string): string {
    return html
        .replace(/<span\b[^>]*class=["'][^"']*w_ch[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, "")
        .replace(/<strong>\s*<sup>\d+<\/sup>\s*<\/strong>/gi, "");
}

function stripTags(html: string): string {
    return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));
}

function normalizeText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function cleanupFootnoteText(text: string): string {
    return text.replace(/^\^\s+[^\s]+\s+\d+:\d+\s*/, "").trim();
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}


export function extractBookNavigationAliasesFromHtml(
    html: string,
    bookTable: ExtractedBookTable,
): Record<number, string[]> {
    const aliasesByBookId: Record<number, string[]> = {};
    const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    for (let match = linkPattern.exec(html); match !== null; match = linkPattern.exec(html)) {
        const href = normalizeHrefFileName(match[1]);
        const alias = normalizeText(stripTags(match[2]));

        if (!isBookNavigationAlias(alias)) {
            continue;
        }

        const bookId = getBookIdFromNavigationHref(href, bookTable);
        if (bookId === null) {
            continue;
        }

        aliasesByBookId[bookId] ??= [];
        aliasesByBookId[bookId].push(alias);
    }

    return aliasesByBookId;
}

function getBookIdFromNavigationHref(href: string, bookTable: ExtractedBookTable): number | null {
    const chapterNavigationMatch = /^biblechapternav(\d+)\.xhtml$/i.exec(href);
    if (chapterNavigationMatch !== null) {
        const bookId = Number(chapterNavigationMatch[1]);
        return bookTable.books.some((book) => book.id === bookId) ? bookId : null;
    }

    return bookTable.hrefToBookId[href] ?? null;
}

function isBookNavigationAlias(value: string): boolean {
    const normalized = normalizeText(value);

    if (normalized.length === 0) {
        return false;
    }

    if (normalized.startsWith("^")) {
        return false;
    }

    if (normalized.includes(":") || normalized.includes(";") || looksLikeScriptureReference(normalized)) {
        return false;
    }

    if (!containsLetter(normalized)) {
        return false;
    }

    return true;
}

function looksLikeScriptureReference(value: string): boolean {
    return /\d+\s*[:：]\s*\d+/.test(value);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsLetter(value: string): boolean {
    return Array.from(value).some((character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase());
}