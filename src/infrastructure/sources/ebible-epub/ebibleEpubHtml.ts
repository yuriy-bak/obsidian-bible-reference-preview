import { findElementsByName, getElementName, getTextWithElementBreaks, isElementNode, isTextNode } from "../../epub/MarkupDocument";
import type { BibleImportVerse } from "../BibleIndexBuilder";

// Markup of the EPUB files that eBible.org generates with Haiola from USFM: one XHTML file per book
// (`MAT.xhtml`), verse markers `<span class="verse" id="MT5_3">3 </span>`, paragraph classes named after
// USFM markers (`p`, `m`, `q1`…), footnote markers `<a class="noteref" href="#FN1">` with the notes in
// `<aside epub:type="footnote">` at the end of the file.

/** Classes whose text is not verse text: titles, headings, chapter labels, psalm titles, navigation. */
const NON_VERSE_CLASSES = new Set([
    "mt", "mt1", "mt2", "mt3", "mt4", "mte", "ms", "ms1", "ms2", "ms3", "mr",
    "s", "s1", "s2", "s3", "s4", "sr", "r", "sp", "cl", "cd", "psalmlabel", "chapterlabel",
    "tnav", "footnote", "qa", "rem", "toc1", "toc2", "toc3",
    "is", "is1", "is2", "ip", "ipi", "im", "imi", "imt", "imt1", "imt2", "io", "io1", "io2", "iot", "ie",
]);

/** Psalm titles without a verse number: kept as the heading of the verse 1 that follows. */
const VERSE_HEADING_CLASS = "d";

/** Paragraphs that continue the previous one without a line break (Haiola splits long lines into them). */
const CONTINUATION_CLASSES = new Set(["m", "mi", "nb", "pmc"]);

/** Blank-line markers: neither text nor a new paragraph. */
const SPACER_CLASSES = new Set(["b"]);

/** Book file names by USFM code (`MAT` → "Евангелие от Матфея") from the links of `index.xhtml`. */
export function extractBookNamesFromIndexDocument(document: Document): Map<string, string> {
    const names = new Map<string, string>();

    for (const link of findElementsByName(document, "a")) {
        const match = /^([0-9A-Z]{3})\.xhtml$/.exec(link.getAttribute("href") ?? "");
        const name = normalizeInlineText(link.textContent ?? "");
        if (match !== null && name.length > 0 && !names.has(match[1])) {
            names.set(match[1], name);
        }
    }

    return names;
}

type VerseInProgress = {
    chapter: number;
    verse: number;
    text: string;
    footnoteIds: string[];
    paragraphStart: boolean;
    heading: string | undefined;
};

type ExtractionState = {
    chapterPrefix: string;
    verses: BibleImportVerse[];
    current: VerseInProgress | null;
    /** Text seen since the current paragraph started: a verse marker after it is not a paragraph start. */
    paragraphHasText: boolean;
    footnotes: Map<string, string>;
    /** A psalm title waiting for its verse 1, with the footnotes marked in it. */
    pendingHeading: { text: string; footnoteIds: string[] } | null;
};

