import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";

export type TranslationDisplayFlowInput = {
    activeV2Data: BibleIndexV2Data | null;
    activeTranslationId: string | null;
    getNoImportedTranslationText(): string;
    getPreviewTitleFallbackText(): string;
};

export function getActiveTranslationDisplayName(input: TranslationDisplayFlowInput): string {
    if (input.activeTranslationId === null) {
        return input.getNoImportedTranslationText();
    }

    const translation = input.activeV2Data?.translations[input.activeTranslationId];
    return translation === undefined ? input.activeTranslationId : `${translation.name} (${translation.language})`;
}

export function getActiveTranslationPreviewTitle(input: TranslationDisplayFlowInput): string {
    if (input.activeTranslationId === null) {
        return input.getPreviewTitleFallbackText();
    }

    return input.activeV2Data?.translations[input.activeTranslationId]?.name ?? input.activeTranslationId;
}
