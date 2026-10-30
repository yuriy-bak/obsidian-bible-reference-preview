import { BibleBook } from "../../../domain/BibleBook";
import {
    findElementsByName,
    findFirstElementByName,
    getElementName,
    getTextWithElementBreaks,
    isElementNode,
    isTextNode,
} from "../../epub/MarkupDocument";
import { BibleImportVerse } from "../BibleIndexBuilder";

export type ExtractedVerse = BibleImportVerse;

export type ExtractedBookTable = {
    books: BibleBook[];
    hrefToBookId: Record<string, number>;
};

export function extractBookTableFromDocument(document: Document): ExtractedBookTable | null {
    const tableBookList = extractBookTableFromRows(document);
    if (tableBookList !== null) {
        return tableBookList;
    }

    return extractBookTableFromNavigationLinks(document);
}

export function enrichBookTableFromNavigationDocument(bookTable: ExtractedBookTable, path: string, document: Document): void {
    const navigationFileName = normalizeHrefFileName(path);
    const bookId = getBookIdFromNavigationHref(navigationFileName, bookTable);
    if (bookId === null) {
        return;
    }

    const bookName = extractBookNameFromNavigationDocument(document);
    if (bookName !== null) {
        const book = bookTable.books.find((candidate) => candidate.id === bookId);
        if (book !== undefined && book.name === book.abbreviation) {
            book.name = bookName;
            book.aliases = [book.name, book.abbreviation];
        }
    }

    addBookContentHrefsFromNavigationDocument(bookTable, bookId, document);
}

export function extractBookNavigationAliasesFromDocument(
    document: Document,
    bookTable: ExtractedBookTable,
): Record<number, string[]> {
    const aliasesByBookId: Record<number, string[]> = {};

    for (const link of findElementsByName(document, "a")) {
        const rawHref = link.getAttribute("href");
        if (rawHref === null || rawHref.length === 0) {
            continue;
        }

        const href = normalizeHrefFileName(rawHref);
        const alias = getElementText(link);

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

// Verse text runs from a verse marker (`<span id="chapterN_verseM">`) to the next marker or to the
// footnote block, across paragraph boundaries. The document is flattened into a stream of pieces
// (text, and sentinels for tags) so a verse is a contiguous slice of that stream.
const PARAGRAPH_OPEN = "\u0001";
const PARAGRAPH_CLOSE = "\u0002";
const TAG_BOUNDARY = "\u0003";

type VerseMarker = {
    pieceIndex: number;
    chapter: number;
    verse: number;
};

type FootnoteReference = {
    pieceIndex: number;
    id: string;
};

/** A psalm title (`<p class="sw">`), out of the verse text: the heading of the verse 1 after it. */
type Superscription = {
    start: number;
    end: number;
    text: string;
};

type FlattenedDocument = {
    pieces: string[];
    markers: VerseMarker[];
    superscriptions: Superscription[];
    footnoteReferences: FootnoteReference[];
    paragraphOpenIndexes: number[];
    paragraphCloseIndexes: number[];
    footnoteGroupIndex: number | null;
};

export function extractVersesFromDocument(document: Document): ExtractedVerse[] {
    const flattened = flattenDocument(document);
    const { pieces, markers, footnoteGroupIndex } = flattened;
    const result: ExtractedVerse[] = [];

    for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index];
        const contentStart = marker.pieceIndex + 1;
        const nextMarkerIndex = markers[index + 1]?.pieceIndex ?? pieces.length;
        const contentEnd = Math.min(
            nextMarkerIndex,
            footnoteGroupIndex !== null && footnoteGroupIndex > marker.pieceIndex ? footnoteGroupIndex : pieces.length,
            ...flattened.superscriptions
                .filter((superscription) => superscription.start > marker.pieceIndex && superscription.start < nextMarkerIndex)
                .map((superscription) => superscription.start),
        );
        const previousMarkerIndex = markers[index - 1]?.pieceIndex ?? -1;
        const superscription = marker.verse === 1
            ? flattened.superscriptions.filter((item) => item.start > previousMarkerIndex && item.end <= marker.pieceIndex).pop()
            : undefined;

        const text = normalizeVerseText(joinVersePieces(pieces.slice(contentStart, contentEnd)));
        if (text.length === 0) {
            continue;
        }

        result.push({
            chapter: marker.chapter,
            verse: marker.verse,
            text,
            footnotes: [
                ...(superscription === undefined ? [] : extractFootnotes(document, flattened.footnoteReferences, superscription.start, superscription.end)),
                ...extractFootnotes(document, flattened.footnoteReferences, contentStart, contentEnd),
            ],
            paragraphStart: isParagraphStart(flattened, marker.pieceIndex, markers[index - 1]?.pieceIndex),
            ...(superscription === undefined || superscription.text.length === 0 ? {} : { heading: superscription.text }),
        });
    }

    return result;
}