/** The verses of one book file, in document order. */
export function extractVersesFromBookDocument(document: Document): BibleImportVerse[] {
    // One pass over the elements instead of getElementsByTagName("*"), whose collection is slow to copy.
    const elements: Element[] = [];
    collectElements(document.documentElement, elements);
    const markers = elements
        .map((element) => getVerseMarker(element, getClasses(element)))
        .filter((marker): marker is VerseMarker => marker !== null);
    if (markers.length === 0 || document.body === null) {
        return [];
    }

    const state: ExtractionState = {
        chapterPrefix: findChapterPrefix(elements, markers),
        verses: [],
        current: null,
        paragraphHasText: false,
        footnotes: extractFootnotes(elements.filter((element) => getElementName(element) === "aside")),
        pendingHeading: null,
    };
    walk(document.body, state);
    finishVerse(state);
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
        const marker = getVerseMarker(child, classes);

        if (marker !== null) {
            startVerse(state, marker);
        } else if (name === "a" && classes.includes("noteref")) {
            const id = (child.getAttribute("href") ?? "").replace(/^#/, "");
            if (state.current !== null && id.length > 0) {
                state.current.footnoteIds.push(id);
            }
        } else if (classes.includes(VERSE_HEADING_CLASS) && !containsVerseMarker(child)) {
            finishVerse(state);
            const heading = readHeading(child);
            state.pendingHeading = state.pendingHeading === null ? heading : {
                text: `${state.pendingHeading.text} ${heading.text}`.trim(),
                footnoteIds: [...state.pendingHeading.footnoteIds, ...heading.footnoteIds],
            };
        } else if (name === "aside" || name === "ul" || name === "hr" || classes.some((value) => NON_VERSE_CLASSES.has(value))) {
            continue;
        } else if (name === "div" || name === "p") {
            if (!classes.some((value) => SPACER_CLASSES.has(value))) {
                startParagraph(state, classes.some((value) => CONTINUATION_CLASSES.has(value)));
            }
            walk(child, state);
        } else if (name === "br") {
            appendBreak(state, "\n");
        } else {
            walk(child, state);
        }
    }
}

function startParagraph(state: ExtractionState, continuation: boolean): void {
    appendBreak(state, continuation ? " " : "\n");
    if (!continuation) {
        state.paragraphHasText = false;
    }
}

function startVerse(state: ExtractionState, marker: VerseMarker): void {
    finishVerse(state);
    const chapterText = marker.stem.slice(state.chapterPrefix.length);
    const chapter = chapterText.length === 0 ? 1 : Number(chapterText);
    // A title goes to the next verse: verse 1 of a psalm, or a verse of the same chapter (the letters of
    // Psalm 119). A title left at the end of a chapter does not move to the next chapter.
    const lastVerse = state.verses[state.verses.length - 1];
    const heading = marker.verse === 1 || lastVerse?.chapter === chapter ? state.pendingHeading : null;
    state.pendingHeading = null;
    state.current = {
        chapter,
        verse: marker.verse,
        text: "",
        footnoteIds: heading?.footnoteIds ?? [],
        paragraphStart: !state.paragraphHasText,
        heading: heading === null || normalizeInlineText(heading.text).length === 0 ? undefined : normalizeInlineText(heading.text),
    };
}

function containsVerseMarker(element: Element): boolean {
    for (let child = element.firstElementChild; child !== null; child = child.nextElementSibling) {
        if (getVerseMarker(child, getClasses(child)) !== null || containsVerseMarker(child)) {
            return true;
        }
    }
    return false;
}

