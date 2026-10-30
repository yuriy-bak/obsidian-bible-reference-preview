import decompressBrotli from "brotli/decompress";
import { getElementName, isElementNode, isTextNode, parseHtmlDocument } from "../../epub/MarkupDocument";
import { EpubImportError } from "../../epub/EpubImportError";
import type { BibleImportVerse } from "../BibleIndexBuilder";

// The "HTML Study Bible" of the Digital Bible Society (bibles.dbs.org/<ID>/app-json-study/index.html) is
// one page with the whole translation inside its scripts:
//   const COMPRESSED_VERSES = `<base64 of Brotli of {"GN1": "<chapter html>", …}>`;
//   const BIBLE_BOOKS = `[{"id":"GN","name":"Бытие","chapters":50,…}, …]`;
//   const BIBLE_ID = "RUSERV";
// A chapter is HTML made from USFM: paragraphs and poetry lines (`p`, `q1`, `m`…), headings (`s`, `ms`,
// `reference`), verses `<span class="v" data-v="GN1.3">` that start with the number and the first word
// (`<sup class="v-num">3</sup>И&nbsp;`), footnotes inline as `<span class="sidenote">`.

export type DbsBiblePage = {
    bibleId: string | null;
    language: string | null;
    books: { code: string; name: string }[];
    compressedVerses: string;
};

