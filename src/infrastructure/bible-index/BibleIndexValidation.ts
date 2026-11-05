import { isVersificationKey } from "../../versification/VersificationRegistry";
import { BibleIndexBookMetadata, BibleIndexData, BibleIndexTranslationMetadata } from "./BibleIndexData";

const TRANSLATION_ID_PATTERN = /^[a-z0-9-]+$/;
const BOOK_ID_PATTERN = /^\d+$/;

/**
 * Drops translations and books whose ids or file paths are unsafe. bibles-index.json is a local
 * plugin file, but its keys end up in file paths (book loading, translation removal).
 */
export function sanitizeBibleIndexData(data: BibleIndexData): BibleIndexData {
    const translations: Record<string, BibleIndexTranslationMetadata> = {};

    for (const [translationId, translation] of Object.entries(data.translations)) {
        if (!TRANSLATION_ID_PATTERN.test(translationId) || !isTranslationMetadata(translation)) {
            console.warn("Skipping invalid translation in Bible index", translationId);
            continue;
        }

        const books: Record<string, BibleIndexBookMetadata> = {};
        for (const [bookId, book] of Object.entries(translation.books)) {
            if (!BOOK_ID_PATTERN.test(bookId) || !isBookMetadata(book) || !isSafeBookPath(book.path, translationId)) {
                console.warn("Skipping invalid book in Bible index", translationId, bookId);
                continue;
            }
            books[bookId] = book;
        }

        const sanitized: BibleIndexTranslationMetadata = { ...translation, books };
        if (!isVersificationKey(sanitized.versification)) {
            delete sanitized.versification;
        }
        if (!isBookOrder(sanitized.bookOrder, books)) {
            delete sanitized.bookOrder;
        }
        translations[translationId] = sanitized;
    }

    return { version: 2, translations };
}

function isSafeBookPath(path: string, translationId: string): boolean {
    if (path.includes("\\") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
        return false;
    }

    const parts = path.split("/");
    if (parts.some((part) => part === "" || part === "." || part === "..")) {
        return false;
    }

    return parts[0] === "translations" && parts[1] === translationId && parts.length > 2;
}

function isTranslationMetadata(value: unknown): value is BibleIndexTranslationMetadata {
    return isRecord(value)
        && typeof value.name === "string"
        && typeof value.language === "string"
        && isRecord(value.books);
}

function isBookMetadata(value: unknown): value is BibleIndexBookMetadata {
    return isRecord(value)
        && typeof value.name === "string"
        && typeof value.abbreviation === "string"
        && Array.isArray(value.aliases)
        && value.aliases.every((alias) => typeof alias === "string")
        && typeof value.path === "string";
}

function isBookOrder(value: unknown, books: Record<string, BibleIndexBookMetadata>): value is number[] {
    return Array.isArray(value)
        && value.every((bookId) => Number.isInteger(bookId) && books[String(bookId)] !== undefined)
        && new Set(value).size === value.length
        && value.length === Object.keys(books).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
