import { BibleReference } from "../domain/BibleReference";
import { BookMapping, normalizeBookAlias } from "./BookMapping";

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

export type BibleReferenceMatch = {
    from: number;
    to: number;
    text: string;
    references: BibleReference[];
};

export class BibleReferenceParser {
    private readonly aliases: BookAliasCandidate[];

    constructor(private readonly mapping: BookMapping) {
        this.aliases = this.createBookAliases(mapping);
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

                matches.push({
                    from,
                    to: lastOffset + 1,
                    text: text.slice(from, lastOffset + 1),
                    references,
                });
            }

            return matches;
        } catch {
            return [];
        }
    }

    private normalizeLine(text: string): string {
        return this.normalizeLineWithOffsets(text).text;
    }

    private normalizeLineWithOffsets(text: string): NormalizedLine {
        const characters: string[] = [];
        const offsets: number[] = [];

        for (let index = 0; index < text.length; index += 1) {
            const normalizedCharacter = this.normalizeSearchCharacter(text[index]);

            if (normalizedCharacter === null || normalizedCharacter === ".") {
                continue;
            }

            const character = this.normalizeReferencePunctuation(normalizedCharacter);

            if (/\s/u.test(character)) {
                if (characters.length === 0 || characters[characters.length - 1] === " ") {
                    continue;
                }

                characters.push(" ");
                offsets.push(index);
                continue;
            }

            characters.push(character);
            offsets.push(index);
        }

        while (characters.length > 0 && characters[characters.length - 1] === " ") {
            characters.pop();
            offsets.pop();
        }

        for (let index = characters.length - 1; index >= 0; index -= 1) {
            if (characters[index] !== " ") {
                continue;
            }

            const previousCharacter = characters[index - 1];
            const nextCharacter = characters[index + 1];

            if (this.isReferenceDelimiter(previousCharacter) || this.isReferenceDelimiter(nextCharacter)) {
                characters.splice(index, 1);
                offsets.splice(index, 1);
            }
        }

        return {
            text: characters.join(""),
            offsets,
        };
    }

    private normalizeSearchCharacter(character: string): string | null {
        if (/^[؜‎‏‪-‮⁦-⁩]$/u.test(character)) {
            return null;
        }

        const normalizedCharacter = character
            .normalize("NFC")
            .toLowerCase()
            .replace(/̇/g, "")
            .replace(/ё/g, "е");

        return this.replaceArabicIndicDigit(normalizedCharacter);
    }

    private replaceArabicIndicDigit(character: string): string {
        if (/^[٠-٩]$/u.test(character)) {
            return String(character.charCodeAt(0) - 0x0660);
        }

        if (/^[۰-۹]$/u.test(character)) {
            return String(character.charCodeAt(0) - 0x06F0);
        }

        return character;
    }

    private normalizeReferencePunctuation(character: string): string {
        return character
            .replace(/[—–−]/g, "-")
            .replace(/[：∶]/g, ":")
            .replace(/[،﹐，]/g, ",")
            .replace(/[؛﹔；]/g, ";");
    }

    private isReferenceDelimiter(character: string | undefined): boolean {
        return character !== undefined && [",", ":", ";"].includes(character);
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

    private findReferenceCandidates(text: string): ReferenceCandidate[] {
        const candidates: ReferenceCandidate[] = [];

        let index = 0;

        while (index < text.length) {
            if (!this.isReferenceBoundary(text, index)) {
                index += 1;
                continue;
            }

            const candidate = this.findReferenceCandidateAt(text, index);

            if (candidate === null) {
                index += 1;
                continue;
            }

            candidates.push(candidate);
            index = candidate.endIndex;
        }

        return candidates;
    }

    private findReferenceCandidateAt(text: string, index: number): ReferenceCandidate | null {
        for (const aliasCandidate of this.aliases) {
            if (!text.startsWith(aliasCandidate.alias, index)) {
                continue;
            }

            const afterAliasIndex = this.skipOptionalDotAndSpaces(
                text,
                index + aliasCandidate.alias.length,
            );

            const bodyMatch = aliasCandidate.isShortBook
                ? this.matchShortBookBody(text.slice(afterAliasIndex))
                : this.matchBigBookBody(text.slice(afterAliasIndex));

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

    private matchBigBookBody(text: string): string | null {
        const match = /^\d+:\d+(?:-\d+:\d+|-\d+|,\d+)*(?:;\d+:\d+(?:-\d+:\d+|-\d+|,\d+)*)*/.exec(text);

        return match?.[0] ?? null;
    }

    private matchShortBookBody(text: string): string | null {
        const match = /^\d+(?:-\d+|,\d+)*(?:;\d+(?:-\d+|,\d+)*)*/.exec(text);

        return match?.[0] ?? null;
    }

    private isReferenceBoundary(text: string, index: number): boolean {
        if (index === 0) {
            return true;
        }

        return !/[\p{L}\p{N}]/u.test(text[index - 1]);
    }

    private parseBigBookBody(bookId: number, body: string): BibleReference[] {
        const references: BibleReference[] = [];
        const markedBody = this.markMultichapters(body);
        const parts = this.parseMultichapters(markedBody);

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
            this.addShortBookReferences(references, bookId, part);
        }

        return references;
    }

    private markMultichapters(body: string): string {
        return body;
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

        for (const reference of references) {
            const previous = result[result.length - 1];

            if (previous !== undefined && this.canMerge(previous, reference)) {
                previous.verseEnd = reference.verseEnd;
                continue;
            }

            result.push({ ...reference });
        }

        return result;
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