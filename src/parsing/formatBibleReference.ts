import { BibleReference } from "../domain/BibleReference";
import { BookMapping } from "./BookMapping";

export function formatBibleReference(reference: BibleReference, mapping: BookMapping): string {
    const bookName = mapping.idToDisplayName.get(reference.book) ?? String(reference.book);
    const referenceText = mapping.oneChapterBooks.has(reference.book)
        ? formatOneChapterReference(reference)
        : formatRegularReference(reference);

    return `📖 ${bookName} ${referenceText}`;
}

function formatRegularReference(reference: BibleReference): string {
    if (isSingleVerse(reference)) {
        return `${reference.chapterStart}:${reference.verseStart}`;
    }

    if (isSameChapterReference(reference)) {
        return `${reference.chapterStart}:${reference.verseStart}-${reference.verseEnd}`;
    }

    return `${reference.chapterStart}:${reference.verseStart}-${reference.chapterEnd}:${reference.verseEnd}`;
}

function formatOneChapterReference(reference: BibleReference): string {
    if (reference.verseStart === reference.verseEnd) {
        return String(reference.verseStart);
    }

    return `${reference.verseStart}-${reference.verseEnd}`;
}

function isSingleVerse(reference: BibleReference): boolean {
    return isSameChapterReference(reference) && reference.verseStart === reference.verseEnd;
}

function isSameChapterReference(reference: BibleReference): boolean {
    return reference.chapterStart === reference.chapterEnd;
}
