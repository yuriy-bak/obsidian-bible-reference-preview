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

export class BibleReferenceParser {
    private readonly aliases: BookAliasCandidate[];

    constructor(private readonly mapping: BookMapping) {
        this.aliases = this.createBookAliases(mapping);
    }

    parse(text: string): BibleReference[] {
        try {
            const normalizedText = this.normalizeLine(text);
            const candidates = this.findReferenceCandidates(normalizedText);
            const references: BibleReference[] = [];

            for (const candidate of candidates) {
                const candidateReferences = candidate.isShortBook
                    ? this.parseShortBookBody(candidate.bookId, candidate.body)
                    : this.parseBigBookBody(candidate.bookId, candidate.body);

                references.push(...this.mergeAdjacentReferences(candidateReferences));
            }

            return references;
        } catch {
            return [];
        }
    }

    private normalizeLine(text: string): string {
        let result = normalizeBookAlias(text)
            .replace(/[—–−]/g, "-")
            .replace(/[：∶]/g, ":")
            .replace(/[،﹐，]/g, ",")
            .replace(/[؛﹔；]/g, ";")
            .replace(/\s+/g, " ")
            .trim();

        for (const delimiter of ["-", ",", ":", ";"]) {
            result = result
                .replace(new RegExp(`\\s+\\${delimiter}`, "g"), delimiter)
                .replace(new RegExp(`\\${delimiter}\\s+`, "g"), delimiter);
        }

        return result;
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