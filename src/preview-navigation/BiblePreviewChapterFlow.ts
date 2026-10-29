import { isSameChapterLocation, type BibleChapterLocation, type BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";

export type BiblePreviewChapterState = {
    returnContent: BiblePreviewContent;
    returnScrollTop: number;
    origin: BibleChapterTarget;
    chapterContent: BiblePreviewContent | null;
    // Toggled from the chapter navigation bar; kept while browsing chapters and reset when a chapter is opened again.
    highlightsHidden: boolean;
};

export type BiblePreviewChapterFlowInput = {
    getState: () => BiblePreviewChapterState | null;
    setState: (state: BiblePreviewChapterState | null) => void;
    buildChapterContent: (target: BibleChapterTarget) => Promise<BiblePreviewContent | null>;
    showBiblePreviewContent: (content: BiblePreviewContent) => void;
};

export async function openBiblePreviewChapter(
    input: BiblePreviewChapterFlowInput,
    target: BibleChapterTarget,
    returnContent: BiblePreviewContent,
    returnScrollTop: number,
): Promise<void> {
    const state: BiblePreviewChapterState = { returnContent, returnScrollTop, origin: target, chapterContent: null, highlightsHidden: false };
    input.setState(state);

    const content = await buildChapterContentSafely(input, target);
    if (input.getState() !== state) {
        return;
    }
    if (content === null) {
        input.setState(null);
        return;
    }
    input.showBiblePreviewContent(content);
}

export async function navigateBiblePreviewChapter(input: BiblePreviewChapterFlowInput, location: BibleChapterLocation): Promise<void> {
    const state = input.getState();
    if (state === null) {
        return;
    }

    // Returning to the original chapter keeps the original verses highlighted.
    const target: BibleChapterTarget = {
        ...location,
        highlightedRanges: isSameChapterLocation(location, state.origin) ? state.origin.highlightedRanges : [],
    };
    const content = await buildChapterContentSafely(input, target);
    if (content === null || input.getState() !== state) {
        return;
    }
    input.showBiblePreviewContent(content);
}

export function backFromBiblePreviewChapter(input: BiblePreviewChapterFlowInput): void {
    const state = input.getState();
    if (state === null) {
        return;
    }

    input.setState(null);
    input.showBiblePreviewContent({ ...state.returnContent, scrollTop: state.returnScrollTop });
}

// Keeps the chapter state in sync with whatever the preview shows: any non-chapter content ends chapter mode.
export function trackShownBiblePreviewContent(
    state: BiblePreviewChapterState | null,
    content: BiblePreviewContent,
): BiblePreviewChapterState | null {
    if (state === null || content.chapterView === undefined) {
        return null;
    }
    return { ...state, chapterContent: content };
}

export function isBiblePreviewChapterModeActive(
    state: BiblePreviewChapterState | null,
    displayedContent: BiblePreviewContent | null,
): boolean {
    return state !== null && state.chapterContent !== null && state.chapterContent === displayedContent;
}

export function isBiblePreviewChapterHighlightHidden(state: BiblePreviewChapterState | null): boolean {
    return state?.highlightsHidden === true;
}

export function setBiblePreviewChapterHighlightHidden(
    input: Pick<BiblePreviewChapterFlowInput, "getState" | "setState">,
    hidden: boolean,
): void {
    const state = input.getState();
    if (state === null) {
        return;
    }
    // Updated in place: an in-flight chapter load compares the state by identity.
    state.highlightsHidden = hidden;
    input.setState(state);
}

async function buildChapterContentSafely(input: BiblePreviewChapterFlowInput, target: BibleChapterTarget): Promise<BiblePreviewContent | null> {
    try {
        return await input.buildChapterContent(target);
    } catch {
        return null;
    }
}