function flattenDocument(document: Document): FlattenedDocument {
    const flattened: FlattenedDocument = {
        pieces: [],
        markers: [],
        superscriptions: [],
        footnoteReferences: [],
        paragraphOpenIndexes: [],
        paragraphCloseIndexes: [],
        footnoteGroupIndex: null,
    };

    if (document.documentElement !== null) {
        flattenNode(document.documentElement, flattened, false);
    }

    return flattened;
}

function flattenNode(node: Node, flattened: FlattenedDocument, suppressed: boolean): void {
    if (isTextNode(node)) {
        flattened.pieces.push(suppressed ? "" : node.data);
        return;
    }

    if (!isElementNode(node)) {
        return;
    }

    const name = getElementName(node);
    const openIndex = flattened.pieces.length;
    let suppressChildren = suppressed;
    let openPiece = name === "p" ? PARAGRAPH_OPEN : name === "br" ? "\n" : TAG_BOUNDARY;

    const verseMarker = getVerseMarker(node, name);
    if (verseMarker !== null) {
        flattened.markers.push({ pieceIndex: openIndex, ...verseMarker });
    }
    if (flattened.footnoteGroupIndex === null && isFootnoteGroup(node, name)) {
        flattened.footnoteGroupIndex = openIndex;
    }
    if (name === "p") {
        flattened.paragraphOpenIndexes.push(openIndex);
    }

    const isSuperscription = !suppressed && name === "p" && (node.getAttribute("class") ?? "").split(/\s+/).includes("sw")
        && !/\bid="chapter\d+_verse\d+"/i.test(node.innerHTML ?? "");
    if (isSuperscription) {
        openPiece = "";
    }

    const footnoteId = getFootnoteReferenceId(node, name);
    if (footnoteId !== null) {
        flattened.footnoteReferences.push({ pieceIndex: openIndex, id: footnoteId });
        openPiece = getTextWithElementBreaks(node);
        suppressChildren = true;
    } else if (isVerseNumberMarkup(node, name)) {
        openPiece = "";
        suppressChildren = true;
    }

    flattened.pieces.push(suppressed ? "" : openPiece);
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        flattenNode(child, flattened, suppressChildren || isSuperscription);
    }
    if (isSuperscription) {
        flattened.superscriptions.push({ start: openIndex, end: flattened.pieces.length, text: readSuperscriptionText(node) });
    }

    if (name === "p") {
        flattened.paragraphCloseIndexes.push(flattened.pieces.length);
    }
    const closePiece = name === "p" ? PARAGRAPH_CLOSE : name === "br" ? "" : TAG_BOUNDARY;
    flattened.pieces.push(suppressChildren || suppressed ? "" : closePiece);
}

