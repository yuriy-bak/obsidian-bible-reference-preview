import { Notice } from "obsidian";
import type { BibleChapterLocation } from "../application/BibleChapterNavigation";
import type { BiblePreviewUsageTarget } from "../application/formatBibleTexts";
import type { ReferenceUsagePaneFlowInput } from "./ReferenceUsagePaneFlow";
import { showReferenceUsageResultsInPanel } from "./ReferenceUsagePaneFlow";
import { createChapterUsageQuery, groupReferenceUsagesByChapterVerses, type ChapterUsageVerseSpan } from "./ReferenceUsageChapterGroups";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";

export type ReferenceUsagePreviewBlockFlowInput = {
    isIndexingEnabled: () => boolean;
    getIndexDisabledText: () => string;
    findUsages: (references: BiblePreviewUsageTarget["references"]) => ReferenceUsageSearchResult[];
    formatTitle: (referenceText: string) => string;
    formatChapterGroupTitle: (span: ChapterUsageVerseSpan) => string;
    createReferenceUsagePaneFlowInput: () => ReferenceUsagePaneFlowInput;
};

export async function showReferenceUsagesForPreviewBlock(
    input: ReferenceUsagePreviewBlockFlowInput,
    target: BiblePreviewUsageTarget,
): Promise<void> {
    if (!input.isIndexingEnabled()) {
        new Notice(input.getIndexDisabledText(), 4000);
        return;
    }

    const results = input.findUsages(target.references);
    await showReferenceUsageResultsInPanel(
        input.createReferenceUsagePaneFlowInput(),
        input.formatTitle(target.title),
        results,
    );
}

// Null hides the chapter's find-usages button (indexing is off).
export function countReferenceUsagesInChapter(input: ReferenceUsagePreviewBlockFlowInput, location: BibleChapterLocation): number | null {
    return input.isIndexingEnabled() ? input.findUsages([createChapterUsageQuery(location)]).length : null;
}

export async function showReferenceUsagesForChapter(
    input: ReferenceUsagePreviewBlockFlowInput,
    location: BibleChapterLocation,
    chapterTitle: string,
): Promise<void> {
    if (!input.isIndexingEnabled()) {
        new Notice(input.getIndexDisabledText(), 4000);
        return;
    }

    const results = input.findUsages([createChapterUsageQuery(location)]);
    await showReferenceUsageResultsInPanel(
        input.createReferenceUsagePaneFlowInput(),
        input.formatTitle(chapterTitle),
        results,
        groupReferenceUsagesByChapterVerses(results, location, input.formatChapterGroupTitle),
    );
}
