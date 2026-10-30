import { findElementsByName, getElementName, isElementNode, isTextNode } from "../../epub/MarkupDocument";
import type { BibleImportVerse } from "../BibleIndexBuilder";
import { normalizeInline, normalizeVerseText } from "../dbs-html/dbsHtml";

// Markup that the Digital Bible Society generates with Aleph (bibles.dbs.org) from USFM, in two packagings:
// - EPUB: one XHTML file per chapter named by the USFM book code and the chapter number (`chapters/JHN3.xhtml`),
//   a book page without a number (`JHN.xhtml`) with links to its chapters, the chapter in
//   `<div id="chapter_content">` after `<h4 class="c">3</h4><b class="c c3">3</b>`, verse markers
//   `<sup class="v v3" data-verse="3" data-sid="JHN3">3</sup>`, footnote markers `<a role="doc-noteref" href="#…">`
//   with the notes in `<section role="doc-endnotes">` at the end;
// - HTML archive: one page per book (`html/books/PSA.html`) with the whole book in `<main>`, chapters
//   `<b id="c2" class="c">2</b>`, verse markers `<sup data-id="PSA_2_1" class="v">1</sup>`, book names in the links
//   of `html/index.html`.
// Both use paragraph classes named after USFM markers (`p`, `m`, `q1`…).

/** Book code and chapter number of a chapter file: `chapters/1CH12.xhtml` → 1CH, 12. */
export const DBS_EPUB_CHAPTER_FILE_PATTERN = /(?:^|\/)([0-9A-Z]{3})(\d+)\.xhtml$/;

/** Headings, titles, chapter labels, cross references and alternate verse numbers: not verse text. */
const NON_VERSE_CLASSES = new Set([
    "c", "ca", "cl", "cd", "cp",
    "mt", "mt1", "mt2", "mt3", "mt4", "imt", "imt1", "imt2", "imt3", "imt4", "ms", "ms1", "ms2", "ms3", "ms4", "mr",
    "s", "s1", "s2", "s3", "s4", "sr", "r", "rq", "sp", "d", "h", "sd", "sd1", "sd2", "sd3", "sd4",
    "x", "va", "vp", "is", "is1", "is2", "ip", "ipi", "im", "imi", "io", "io1", "io2", "iot",
]);

const SKIPPED_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "nav", "aside", "section", "head", "style", "script"]);

/** Paragraphs that continue the previous one without a line break. */
const CONTINUATION_CLASSES = new Set(["m", "mi", "nb", "pmc"]);

const BLOCK_ELEMENTS = new Set(["p", "div", "li", "tr"]);

type VerseInProgress = {
    chapter: number;
    verse: number;
    verseEnd: number | undefined;
    text: string;
    footnotes: string[];
    paragraphStart: boolean;
};

type ExtractionState = {
    chapter: number;
    verses: BibleImportVerse[];
    current: VerseInProgress | null;
    paragraphHasText: boolean;
    elementsById: Map<string, Element>;
};