/** The title text without footnote markers and page numbers. */
function readSuperscriptionText(element: Element): string {
    let text = "";
    for (let child = element.firstChild; child !== null; child = child.nextSibling) {
        if (isTextNode(child)) {
            text += child.data;
        } else if (isElementNode(child) && getFootnoteReferenceId(child, getElementName(child)) === null) {
            text += readSuperscriptionText(child);
        }
    }
    return text.replace(/\s+/g, " ").trim();
}

function getVerseMarker(element: Element, name: string): { chapter: number; verse: number } | null {
    if (name !== "span" && name !== "a") {
        return null;
    }

    const match = /^chapter(\d+)_verse(\d+)$/i.exec(element.getAttribute("id") ?? "");
    return match === null ? null : { chapter: Number(match[1]), verse: Number(match[2]) };
}

function isFootnoteGroup(element: Element, name: string): boolean {
    if (name === "div" && (element.getAttribute("class") ?? "").includes("groupFootnote")) {
        return true;
    }

    return (name === "aside" || name === "div") && element.getAttribute("epub:type") === "footnote";
}

function getFootnoteReferenceId(element: Element, name: string): string | null {
    if (name !== "a") {
        return null;
    }

    const href = element.getAttribute("href") ?? "";
    return href.startsWith("#") && href.length > 1 ? href.slice(1) : null;
}

/** Chapter numbers (`<span class="w_ch">`) and verse numbers (`<strong><sup>7</sup></strong>`) are not verse text. */
function isVerseNumberMarkup(element: Element, name: string): boolean {
    if (name === "span") {
        return (element.getAttribute("class") ?? "").includes("w_ch");
    }

    if (name !== "strong" || element.attributes.length > 0) {
        return false;
    }

    const children = Array.from(element.childNodes).filter((child) => !(isTextNode(child) && child.data.trim().length === 0));
    if (children.length !== 1 || !isElementNode(children[0])) {
        return false;
    }

    const sup = children[0];
    return getElementName(sup) === "sup"
        && sup.attributes.length === 0
        && sup.childNodes.length === 1
        && isTextNode(sup.childNodes[0])
        && /^\d+$/.test(sup.childNodes[0].data);
}

function joinVersePieces(pieces: string[]): string {
    return pieces
        .join("")
        .replace(new RegExp(`${PARAGRAPH_CLOSE}\\s*${PARAGRAPH_OPEN}`, "g"), "\n")
        .replace(new RegExp(`[${PARAGRAPH_OPEN}${PARAGRAPH_CLOSE}]`, "g"), "")
        .replace(new RegExp(TAG_BOUNDARY, "g"), " ");
}

function isParagraphStart(flattened: FlattenedDocument, markerIndex: number, previousMarkerIndex: number | undefined): boolean {
    const paragraphStartIndex = findLastIndexBefore(flattened.paragraphOpenIndexes, markerIndex);

    if (paragraphStartIndex === null) {
        return true;
    }

    const paragraphEndBeforeMarker = findLastIndexBefore(flattened.paragraphCloseIndexes, markerIndex);

    if (paragraphEndBeforeMarker !== null && paragraphEndBeforeMarker > paragraphStartIndex) {
        return true;
    }

    return previousMarkerIndex === undefined || previousMarkerIndex < paragraphStartIndex;
}

function findLastIndexBefore(sortedIndexes: number[], beforeIndex: number): number | null {
    let result: number | null = null;

    for (const index of sortedIndexes) {
        if (index >= beforeIndex) {
            break;
        }
        result = index;
    }

    return result;
}

function extractFootnotes(document: Document, references: FootnoteReference[], contentStart: number, contentEnd: number): string[] {
    const footnotes: string[] = [];

    for (const reference of references) {
        if (reference.pieceIndex < contentStart || reference.pieceIndex >= contentEnd) {
            continue;
        }

        const element = document.getElementById(reference.id);
        const footnoteText = element === null ? "" : cleanupFootnoteText(getElementText(element));
        if (footnoteText.length > 0) {
            footnotes.push(footnoteText);
        }
    }

    return footnotes;
}

