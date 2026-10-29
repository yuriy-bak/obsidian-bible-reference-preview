import { getBookIdByUsfmCode } from "./UsfmBookCodes";

export type VerseLocation = {
    book: number;
    chapter: number;
    verse: number;
};

/**
 * One versification: how many verses each chapter has and how its verses map to the Original
 * (Hebrew/Greek) versification, the common pivot of all schemes. Parsed from Paratext .vrs text.
 */
export class VersificationScheme {
    private readonly verseCounts = new Map<number, number[]>();
    private readonly toOriginal = new Map<number, number>();
    private readonly fromOriginal = new Map<number, number>();

    constructor(readonly key: string, readonly name: string, vrs: string) {
        for (const rawLine of vrs.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (line === "" || line.startsWith("#") || line.startsWith("-") || line.startsWith("*")) {
                continue;
            }
            if (line.includes("=")) {
                this.addMappingLine(line);
            } else {
                this.addBookLine(line);
            }
        }
    }

    /** Verse counts by chapter (index 0 = chapter 1), or null if the scheme has no such book. */
    getChapterVerseCounts(book: number): readonly number[] | null {
        return this.verseCounts.get(book) ?? null;
    }

    getVerseCount(book: number, chapter: number): number {
        return this.verseCounts.get(book)?.[chapter - 1] ?? 0;
    }

    hasVerse(location: VerseLocation): boolean {
        return location.verse >= 0 && location.verse <= this.getVerseCount(location.book, location.chapter);
    }

    toOriginalLocation(location: VerseLocation): VerseLocation {
        const mapped = this.toOriginal.get(encodeVerseLocation(location));
        return mapped === undefined ? location : decodeVerseLocation(mapped);
    }

    fromOriginalLocation(location: VerseLocation): VerseLocation {
        const mapped = this.fromOriginal.get(encodeVerseLocation(location));
        return mapped === undefined ? location : decodeVerseLocation(mapped);
    }

    private addBookLine(line: string): void {
        const [code, ...chapters] = line.split(/\s+/);
        const book = getBookIdByUsfmCode(code);
        if (book === null) {
            return;
        }

        const counts: number[] = [];
        for (const chapter of chapters) {
            const match = /^(\d+):(\d+)$/.exec(chapter);
            if (match === null) {
                continue;
            }
            counts[Number(match[1]) - 1] = Number(match[2]);
        }
        this.verseCounts.set(book, Array.from(counts, (count) => count ?? 0));
    }

    // As in Paratext: "A = B" maps the verses of A one by one, starting at B; "&A = B" maps every verse
    // of one side to every verse of the other. A later mapping of the same verse replaces an earlier one.
    private addMappingLine(line: string): void {
        const isManyToOne = line.startsWith("&");
        const [left, right] = (isManyToOne ? line.slice(1) : line).split("=");
        const leftRange = parseVerseRange(left);
        const rightRange = parseVerseRange(right);
        if (leftRange === null || rightRange === null) {
            return;
        }

        if (isManyToOne) {
            for (const leftVerse of expandRange(leftRange)) {
                for (const rightVerse of expandRange(rightRange)) {
                    this.addMapping(leftVerse, rightVerse);
                }
            }
            return;
        }

        const leftVerses = expandRange(leftRange);
        leftVerses.forEach((leftVerse, offset) => {
            this.addMapping(leftVerse, { ...rightRange.start, verse: rightRange.start.verse + offset });
        });
    }

    private addMapping(schemeLocation: VerseLocation, originalLocation: VerseLocation): void {
        const schemeKey = encodeVerseLocation(schemeLocation);
        const originalKey = encodeVerseLocation(originalLocation);
        this.toOriginal.set(schemeKey, originalKey);
        this.fromOriginal.set(originalKey, schemeKey);
    }
}

type VerseRange = {
    start: VerseLocation;
    endVerse: number;
};

function parseVerseRange(value: string): VerseRange | null {
    const match = /^\s*([0-9A-Z]{3})\s+(\d+):(\d+)(?:-(\d+))?\s*$/.exec(value);
    if (match === null) {
        return null;
    }

    const book = getBookIdByUsfmCode(match[1]);
    if (book === null) {
        return null;
    }

    const verse = Number(match[3]);
    return {
        start: { book, chapter: Number(match[2]), verse },
        endVerse: match[4] === undefined ? verse : Number(match[4]),
    };
}

function expandRange(range: VerseRange): VerseLocation[] {
    const verses: VerseLocation[] = [];
    for (let verse = range.start.verse; verse <= Math.max(range.start.verse, range.endVerse); verse += 1) {
        verses.push({ ...range.start, verse });
    }
    return verses;
}

function encodeVerseLocation(location: VerseLocation): number {
    return location.book * 1_000_000 + location.chapter * 1_000 + location.verse;
}

function decodeVerseLocation(value: number): VerseLocation {
    return {
        book: Math.floor(value / 1_000_000),
        chapter: Math.floor(value / 1_000) % 1_000,
        verse: value % 1_000,
    };
}
