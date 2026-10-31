import { BibleReference } from "../domain/BibleReference";
import { BookMapping, normalizeBookAlias } from "./BookMapping";
import { normalizeSearchText } from "./searchTextNormalization";
import { normalizeTranslationCode } from "../translations/translationCodes";

type BookAliasCandidate = {
    alias: string;
    bookId: number;
    isShortBook: boolean;
};

type ReferenceCandidate = {
    index: number;
    endIndex: number;
    bookId: number;
    body: string;
    isShortBook: boolean;
};

type NormalizedLine = {
    text: string;
    offsets: number[];
};

// Bump when the parsing rules change, so indexes built by the old rules are rebuilt.
export const BIBLE_REFERENCE_PARSER_VERSION = 3;

/**
 * Identifies what the parser recognizes: the rules version and the book aliases.
 * Stored with the reference usage index; a different signature means the notes must be parsed again.
 */
export function getBibleReferenceParserSignature(mapping: BookMapping, extra = ""): string {
    const aliasEntries = [...mapping.nameToId.entries()]
        .map(([alias, bookId]) => `${alias}=${bookId}${mapping.shortBooks.has(alias) ? "s" : mapping.bigBooks.has(alias) ? "b" : ""}`)
        .sort();
    const oneChapterBooks = [...mapping.oneChapterBooks].sort((left, right) => left - right);
    const source = `${aliasEntries.join("\n")}\n#${oneChapterBooks.join(",")}\n${extra}`;
    return `${BIBLE_REFERENCE_PARSER_VERSION}:${aliasEntries.length}:${hashFnv1a(source)}`;
}