function extractBookTableFromRows(document: Document): ExtractedBookTable | null {
    const books: BibleBook[] = [];
    const hrefToBookId: Record<string, number> = {};

    for (const row of findElementsByName(document, "tr")) {
        const cells = findElementsByName(row, "td");
        if (cells.length < 3) {
            continue;
        }

        const href = extractFirstHref(cells[0]);
        if (href === null || !isCanonicalBibleBookHref(href)) {
            continue;
        }

        const name = getElementText(cells[0]);
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

function extractBookTableAbbreviation(cells: Element[]): string | null {
    for (let index = 1; index < cells.length; index += 1) {
        if (extractFirstHref(cells[index]) !== null) {
            continue;
        }

        const candidate = getElementText(cells[index]);

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

function extractBookTableFromNavigationLinks(document: Document): ExtractedBookTable | null {
    const booksById = new Map<number, BibleBook>();
    const hrefToBookId: Record<string, number> = {};

    for (const link of findElementsByName(document, "a")) {
        const href = link.getAttribute("href") ?? "";
        const match = /BIBLE_(\d{2})\.xhtml$/i.exec(href);
        if (match === null) {
            continue;
        }

        const id = Number(match[1]);
        if (id < 1 || id > 66 || booksById.has(id)) {
            continue;
        }

        const abbreviation = getElementText(link);
        if (!isBookNavigationAlias(abbreviation)) {
            continue;
        }

        booksById.set(id, {
            id,
            name: abbreviation,
            abbreviation,
            aliases: [abbreviation],
        });
        hrefToBookId[normalizeHrefFileName(href)] = id;
    }

    if (booksById.size !== 66) {
        return null;
    }

    return {
        books: Array.from(booksById.values()).sort((left, right) => left.id - right.id),
        hrefToBookId,
    };
}

function addBookContentHrefsFromNavigationDocument(bookTable: ExtractedBookTable, bookId: number, document: Document): void {
    for (const element of Array.from(document.getElementsByTagName("*"))) {
        const href = element.getAttribute("href");
        if (href === null || !/^[^"']+\.xhtml(?:#[^"']*)?$/i.test(href)) {
            continue;
        }

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

function extractBookNameFromNavigationDocument(document: Document): string | null {
    const titleElement = findFirstElementByName(document, "title");
    const title = removeNavigationSuffix(titleElement === null ? "" : getElementText(titleElement));
    if (isBookNavigationAlias(title)) {
        return title;
    }

    const headingElement = Array.from(document.getElementsByTagName("*")).find((element) => /^h[1-6]$/.test(getElementName(element)));
    const heading = removeNavigationSuffix(headingElement === undefined ? "" : getElementText(headingElement));
    if (isBookNavigationAlias(heading)) {
        return heading;
    }

    return null;
}

function removeNavigationSuffix(value: string): string {
    return value.replace(/\s*\([^)]*Navigation[^)]*\)\s*$/i, "").trim();
}

function extractFirstHref(element: Element): string | null {
    const linkedElement = Array.from(element.getElementsByTagName("*")).find((candidate) => candidate.hasAttribute("href"));
    return linkedElement?.getAttribute("href") ?? null;
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

export function normalizeHrefFileName(href: string): string {
    return href.split("#")[0].split("?")[0].split("/").pop() ?? href;
}

export function canonicalVerseDocumentFileName(fileName: string): string {
    return fileName.replace(/-split\d+(?=\.xhtml$)/i, "");
}

function isCompleteBibleBookTable(books: BibleBook[]): boolean {
    return books.length === 66;
}

function getElementText(element: Element): string {
    return normalizeText(getTextWithElementBreaks(element));
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

function normalizeText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function cleanupFootnoteText(text: string): string {
    return text.replace(/^\^\s+[^\s]+\s+\d+:\d+\s*/, "").trim();
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

function containsLetter(value: string): boolean {
    return Array.from(value).some((character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase());
}
