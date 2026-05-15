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
};

export function extractBookTableFromHtml(html: string): ExtractedBookTable | null {
    const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    const books: BibleBook[] = [];

    for (const row of rows) {
        const cells = Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
            .map((cell) => normalizeText(stripTags(cell[1])));

        if (cells.length < 2) {
            continue;
        }

        const name = cells[0];
        const abbreviation = cells[2] ?? cells[1];

        if (name.length === 0 || abbreviation.length === 0) {
            continue;
        }

        books.push({
            id: books.length + 1,
            name: name.toLowerCase(),
            abbreviation: abbreviation.toLowerCase(),
        });
    }

    if (books.length === 0) {
        return null;
    }

    return { books };
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

    const matchingBook = books.find((book) => headingText.includes(book.name) || headingText.includes(book.abbreviation));
    return matchingBook?.id ?? null;
}

export function extractVersesFromHtml(html: string): ExtractedVerse[] {
    const verseMarkers = Array.from(html.matchAll(/<span\b([^>]*\bid=["']chapter(\d+)_verse(\d+)["'][^>]*)>/gi));
    const result: ExtractedVerse[] = [];

    for (let index = 0; index < verseMarkers.length; index += 1) {
        const marker = verseMarkers[index];
        const nextMarker = verseMarkers[index + 1];
        const contentStart = marker.index + marker[0].length;
        const contentEnd = nextMarker?.index ?? html.length;
        const rawVerseHtml = html.slice(contentStart, contentEnd);
        const footnotes = extractFootnotes(rawVerseHtml, html);
        const text = normalizeText(stripTags(removeFootnoteLinks(rawVerseHtml)));

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

function extractNumericAttribute(html: string, names: string[]): number | null {
    for (const name of names) {
        const pattern = new RegExp(`${escapeRegExp(name)}=["'](\\d+)["']`, "i");
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

    return normalizeText(stripTags(match[2]));
}

function removeFootnoteLinks(html: string): string {
    return html.replace(/<a\b[^>]*href=["']#[^"']+["'][^>]*>[\s\S]*?<\/a>/gi, "");
}

function stripTags(html: string): string {
    return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));
}

function normalizeText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}