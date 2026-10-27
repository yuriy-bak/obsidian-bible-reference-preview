import { isSameChapterLocation, type BibleChapterLocation, type BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent } from "../application/formatBibleTexts";

export type BiblePreviewChapterState = {
    returnContent: BiblePreviewContent;
    returnScrollTop: number;
    origin: BibleChapterTarget;
    chapterContent: BiblePreviewContent | null;
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
    const state: BiblePreviewChapterState = { returnContent, returnScrollTop, origin: target, chapterContent: null };
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

async function buildChapterContentSafely(input: BiblePreviewChapterFlowInput, target: BibleChapterTarget): Promise<BiblePreviewContent | null> {
    try {
        return await input.buildChapterContent(target);
    } catch {
        return null;
    }
}
