import { BibleBook } from "../../domain/BibleBook";
import { BibleIndexVerseData } from "../BibleIndexData";

export type ExtractedVerse = {
    chapter: number;
    verse: number;
    text: string;
    footnotes: string[];
};

export type ExtractedBookTable = {
    books: BibleBook[];
    hrefToBookId: Record<string, number>;
};

export function extractBookTableFromHtml(html: string): ExtractedBookTable | null {
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
        const abbreviation = normalizeText(stripTags(cells[2][1]));

        if (name.length === 0 || abbreviation.length === 0) {
            continue;
        }

        const id = books.length + 1;
        books.push({
            id,
            name,
            abbreviation,
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
    const verseMarkers = Array.from(html.matchAll(/<span\b([^>]*\bid=["']chapter(\d+)_verse(\d+)["'][^>]*)>/gi));
    const result: ExtractedVerse[] = [];
    const footnoteGroupIndex = findFootnoteGroupIndex(html);

    for (let index = 0; index < verseMarkers.length; index += 1) {
        const marker = verseMarkers[index];
        const nextMarker = verseMarkers[index + 1];
        const contentStart = (marker.index ?? 0) + marker[0].length;
        const contentEnd = Math.min(
            nextMarker?.index ?? html.length,
            footnoteGroupIndex !== null && footnoteGroupIndex > contentStart ? footnoteGroupIndex : html.length,
        );
        const rawVerseHtml = html.slice(contentStart, contentEnd);
        const footnotes = extractFootnotes(rawVerseHtml, html);
        const text = normalizeText(stripTags(removeVerseNumberMarkup(removeFootnoteLinks(rawVerseHtml))));

        if (text.length === 0) {
            continue;
        }

        result.push({
            chapter: Number(marker[2]),
            verse: Number(marker[3]),
            text,
            footnotes,
        });
    }

    return result;
}

export function toBibleIndexVerseData(verse: ExtractedVerse): BibleIndexVerseData {
    return {
        text: verse.text,
        footnotes: verse.footnotes,
    };
}

function extractFirstHref(html: string): string | null {
    const match = /href=["']([^"']+)["']/i.exec(html);
    return match?.[1] ?? null;
}

function isCanonicalBibleBookHref(href: string): boolean {
    return /^10010611\d\d\.xhtml$/i.test(normalizeHrefFileName(href));
}

function normalizeHrefFileName(href: string): string {
    return href.split("#")[0].split("?")[0].split("/").pop() ?? href;
}

function isCompleteBibleBookTable(books: BibleBook[]): boolean {
    if (books.length !== 66) {
        return false;
    }

    return normalizeBookTableName(books[0]?.name ?? "").startsWith("быт")
        && normalizeBookTableName(books[1]?.name ?? "").startsWith("исх")
        && normalizeBookTableName(books[2]?.name ?? "").startsWith("лев")
        && normalizeBookTableName(books[65]?.name ?? "").startsWith("отк");
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

function removeFootnoteLinks(html: string): string {
    return html.replace(/<a\b[^>]*href=["']#[^"']+["'][^>]*>[\s\S]*?<\/a>/gi, "");
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

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