/** Book names by USFM code from the table of contents (`<a href="chapters/GEN1.xhtml" class="book-title">`). */
export function extractBookNamesFromNavDocument(document: Document): Map<string, string> {
    const names = new Map<string, string>();

    for (const link of findElementsByName(document, "a")) {
        if (!getClasses(link).includes("book-title")) {
            continue;
        }
        const code = /([0-9A-Z]{3})\d*\.xhtml(?:#.*)?$/.exec(link.getAttribute("href") ?? "")?.[1];
        const name = normalizeInline(link.textContent ?? "");
        if (code !== undefined && name.length > 0 && !names.has(code)) {
            names.set(code, name);
        }
    }

    return names;
}

/** The book name of a book page (`<h1>`) or, failing that, of a chapter page title ("Bible | John 3"). */
export function extractBookNameFromPage(document: Document): string | null {
    const heading = normalizeInline(findElementsByName(document, "h1")[0]?.textContent ?? "");
    if (heading.length > 0) {
        return heading;
    }
    const title = normalizeInline(findElementsByName(document, "title")[0]?.textContent ?? "");
    const name = title.split("|").pop()?.replace(/\s+\d+\s*$/, "").trim() ?? "";
    return name.length > 0 ? name : null;
}

/** Book code of a page of the HTML archive: `html/books/PSA.html` → PSA. */
export const DBS_ARCHIVE_BOOK_FILE_PATTERN = /(?:^|\/)books\/([0-9A-Z]{3})\.html$/;

/** Book names by USFM code from the links of the archive's `index.html` (`<a href="books/GEN.html">Бытие</a>`), in their order. */
export function extractBookNamesFromArchiveIndex(document: Document): Map<string, string> {
    const names = new Map<string, string>();

    for (const link of findElementsByName(document, "a")) {
        const code = DBS_ARCHIVE_BOOK_FILE_PATTERN.exec(link.getAttribute("href") ?? "")?.[1];
        const name = normalizeInline(link.textContent ?? "");
        if (code !== undefined && name.length > 0 && !names.has(code)) {
            names.set(code, name);
        }
    }

    return names;
}

/**
 * The verses of one EPUB chapter file or one archive book page (`chapter` is then 0: every verse marker
 * names its chapter). Text without paragraph markup (the verses directly in the chapter container) has no
 * paragraphs to keep, so each verse starts its own.
 */
export function extractVersesFromAlephDocument(document: Document, chapter: number): BibleImportVerse[] {
    // One pass over the elements instead of getElementsByTagName("*"), whose collection is slow to copy.
    const elements: Element[] = [];
    collectElements(document.documentElement, elements);
    const elementsById = new Map(elements.filter((element) => element.hasAttribute("id")).map((element) => [element.getAttribute("id") ?? "", element]));
    const content = elementsById.get("chapter_content")
        ?? elements.find((element) => getElementName(element) === "main")
        ?? elements.find((element) => getElementName(element) === "body");
    if (content === undefined) {
        return [];
    }

    const state: ExtractionState = { chapter, verses: [], current: null, paragraphHasText: false, elementsById };
    walk(content, state);
    finishVerse(state);

    if (!hasParagraphMarkup(content)) {
        return state.verses.map((verse) => ({ ...verse, paragraphStart: true }));
    }
    return state.verses;
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
        const classes = getClasses(child);

        if (name === "sup" && classes.includes("v") && (child.hasAttribute("data-verse") || child.hasAttribute("data-id"))) {
            startVerse(state, child);
        } else if (isNoteReference(child)) {
            const footnote = readFootnote(state, child);
            if (state.current !== null && footnote !== null) {
                state.current.footnotes.push(footnote);
            }
        } else if (SKIPPED_ELEMENTS.has(name) || classes.some((value) => NON_VERSE_CLASSES.has(value))) {
            continue;
        } else if (BLOCK_ELEMENTS.has(name)) {
            if (classes.includes("b")) {
                continue;
            }
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

/**
 * EPUB: `data-verse="16"`, or a range for joined verses ("16-17"), the chapter from `data-sid` ("JHN3").
 * Archive: `data-id="JHN_3_16"`, a range as "JHN_3_16-17".
 */
function startVerse(state: ExtractionState, marker: Element): void {
    finishVerse(state);
    const id = /^[0-9A-Z]{3}_(\d+)_(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(marker.getAttribute("data-id") ?? "");
    const range = id === null ? /^(\d+)(?:\s*[-–]\s*(\d+))?/.exec(marker.getAttribute("data-verse") ?? "") : null;
    if (id === null && range === null) {
        return;
    }
    const sidChapter = /(\d+)$/.exec(marker.getAttribute("data-sid") ?? "")?.[1];
    const chapter = id !== null ? Number(id[1]) : sidChapter === undefined ? state.chapter : Number(sidChapter);
    const verse = Number(id !== null ? id[2] : range?.[1]);
    const endText = id !== null ? id[3] : range?.[2];
    const verseEnd = endText === undefined ? undefined : Number(endText);
    state.current = {
        chapter,
        verse,
        verseEnd: verseEnd !== undefined && verseEnd > verse ? verseEnd : undefined,
        text: "",
        footnotes: [],
        paragraphStart: !state.paragraphHasText,
    };
}

function finishVerse(state: ExtractionState): void {
    const current = state.current;
    state.current = null;
    if (current === null) {
        return;
    }
    const text = normalizeVerseText(current.text);
    if (text.length === 0 || current.chapter < 1 || current.verse < 1) {
        return;
    }
    state.verses.push({
        chapter: current.chapter,
        verse: current.verse,
        ...(current.verseEnd === undefined ? {} : { verseEnd: current.verseEnd }),
        text,
        footnotes: current.footnotes,
        paragraphStart: current.paragraphStart,
    });
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

function isNoteReference(element: Element): boolean {
    return getElementName(element) === "a"
        && (element.getAttribute("role") === "doc-noteref" || /\bnoteref\b/.test(element.getAttribute("epub:type") ?? ""));
}

/** The note an `href="#id"` points to, without its back link and the verse it belongs to; cross references are left out. */
function readFootnote(state: ExtractionState, reference: Element): string | null {
    const id = /#(.+)$/.exec(reference.getAttribute("href") ?? "")?.[1];
    const note = id === undefined ? undefined : state.elementsById.get(decodeURIComponent(id));
    if (note === undefined || isCrossReferenceNote(note)) {
        return null;
    }
    const text = normalizeInline(readNoteText(note));
    return text.length > 0 ? text : null;
}

function readNoteText(node: Node): string {
    let text = "";
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (isTextNode(child)) {
            text += child.data;
        } else if (isElementNode(child)) {
            const classes = getClasses(child);
            if (child.getAttribute("role") === "doc-backlink" || /\bbacklink\b/.test(child.getAttribute("epub:type") ?? "") || classes.includes("fr")) {
                continue;
            }
            text += ` ${readNoteText(child)} `;
        }
    }
    return text;
}

function isCrossReferenceNote(note: Element): boolean {
    const classes = [...getClasses(note), ...(note.firstElementChild === null ? [] : getClasses(note.firstElementChild))];
    return classes.some((value) => value === "x" || value === "xt" || value === "xo");
}

function hasParagraphMarkup(content: Element): boolean {
    for (let child = content.firstElementChild; child !== null; child = child.nextElementSibling) {
        const name = getElementName(child);
        if ((name === "p" || name === "div") && !getClasses(child).some((value) => NON_VERSE_CLASSES.has(value))) {
            return true;
        }
    }
    return false;
}

function collectElements(element: Element | null, result: Element[]): void {
    if (element === null) {
        return;
    }
    result.push(element);
    for (let child = element.firstElementChild; child !== null; child = child.nextElementSibling) {
        collectElements(child, result);
    }
}

function getClasses(element: Element): string[] {
    return (element.getAttribute("class") ?? "").split(/\s+/).filter((value) => value.length > 0);
}