/** The title text without footnote markers; the footnotes go to the verse. */
function readHeading(element: Element): { text: string; footnoteIds: string[] } {
    let text = "";
    const footnoteIds: string[] = [];
    const visit = (node: Node): void => {
        for (let child = node.firstChild; child !== null; child = child.nextSibling) {
            if (isTextNode(child)) {
                text += child.data;
            } else if (isElementNode(child)) {
                if (getElementName(child) === "a" && getClasses(child).includes("noteref")) {
                    const id = (child.getAttribute("href") ?? "").replace(/^#/, "");
                    if (id.length > 0) {
                        footnoteIds.push(id);
                    }
                } else {
                    visit(child);
                }
            }
        }
    };
    visit(element);
    return { text: normalizeInlineText(text), footnoteIds };
}

function finishVerse(state: ExtractionState): void {
    const current = state.current;
    state.current = null;
    if (current === null) {
        return;
    }

    // The KJV marks paragraphs with a pilcrow at the start of the verse.
    const pilcrow = /^\s*¶\s*/.exec(current.text);
    const text = normalizeVerseText(pilcrow === null ? current.text : current.text.slice(pilcrow[0].length));
    if (text.length === 0 || !Number.isInteger(current.chapter) || current.chapter < 1) {
        return;
    }

    state.verses.push({
        chapter: current.chapter,
        verse: current.verse,
        text,
        footnotes: current.footnoteIds
            .map((id) => state.footnotes.get(id))
            .filter((footnote): footnote is string => footnote !== undefined),
        paragraphStart: current.paragraphStart || pilcrow !== null,
        ...(current.heading === undefined ? {} : { heading: current.heading }),
    });
}

function appendText(state: ExtractionState, text: string): void {
    if (text.trim().length > 0) {
        state.paragraphHasText = true;
    }
    // Line breaks of the markup source are spaces; only paragraph boundaries become "\n".
    if (state.current !== null) {
        state.current.text += text.replace(/\s+/g, " ");
    } else if (state.pendingHeading !== null) {
        // Haiola may continue a title in a following paragraph (`<div class='m'>Псалом Давида.</div>`).
        state.pendingHeading.text += ` ${text}`;
    }
}

function appendBreak(state: ExtractionState, separator: string): void {
    if (state.current !== null && state.current.text.trim().length > 0) {
        state.current.text += separator === "\n" ? "\n" : " ";
    }
}

type VerseMarker = {
    /** The id before `_<verse>`: a book prefix and the chapter number (`MT5`, `S11` = 1 Samuel 1). */
    stem: string;
    verse: number;
};

function getVerseMarker(element: Element, classes: string[]): VerseMarker | null {
    if (getElementName(element) !== "span" || !classes.includes("verse")) {
        return null;
    }
    const match = /^(.+)_(\d+)$/.exec(element.getAttribute("id") ?? "");
    return match === null ? null : { stem: match[1], verse: Number(match[2]) };
}

// The book prefix may end with a digit (`S1` for 1 Samuel, `J3` for 3 John), so a verse id alone does not
// tell where the chapter number starts. Chapter labels and chapter links do: `<div id="S11_0"> 1</div>`,
// `<a href="#S11_0">1</a>`. Without them, the part shared by all verse ids is the prefix; a one-chapter
// book shares the whole id, which leaves an empty chapter number, read as chapter 1.
function findChapterPrefix(elements: Element[], markers: VerseMarker[]): string {
    for (const element of elements) {
        const id = /^(.+)_0$/.exec(element.getAttribute("id") ?? "")?.[1]
            ?? /#(.+)_0$/.exec(element.getAttribute("href") ?? "")?.[1];
        if (id === undefined || element.childElementCount > 1) {
            continue;
        }
        const label = element.textContent ?? "";
        const chapter = label.length <= 40 ? /(\d+)\s*$/.exec(label)?.[1] : undefined;
        if (chapter !== undefined && id.endsWith(chapter) && id.length > chapter.length) {
            return id.slice(0, -chapter.length);
        }
    }

    const stems = markers.map((marker) => marker.stem);
    let prefix = stems[0] ?? "";
    for (const stem of stems) {
        while (!stem.startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
        }
    }
    return prefix;
}

/** Footnote texts by id; cross-reference notes (`<p class="x">`) are left out. */
function extractFootnotes(asides: Element[]): Map<string, string> {
    const footnotes = new Map<string, string>();

    for (const aside of asides) {
        const id = aside.getAttribute("id");
        const paragraph = findElementsByName(aside, "p")[0];
        if (id === null || paragraph === undefined || getClasses(paragraph).includes("x")) {
            continue;
        }

        let text = "";
        for (let child = paragraph.firstChild; child !== null; child = child.nextSibling) {
            if (isElementNode(child) && (child.getAttribute("class") ?? "").includes("notebackref")) {
                continue;
            }
            text += isTextNode(child) ? child.data : isElementNode(child) ? getTextWithElementBreaks(child) : "";
        }

        const footnote = normalizeInlineText(text);
        if (footnote.length > 0) {
            footnotes.set(id, footnote);
        }
    }

    return footnotes;
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

function normalizeVerseText(text: string): string {
    return text
        .split("\n")
        .map(normalizeInlineText)
        .filter((line) => line.length > 0)
        .join("\n");
}

function normalizeInlineText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}
