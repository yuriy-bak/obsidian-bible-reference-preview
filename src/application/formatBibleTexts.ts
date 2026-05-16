import { BibleReference } from "../domain/BibleReference";
import { Verse } from "../domain/BibleText";
import { ChapterVerseRange } from "../domain/ChapterVerseRange";
import { BookMapping } from "../parsing/BookMapping";
import { formatBibleReference } from "../parsing/formatBibleReference";
import { BibleTextBlock, BibleTextPart } from "./BibleTextBlock";

const DEFAULT_MISSING_VERSE_TEXT = "[стих не найден]";
const DIFFERENT_BOOK_SEPARATOR = "__________";

export function formatBibleTextBlocks(blocks: BibleTextBlock[], mapping: BookMapping, missingVerseText = DEFAULT_MISSING_VERSE_TEXT): string {
    const lines: string[] = [];
    let previousReference: BibleReference | null = null;

    for (const block of blocks) {
        const formattedBlock = formatBibleTextBlock(block, mapping, missingVerseText);
        if (formattedBlock.length === 0) {
            continue;
        }

        if (previousReference !== null) {
            if (previousReference.book !== block.reference.book) {
                lines.push(DIFFERENT_BOOK_SEPARATOR);
            } else {
                lines.push("");
            }
        }

        lines.push(formattedBlock);
        previousReference = block.reference;
    }

    return lines.join("\n");
}

function formatBibleTextBlock(block: BibleTextBlock, mapping: BookMapping, missingVerseText: string): string {
    const verseLines: string[] = [];
    const footnoteLines: string[] = [];

    for (const part of block.parts) {
        const versesByNumber = new Map<number, Verse>();
        for (const verse of part.bibleText?.verses ?? []) {
            versesByNumber.set(verse.number, verse);
        }

        for (const verseNumber of getVerseNumbersToRender(part)) {
            const verse = versesByNumber.get(verseNumber);
            if (verse === undefined) {
                verseLines.push(`${verseNumber}. ${missingVerseText}`);
                continue;
            }

            verseLines.push(`${verse.number}. ${verse.text}`);
            footnoteLines.push(...formatVerseFootnotes(part.range, verse, mapping));
        }
    }

    if (verseLines.length === 0) {
        return "";
    }

    const lines = [
        formatBibleReference(block.reference, mapping),
        ...verseLines,
    ];

    if (footnoteLines.length > 0) {
        lines.push("", ...footnoteLines);
    }

    return lines.join("\n");
}

function getVerseNumbersToRender(part: BibleTextPart): number[] {
    if (part.range.verseEnd !== undefined) {
        return createNumberRange(part.range.verseStart, part.range.verseEnd);
    }

    return (part.bibleText?.verses ?? [])
        .map((verse) => verse.number)
        .filter((verseNumber) => verseNumber >= part.range.verseStart)
        .sort((left, right) => left - right);
}

function createNumberRange(start: number, end: number): number[] {
    const result: number[] = [];

    for (let value = start; value <= end; value += 1) {
        result.push(value);
    }

    return result;
}

function formatVerseFootnotes(range: ChapterVerseRange, verse: Verse, mapping: BookMapping): string[] {
    return verse.footnotes.map((footnote) => `^${formatVerseReference(range, verse.number, mapping)} ${footnote}`);
}

function formatVerseReference(range: ChapterVerseRange, verseNumber: number, mapping: BookMapping): string {
    const bookName = mapping.idToDisplayName.get(range.book) ?? String(range.book);

    if (mapping.oneChapterBooks.has(range.book)) {
        return `${bookName} ${verseNumber}`;
    }

    return `${bookName} ${range.chapter}:${verseNumber}`;
}