function hashFnv1a(text: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export type BibleReferenceMatch = {
    from: number;
    to: number;
    text: string;
    references: BibleReference[];
    /**
     * Set when a translation code follows the reference ("Пс 22:1 (СП)"): the translation it names and the
     * references in that translation's numbering. `references` are in the active translation's numbering
     * once PluginContext has mapped them.
     */
    translationId?: string;
    translationReferences?: BibleReference[];
};

/** A translation code in brackets right after a reference: "Пс 22:1 (СП)", "Ps 23:1(KJV)". */
const TRANSLATION_CODE_SUFFIX_PATTERN = /^[ \t]?\(([^()\s]{1,12})\)/u;

export class BibleReferenceParser {
    // Aliases grouped by their first character, longest first within each group.
    private readonly aliasesByFirstCharacter: Map<string, BookAliasCandidate[]>;

    /** @param translationCodes translation ids by normalized code (normalizeTranslationCode) */
    constructor(mapping: BookMapping, private readonly translationCodes: ReadonlyMap<string, string> = new Map()) {
        this.aliasesByFirstCharacter = this.groupAliasesByFirstCharacter(this.createBookAliases(mapping));
    }

    parse(text: string): BibleReference[] {
        return this.parseMatches(text).flatMap((match) => match.references);
    }

    parseMatches(text: string): BibleReferenceMatch[] {
        try {
            const normalizedLine = this.normalizeLineWithOffsets(text);
            const candidates = this.findReferenceCandidates(normalizedLine.text);
            const matches: BibleReferenceMatch[] = [];

            for (const candidate of candidates) {
                const candidateReferences = candidate.isShortBook
                    ? this.parseShortBookBody(candidate.bookId, candidate.body)
                    : this.parseBigBookBody(candidate.bookId, candidate.body);
                const references = this.mergeAdjacentReferences(candidateReferences);

                if (references.length === 0) {
                    continue;
                }

                const from = normalizedLine.offsets[candidate.index];
                const lastOffset = normalizedLine.offsets[candidate.endIndex - 1];

                if (from === undefined || lastOffset === undefined) {
                    continue;
                }

                const codeSuffix = this.readTranslationCodeSuffix(text, lastOffset + 1);
                const to = lastOffset + 1 + (codeSuffix?.length ?? 0);
                matches.push({
                    from,
                    to,
                    text: text.slice(from, to),
                    references,
                    ...(codeSuffix === null ? {} : { translationId: codeSuffix.translationId }),
                });
            }

            return matches;
        } catch {
            return [];
        }
    }

    private readTranslationCodeSuffix(text: string, index: number): { length: number; translationId: string } | null {
        if (this.translationCodes.size === 0) {
            return null;
        }
        const match = TRANSLATION_CODE_SUFFIX_PATTERN.exec(text.slice(index, index + 16));
        const translationId = match === null ? undefined : this.translationCodes.get(normalizeTranslationCode(match[1]));
        return match === null || translationId === undefined ? null : { length: match[0].length, translationId };
    }

    private normalizeLineWithOffsets(text: string): NormalizedLine {
        // One pass: characters are normalized via a per-character cache, whitespace runs collapse
        // to one space, and a space next to a reference delimiter (",", ":", ";") is dropped.
        let normalizedText = "";
        const offsets: number[] = [];
        let lastCharacter = "";
        let pendingSpaceOffset = -1;

        for (let index = 0; index < text.length; index += 1) {
            const normalizedCharacters = normalizeSearchCharacter(text[index]);

            for (let characterIndex = 0; characterIndex < normalizedCharacters.length; characterIndex += 1) {
                const character = normalizedCharacters[characterIndex];

                if (character === " ") {
                    if (lastCharacter !== "" && pendingSpaceOffset < 0) {
                        pendingSpaceOffset = index;
                    }
                    continue;
                }

                if (pendingSpaceOffset >= 0) {
                    if (!isReferenceDelimiter(lastCharacter) && !isReferenceDelimiter(character)) {
                        normalizedText += " ";
                        offsets.push(pendingSpaceOffset);
                    }
                    pendingSpaceOffset = -1;
                }

                normalizedText += character;
                offsets.push(index);
                lastCharacter = character;
            }
        }

        return {
            text: normalizedText,
            offsets,
        };
    }

    private createBookAliases(mapping: BookMapping): BookAliasCandidate[] {
        const aliases: BookAliasCandidate[] = [];

        for (const alias of mapping.bigBooks) {
            const normalizedAlias = normalizeBookAlias(alias);
            const bookId = mapping.nameToId.get(normalizedAlias);

            if (bookId === undefined) {
                continue;
            }

            aliases.push({
                alias: normalizedAlias,
                bookId,
                isShortBook: false,
            });
        }

        for (const alias of mapping.shortBooks) {
            const normalizedAlias = normalizeBookAlias(alias);
            const bookId = mapping.nameToId.get(normalizedAlias);

            if (bookId === undefined) {
                continue;
            }

            aliases.push({
                alias: normalizedAlias,
                bookId,
                isShortBook: true,
            });
        }

        return aliases
            .filter((candidate) => candidate.alias.length > 0)
            .sort((left, right) => right.alias.length - left.alias.length);
    }

    private groupAliasesByFirstCharacter(aliases: BookAliasCandidate[]): Map<string, BookAliasCandidate[]> {
        const groups = new Map<string, BookAliasCandidate[]>();

        for (const aliasCandidate of aliases) {
            const firstCharacter = aliasCandidate.alias[0];
            const group = groups.get(firstCharacter);

            if (group === undefined) {
                groups.set(firstCharacter, [aliasCandidate]);
            } else {
                group.push(aliasCandidate);
            }
        }

        return groups;
    }

    private findReferenceCandidates(text: string): ReferenceCandidate[] {
        const candidates: ReferenceCandidate[] = [];

        let index = 0;

        while (index < text.length) {
            const aliases = this.aliasesByFirstCharacter.get(text[index]);

            if (aliases === undefined || !this.isReferenceBoundary(text, index)) {
                index += 1;
                continue;
            }

            const candidate = this.findReferenceCandidateAt(text, index, aliases);

            if (candidate === null) {
                index += 1;
                continue;
            }

            candidates.push(candidate);
            index = candidate.endIndex;
        }

        return candidates;
    }

    private findReferenceCandidateAt(
        text: string,
        index: number,
        aliases: BookAliasCandidate[],
    ): ReferenceCandidate | null {
        for (const aliasCandidate of aliases) {
            if (!text.startsWith(aliasCandidate.alias, index)) {
                continue;
            }

            const afterAliasIndex = this.skipOptionalDotAndSpaces(
                text,
                index + aliasCandidate.alias.length,
            );

            const bodyMatch = matchStickyPattern(
                aliasCandidate.isShortBook ? SHORT_BOOK_BODY_PATTERN : BIG_BOOK_BODY_PATTERN,
                text,
                afterAliasIndex,
            );

            if (bodyMatch === null) {
                continue;
            }

            return {
                index,
                endIndex: afterAliasIndex + bodyMatch.length,
                bookId: aliasCandidate.bookId,
                body: bodyMatch,
                isShortBook: aliasCandidate.isShortBook,
            };
        }

        return null;
    }

    private skipOptionalDotAndSpaces(text: string, index: number): number {
        let currentIndex = index;

        if (text[currentIndex] === ".") {
            currentIndex += 1;
        }

        while (text[currentIndex] === " ") {
            currentIndex += 1;
        }

        return currentIndex;
    }

    private isReferenceBoundary(text: string, index: number): boolean {
        if (index === 0) {
            return true;
        }

        return !/[\p{L}\p{N}]/u.test(text[index - 1]);
    }

    private parseBigBookBody(bookId: number, body: string): BibleReference[] {
        const references: BibleReference[] = [];
        const parts = this.parseMultichapters(body);

        for (const part of parts) {
            const chapterMatch = /^(\d+):(.+)$/.exec(part);
            if (chapterMatch === null) {
                continue;
            }

            const chapter = Number(chapterMatch[1]);
            if (!this.isPositiveInteger(chapter)) {
                continue;
            }

            this.addBigBookReferences(references, bookId, chapter, chapterMatch[2]);
        }

        return references;
    }

    private parseShortBookBody(bookId: number, body: string): BibleReference[] {
        const references: BibleReference[] = [];
        const parts = body.split(";").filter((part) => part.length > 0);

        for (const part of parts) {
            this.addShortBookReferences(references, bookId, part.startsWith("1:") ? part.slice(2) : part);
        }

        return references;
    }

    private parseMultichapters(body: string): string[] {
        return body.split(";").filter((part) => part.length > 0);
    }

    private addBigBookReferences(
        references: BibleReference[],
        bookId: number,
        chapter: number,
        verseExpression: string,
    ): void {
        const verseParts = verseExpression.split(",");

        for (const versePart of verseParts) {
            const multiChapterRange = /^(\d+)-(\d+):(\d+)$/.exec(versePart);
            if (multiChapterRange !== null) {
                const verseStart = Number(multiChapterRange[1]);
                const chapterEnd = Number(multiChapterRange[2]);
                const verseEnd = Number(multiChapterRange[3]);

                this.addReference(references, {
                    book: bookId,
                    chapterStart: chapter,
                    verseStart,
                    chapterEnd,
                    verseEnd,
                });
                continue;
            }

            const sameChapterRange = /^(\d+)-(\d+)$/.exec(versePart);
            if (sameChapterRange !== null) {
                const verseStart = Number(sameChapterRange[1]);
                const verseEnd = Number(sameChapterRange[2]);

                this.addReference(references, {
                    book: bookId,
                    chapterStart: chapter,
                    verseStart,
                    chapterEnd: chapter,
                    verseEnd,
                });
                continue;
            }

            if (/^\d+$/.test(versePart)) {
                const verse = Number(versePart);
                this.addReference(references, {
                    book: bookId,
                    chapterStart: chapter,
                    verseStart: verse,
                    chapterEnd: chapter,
                    verseEnd: verse,
                });
            }
        }
    }

    private addShortBookReferences(
        references: BibleReference[],
        bookId: number,
        verseExpression: string,
    ): void {
        const verseParts = verseExpression.split(",");

        for (const versePart of verseParts) {
            const range = /^(\d+)-(\d+)$/.exec(versePart);
            if (range !== null) {
                this.addReference(references, {
                    book: bookId,
                    chapterStart: 1,
                    verseStart: Number(range[1]),
                    chapterEnd: 1,
                    verseEnd: Number(range[2]),
                });
                continue;
            }

            if (/^\d+$/.test(versePart)) {
                const verse = Number(versePart);
                this.addReference(references, {
                    book: bookId,
                    chapterStart: 1,
                    verseStart: verse,
                    chapterEnd: 1,
                    verseEnd: verse,
                });
            }
        }
    }

    private addReference(references: BibleReference[], reference: BibleReference): void {
        if (!this.isValidReference(reference)) {
            return;
        }

        references.push(reference);
    }

    private mergeAdjacentReferences(references: BibleReference[]): BibleReference[] {
        const result: BibleReference[] = [];
        let previousSource: BibleReference | undefined;

        for (const reference of references) {
            // "14,14" is a typo: drop a part that repeats the one right before it.
            // A repeat further on ("14,16,14", "14,1-30") is kept on purpose.
            if (previousSource !== undefined && this.isSameReference(previousSource, reference)) {
                continue;
            }
            previousSource = reference;

            const previous = result[result.length - 1];

            if (previous !== undefined && this.canMerge(previous, reference)) {
                previous.verseEnd = reference.verseEnd;
                continue;
            }

            result.push({ ...reference });
        }

        return result;
    }

    private isSameReference(left: BibleReference, right: BibleReference): boolean {
        return left.book === right.book
            && left.chapterStart === right.chapterStart
            && left.verseStart === right.verseStart
            && left.chapterEnd === right.chapterEnd
            && left.verseEnd === right.verseEnd;
    }

    private canMerge(left: BibleReference, right: BibleReference): boolean {
        return left.book === right.book
            && left.chapterStart === left.chapterEnd
            && right.chapterStart === right.chapterEnd
            && left.chapterStart === right.chapterStart
            && left.verseEnd + 1 === right.verseStart;
    }

    private isValidReference(reference: BibleReference): boolean {
        if (!this.isPositiveInteger(reference.book)
            || !this.isPositiveInteger(reference.chapterStart)
            || !this.isPositiveInteger(reference.verseStart)
            || !this.isPositiveInteger(reference.chapterEnd)
            || !this.isPositiveInteger(reference.verseEnd)) {
            return false;
        }

        if (reference.chapterEnd < reference.chapterStart) {
            return false;
        }

        if (reference.chapterEnd === reference.chapterStart && reference.verseEnd < reference.verseStart) {
            return false;
        }

        return true;
    }

    private isPositiveInteger(value: number): boolean {
        return Number.isInteger(value) && value > 0;
    }
}
const BIG_BOOK_BODY_PATTERN = /\d+:\d+(?:-\d+:\d+|-\d+|,\d+)*(?:;\d+:\d+(?:-\d+:\d+|-\d+|,\d+)*)*/y;
// One-chapter books also accept the "1:N" form ("Jude 1:5"); any other chapter number is not a reference.
const SHORT_BOOK_BODY_PATTERN = /(?:1:)?\d+(?:-\d+|,\d+)*(?:;(?:1:)?\d+(?:-\d+|,\d+)*)*(?!\d*:)/y;

// Normalized form of each source character: "" when it is dropped, " " for whitespace.
// The result may be longer than one character (e.g. after toLowerCase).
const normalizedSearchCharacterCache = new Map<string, string>();

function normalizeSearchCharacter(character: string): string {
    const code = character.charCodeAt(0);

    if (code < 0x80) {
        if (code >= 0x41 && code <= 0x5A) {
            return String.fromCharCode(code + 0x20);
        }
        if (character === ".") {
            return "";
        }
        if (code === 0x20 || (code >= 0x09 && code <= 0x0D)) {
            return " ";
        }
        return character;
    }

    let normalizedCharacter = normalizedSearchCharacterCache.get(character);

    if (normalizedCharacter === undefined) {
        normalizedCharacter = normalizeNonAsciiSearchCharacter(character);
        normalizedSearchCharacterCache.set(character, normalizedCharacter);
    }

    return normalizedCharacter;
}

function normalizeNonAsciiSearchCharacter(character: string): string {
    const normalizedCharacter = normalizeSearchText(character);

    if (normalizedCharacter === ".") {
        return "";
    }

    const punctuation = normalizeReferencePunctuation(normalizedCharacter);

    return /^\s$/u.test(punctuation) ? " " : punctuation;
}

function normalizeReferencePunctuation(character: string): string {
    return character
        .replace(/[—–−]/g, "-")
        .replace(/[：∶]/g, ":")
        .replace(/[،﹐，]/g, ",")
        .replace(/[؛﹔；]/g, ";");
}

function isReferenceDelimiter(character: string | undefined): boolean {
    return character === "," || character === ":" || character === ";";
}

function matchStickyPattern(pattern: RegExp, text: string, index: number): string | null {
    pattern.lastIndex = index;
    return pattern.exec(text)?.[0] ?? null;
}
