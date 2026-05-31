import type { BibleReference } from "../domain/BibleReference";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";

type ReferenceUsageUnderCursorMatch = {
    text: string;
    references: BibleReference[];
};

export type ReferenceUsageUnderCursorFlowInput = {
    isIndexingEnabled(): boolean;
    showIndexingDisabledNotice(): void;
    getReferenceUnderCursor(): ReferenceUsageUnderCursorMatch | null;
    findUsages(references: BibleReference[]): ReferenceUsageSearchResult[];
    formatTitle(referenceText: string): string;
    openResultsModal(titleText: string, results: ReferenceUsageSearchResult[]): void;
    showResultsInPanel(titleText: string, results: ReferenceUsageSearchResult[]): Promise<void>;
};

export async function findReferenceUsagesUnderCursor(input: ReferenceUsageUnderCursorFlowInput): Promise<void> {
    const result = getReferenceUsageResultsUnderCursor(input);
    if (result === null) {
        return;
    }

    input.openResultsModal(result.titleText, result.results);
}

export async function openReferenceUsagesPanelUnderCursor(input: ReferenceUsageUnderCursorFlowInput): Promise<void> {
    const result = getReferenceUsageResultsUnderCursor(input);
    if (result === null) {
        return;
    }

    await input.showResultsInPanel(result.titleText, result.results);
}

function getReferenceUsageResultsUnderCursor(input: ReferenceUsageUnderCursorFlowInput): { titleText: string; results: ReferenceUsageSearchResult[] } | null {
    if (!input.isIndexingEnabled()) {
        input.showIndexingDisabledNotice();
        return null;
    }

    const match = input.getReferenceUnderCursor();
    if (match === null) {
        return null;
    }

    return {
        titleText: input.formatTitle(match.text),
        results: input.findUsages(match.references),
    };
}
