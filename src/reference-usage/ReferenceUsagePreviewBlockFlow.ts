import { Notice } from "obsidian";
import type { BiblePreviewUsageTarget } from "../application/formatBibleTexts";
import type { ReferenceUsagePaneFlowInput } from "./ReferenceUsagePaneFlow";
import { showReferenceUsageResultsInPanel } from "./ReferenceUsagePaneFlow";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";

export type ReferenceUsagePreviewBlockFlowInput = {
    isIndexingEnabled: () => boolean;
    getIndexDisabledText: () => string;
    findUsages: (references: BiblePreviewUsageTarget["references"]) => ReferenceUsageSearchResult[];
    formatTitle: (referenceText: string) => string;
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
