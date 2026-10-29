import type { ChapterVerseRange } from "../domain/ChapterVerseRange";
import { BUILTIN_VERSIFICATION_DATA } from "./builtinVersificationData";
import { VersificationScheme, type VerseLocation } from "./VersificationScheme";

/** English (KJV and most modern translations, NWT). Old indexes without a stored scheme are read with it until detected. */
export const DEFAULT_VERSIFICATION_KEY = "builtin:eng";

/** Built-in scheme ids, in the order that breaks ties when detecting a translation's scheme. */
export const BUILTIN_VERSIFICATION_IDS = ["eng", "rsc", "org", "vul", "lxx"] as const;

const VERSIFICATION_KEY_PATTERN = /^(builtin|user):[a-z0-9-]+$/;

export function isVersificationKey(value: unknown): value is string {
    return typeof value === "string" && VERSIFICATION_KEY_PATTERN.test(value);
}

/**
 * The known versification schemes by key: built-in ones ("builtin:<id>") are bundled with the plugin;
 * user schemes ("user:<id>") can be registered later without touching the built-in ones.
 */
export class VersificationRegistry {
    private readonly schemes = new Map<string, VersificationScheme>();

    register(scheme: VersificationScheme): void {
        this.schemes.set(scheme.key, scheme);
    }

    get(key: string): VersificationScheme | null {
        return this.schemes.get(key) ?? null;
    }

    getAll(): VersificationScheme[] {
        return [...this.schemes.values()];
    }

    /** Where a verse of one scheme is in another one. Unknown keys leave the verse as it is. */
    mapVerse(location: VerseLocation, fromKey: string, toKey: string): VerseLocation {
        const from = this.get(fromKey);
        const to = this.get(toKey);
        if (from === null || to === null || from === to) {
            return location;
        }

        // As in Paratext: no change when both schemes put this verse at the same Original location.
        const original = from.toOriginalLocation(location);
        const sameOriginal = to.toOriginalLocation(location);
        if (isSameLocation(original, sameOriginal) && to.hasVerse(location)) {
            return location;
        }
        return to.fromOriginalLocation(original);
    }

    /**
     * Maps a verse range to the other scheme. The result can span several chapters (Ps 9:22–39 in the
     * Russian scheme is Ps 10:1–18 in English), so it is a list of ranges in reading order.
     * Verse 0 (a psalm title that is not a numbered verse) is dropped from the result.
     */
    mapChapterVerseRange(range: ChapterVerseRange, fromKey: string, toKey: string): ChapterVerseRange[] {
        const verseEnd = range.verseEnd ?? this.get(fromKey)?.getVerseCount(range.book, range.chapter) ?? range.verseStart;
        if (fromKey === toKey || this.get(fromKey) === null || this.get(toKey) === null) {
            return [{ ...range, verseEnd }];
        }

        const result: ChapterVerseRange[] = [];
        for (let verse = range.verseStart; verse <= verseEnd; verse += 1) {
            const mapped = this.mapVerse({ book: range.book, chapter: range.chapter, verse }, fromKey, toKey);
            if (mapped.verse === 0) {
                continue;
            }
            appendVerse(result, mapped);
        }
        return result;
    }
}

function appendVerse(ranges: ChapterVerseRange[], location: VerseLocation): void {
    const last = ranges[ranges.length - 1];
    if (last !== undefined && last.book === location.book && last.chapter === location.chapter) {
        const lastEnd = last.verseEnd ?? last.verseStart;
        if (location.verse >= last.verseStart && location.verse <= lastEnd) {
            return;
        }
        if (location.verse === lastEnd + 1) {
            last.verseEnd = location.verse;
            return;
        }
    }
    ranges.push({ book: location.book, chapter: location.chapter, verseStart: location.verse, verseEnd: location.verse });
}

function isSameLocation(left: VerseLocation, right: VerseLocation): boolean {
    return left.book === right.book && left.chapter === right.chapter && left.verse === right.verse;
}

export function createBuiltinVersificationRegistry(): VersificationRegistry {
    const registry = new VersificationRegistry();
    for (const id of BUILTIN_VERSIFICATION_IDS) {
        const data = BUILTIN_VERSIFICATION_DATA[id];
        registry.register(new VersificationScheme(`builtin:${id}`, data.name, data.vrs));
    }
    return registry;
}

let builtinRegistry: VersificationRegistry | null = null;

/** The shared registry, parsed on first use (about 60 KB of text). */
export function getVersificationRegistry(): VersificationRegistry {
    builtinRegistry ??= createBuiltinVersificationRegistry();
    return builtinRegistry;
}
