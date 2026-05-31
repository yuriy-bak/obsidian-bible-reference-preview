import { Notice } from "obsidian";
import type { BiblePreviewReferenceBlock } from "../application/formatBibleTexts";
import type { ReferenceUsagePaneFlowInput } from "./ReferenceUsagePaneFlow";
import { showReferenceUsageResultsInPanel } from "./ReferenceUsagePaneFlow";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";

export type ReferenceUsagePreviewBlockFlowInput = {
    isIndexingEnabled(): boolean;
    getIndexDisabledText(): string;
    findUsages(references: BiblePreviewReferenceBlock["references"]): ReferenceUsageSearchResult[];
    formatTitle(referenceText: string): string;
    createReferenceUsagePaneFlowInput(): ReferenceUsagePaneFlowInput;
};

export async function showReferenceUsagesForPreviewBlock(
    input: ReferenceUsagePreviewBlockFlowInput,
    block: BiblePreviewReferenceBlock,
): Promise<void> {
    if (!input.isIndexingEnabled()) {
        new Notice(input.getIndexDisabledText(), 4000);
        return;
    }

    const results = input.findUsages(block.references);
    await showReferenceUsageResultsInPanel(
        input.createReferenceUsagePaneFlowInput(),
        input.formatTitle(block.title),
        results,
    );
}
