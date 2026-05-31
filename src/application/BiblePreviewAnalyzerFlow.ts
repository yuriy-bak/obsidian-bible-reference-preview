import type { BibleIndex } from "../infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import { createBookMappingFromBibleIndexV2Data } from "../infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import type { BookMapping } from "../parsing/BookMapping";
import type { TranslationControllerState } from "../translations/TranslationController";
import { TranslationController } from "../translations/TranslationController";
import { BiblePreviewAnalyzer, type BiblePreviewAnalyzerInput } from "./BiblePreviewAnalyzer";
import { getBibleTextBlocks } from "./getBibleTexts";
import {
    type BiblePreviewContent,
    formatBibleComparisonTextBlocks,
    formatBibleTextBlocks,
} from "./formatBibleTexts";

export type BiblePreviewAnalyzerFlowInput = {
    bibleIndex: BibleIndex;
    bookMapping: BookMapping;
    activeV2Data: BibleIndexV2Data | null;
    translationControllerState: TranslationControllerState;
    hasImportedTranslations(): boolean;
    getActiveTranslationId(): string | null;
    isPreviewComparisonEnabled(): boolean;
    parseMatches: BiblePreviewAnalyzerInput["parseMatches"];
    getMissingVerseText(): string;
};

export type ToggleBiblePreviewComparisonFlowInput = BiblePreviewAnalyzerFlowInput & {
    setPreviewComparisonEnabled(enabled: boolean): Promise<void>;
    showBiblePreviewContent(content: BiblePreviewContent): void;
};

export function createBiblePreviewAnalyzerInput(input: BiblePreviewAnalyzerFlowInput): BiblePreviewAnalyzerInput {
    return {
        hasImportedTranslations: input.hasImportedTranslations,
        getActiveTranslationId: input.getActiveTranslationId,
        isPreviewComparisonEnabled: input.isPreviewComparisonEnabled,
        parseMatches: input.parseMatches,
        getBibleTextBlocks: (references, translationId, sourceText) => getBibleTextBlocks(references, input.bibleIndex, translationId, sourceText),
        formatBibleTextBlocks: (blocks) => formatBibleTextBlocks(blocks, input.bookMapping, input.getMissingVerseText()),
        formatBibleComparisonTextBlocks: (comparisonInputs) => formatBibleComparisonTextBlocks(comparisonInputs, input.bookMapping, input.getMissingVerseText()),
        getComparisonTranslationIds: () => TranslationController.getComparisonTranslationIds(input.translationControllerState),
        getTranslationPreviewTitle: (translationId) => TranslationController.getTranslationPreviewTitle(input.translationControllerState, translationId),
        getComparisonMapping: (translationId) => input.activeV2Data === null
            ? input.bookMapping
            : createBookMappingFromBibleIndexV2Data(input.activeV2Data, translationId),
    };
}

export async function analyzeBiblePreviewParagraph(input: BiblePreviewAnalyzerFlowInput, text: string): Promise<BiblePreviewContent | null> {
    return new BiblePreviewAnalyzer(createBiblePreviewAnalyzerInput(input)).analyzeParagraph(text);
}

export async function rebuildBiblePreviewContent(input: BiblePreviewAnalyzerFlowInput, content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
    return new BiblePreviewAnalyzer(createBiblePreviewAnalyzerInput(input)).rebuildContent(content);
}

export async function toggleBiblePreviewComparison(input: ToggleBiblePreviewComparisonFlowInput, content: BiblePreviewContent): Promise<void> {
    await input.setPreviewComparisonEnabled(!input.isPreviewComparisonEnabled());
    const nextContent = await rebuildBiblePreviewContent(input, content);
    if (nextContent !== null) {
        input.showBiblePreviewContent(nextContent);
    }
}