const COMPRESSED_VERSES_PATTERN = /const COMPRESSED_VERSES\s*=\s*`([A-Za-z0-9+/=\s]+)`/;
const BIBLE_BOOKS_PATTERN = /const BIBLE_BOOKS\s*=\s*`([^`]+)`/;

/** Merged verses are left as gaps of one or two numbers; longer gaps are lost lists, not merged verses. */
const MAX_JOINED_VERSE_GAP = 2;

/** Headings, titles and cross-reference lines: not verse text. */
const NON_VERSE_CLASSES = new Set([
    "s", "s1", "s2", "s3", "s4", "ms", "ms1", "ms2", "mr", "sr", "r", "reference", "sp", "d", "cl",
    "mt", "mt1", "mt2", "mt3", "is", "ip",
]);

/** Paragraphs that continue the previous one without a line break. */
const CONTINUATION_CLASSES = new Set(["m", "mi", "nb"]);

export function isDbsBiblePage(text: string): boolean {
    return COMPRESSED_VERSES_PATTERN.test(text) && BIBLE_BOOKS_PATTERN.test(text);
}

export function readDbsBiblePage(text: string): DbsBiblePage {
    const compressedVerses = COMPRESSED_VERSES_PATTERN.exec(text)?.[1];
    const booksJson = BIBLE_BOOKS_PATTERN.exec(text)?.[1];
    if (compressedVerses === undefined || booksJson === undefined) {
        throw new EpubImportError("The page has no Bible data of the Digital Bible Society reader.");
    }

    const books = (JSON.parse(booksJson) as unknown[])
        .filter((book): book is { id: string; name: string } => typeof book === "object" && book !== null
            && typeof (book as { id?: unknown }).id === "string" && typeof (book as { name?: unknown }).name === "string")
        .map((book) => ({ code: book.id, name: cleanBookName(book.name) }));

    return {
        bibleId: /const BIBLE_ID\s*=\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1] ?? null,
        language: /<html[^>]*\slang="([^"]+)"/i.exec(text)?.[1] ?? null,
        books,
        compressedVerses,
    };
}

/** Chapter HTML by key: book code and chapter number (`GN1`, `S12` = 1 Samuel 2). */
export function decompressDbsChapters(compressedVerses: string): Record<string, string> {
    const binary = atob(compressedVerses.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    const chapters = JSON.parse(new TextDecoder().decode(decompressBrotli(bytes))) as unknown;
    if (typeof chapters !== "object" || chapters === null) {
        throw new EpubImportError("The Bible data of the page could not be read.");
    }
    return chapters as Record<string, string>;
}

/** "1 - е к Коринфянам" → "1-е к Коринфянам". */
function cleanBookName(name: string): string {
    return name.replace(/(\d)\s*-\s*(\S)/gu, "$1-$2").replace(/\s+/g, " ").trim();
}

type VerseInProgress = {
    chapter: number;
    verse: number;
    text: string;
    footnotes: string[];
    paragraphStart: boolean;
};

type ExtractionState = {
    verses: BibleImportVerse[];
    current: VerseInProgress | null;
    paragraphHasText: boolean;
};

/** The verses of one chapter; numbers missing between two verses (one or two) are joined into the first. */
export function extractVersesFromDbsChapter(html: string): BibleImportVerse[] {
    const document = parseHtmlDocument(`<!DOCTYPE html><html><body>${html}</body></html>`);
    const state: ExtractionState = { verses: [], current: null, paragraphHasText: false };
    if (document.body !== null) {
        walk(document.body, state);
    }
    finishVerse(state);
    return joinVerseGaps(state.verses);
}

function walk(node: Node, state: ExtractionState): void {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (isTextNode(child)) {
            appendText(state, child.data);
            continue;
        }
        if (!isElementNode(child)) {
            continue;
        }

        const name = getElementName(child);
        const classes = (child.getAttribute("class") ?? "").split(/\s+/).filter((value) => value.length > 0);
        const verseId = name === "span" && classes.includes("v") ? /^[0-9A-Z]{2}(\d+)\.(\d+)$/.exec(child.getAttribute("data-v") ?? "") : null;

        if (verseId !== null) {
            startVerse(state, Number(verseId[1]), Number(verseId[2]));
            walk(child, state);
        } else if (classes.includes("sidenote")) {
            const footnote = readFootnote(child);
            if (state.current !== null && footnote.length > 0) {
                state.current.footnotes.push(footnote);
            }
        } else if (name === "label" || name === "input" || classes.includes("v-num") || classes.some((value) => NON_VERSE_CLASSES.has(value))) {
            continue;
        } else if (name === "div" || name === "p") {
            const continuation = classes.some((value) => CONTINUATION_CLASSES.has(value));
            appendBreak(state, continuation ? " " : "\n");
            if (!continuation) {
                state.paragraphHasText = false;
            }
            walk(child, state);
        } else if (name === "br") {
            appendBreak(state, "\n");
        } else {
            walk(child, state);
        }
    }
}

function startVerse(state: ExtractionState, chapter: number, verse: number): void {
    finishVerse(state);
    state.current = { chapter, verse, text: "", footnotes: [], paragraphStart: !state.paragraphHasText };
}

function finishVerse(state: ExtractionState): void {
    const current = state.current;
    state.current = null;
    if (current === null) {
        return;
    }
    const text = normalizeVerseText(current.text);
    if (text.length > 0 && current.chapter > 0 && current.verse > 0) {
        state.verses.push({
            chapter: current.chapter,
            verse: current.verse,
            text,
            footnotes: current.footnotes,
            paragraphStart: current.paragraphStart,
        });
    }
}

function appendText(state: ExtractionState, text: string): void {
    if (text.trim().length > 0) {
        state.paragraphHasText = true;
    }
    if (state.current !== null) {
        state.current.text += text.replace(/[ \t\r\n]+/g, " ");
    }
}

function appendBreak(state: ExtractionState, separator: string): void {
    if (state.current !== null && state.current.text.trim().length > 0) {
        state.current.text += separator;
    }
}

/** Footnote text without its "+" mark and the verse it belongs to (`<span class="fr">11:2</span>`). */
function readFootnote(element: Element): string {
    let text = "";
    for (let child = element.firstChild; child !== null; child = child.nextSibling) {
        if (isTextNode(child)) {
            text += child.data;
        } else if (isElementNode(child) && !(child.getAttribute("class") ?? "").split(/\s+/).includes("fr")) {
            text += ` ${child.textContent ?? ""} `;
        }
    }
    return normalizeInline(text.replace(/^\s*\+/, ""));
}

// The first word of a verse is followed by a no-break space even before punctuation ("Господи&nbsp;, как"),
// and quotes are spaced apart from the words in them ("« Авва! »").
function normalizeInline(text: string): string {
    return text
        .replace(/\u00a0\s*(?=[,.;:!?…»”)\]])/gu, "")
        .replace(/[\s\u00a0]+/gu, " ")
        .replace(/([«„([]) /gu, "$1")
        .replace(/ ([»”)\]])/gu, "$1")
        .replace(/ ([,.;:!?])/gu, "$1")
        .trim();
}

function normalizeVerseText(text: string): string {
    return text
        .split("\n")
        .map(normalizeInline)
        .filter((line) => line.length > 0)
        .join("\n");
}

function joinVerseGaps(verses: BibleImportVerse[]): BibleImportVerse[] {
    return verses.map((verse, index) => {
        const next = verses[index + 1];
        const gap = next === undefined || next.chapter !== verse.chapter ? 0 : next.verse - verse.verse - 1;
        return gap > 0 && gap <= MAX_JOINED_VERSE_GAP ? { ...verse, verseEnd: next.verse - 1 } : verse;
    });
}
