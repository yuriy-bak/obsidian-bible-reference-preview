import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import { areStringArraysEqual } from "../utils/ArrayEquality";
import { TranslationController, type TranslationControllerState } from "./TranslationController";
import type { PreviewComparisonTranslationOption, TranslationSettingsItem } from "./TranslationModels";

export type TranslationSettingsFlowInput = {
    getV2Data(): BibleIndexV2Data | null;
    getActiveTranslationId(): string | null;
    getTranslationOrder(): string[];
    getComparisonTranslationIds(): string[];
    setTranslationOrder(translationOrder: string[]): void;
    setComparisonTranslationIds(comparisonTranslationIds: string[]): void;
    setActiveTranslationId(activeTranslationId: string | null): void;
    saveSettings(): Promise<void>;
    updateBookMapping(v2Data: BibleIndexV2Data | null): void;
    showCurrentTranslationNotice(): void;
    refreshSettings(): void;
    refreshVisibleBiblePreviewContent(): Promise<void>;
};

export function createTranslationControllerState(
    input: TranslationSettingsFlowInput,
    v2Data: BibleIndexV2Data | null = input.getV2Data(),
): TranslationControllerState {
    return {
        v2Data,
        activeTranslationId: input.getActiveTranslationId(),
        translationOrder: input.getTranslationOrder(),
        comparisonTranslationIds: input.getComparisonTranslationIds(),
    };
}

export function selectActiveTranslationId(input: TranslationSettingsFlowInput, v2Data: BibleIndexV2Data | null): string | null {
    return TranslationController.selectActiveTranslationId(createTranslationControllerState(input, v2Data));
}

export async function syncTranslationOrder(
    input: TranslationSettingsFlowInput,
    v2Data: BibleIndexV2Data | null,
    preferredTranslationId?: string,
): Promise<void> {
    const nextOrder = TranslationController.syncTranslationOrder(createTranslationControllerState(input, v2Data), preferredTranslationId);
    if (nextOrder === null) {
        return;
    }
    input.setTranslationOrder(nextOrder);
    await input.saveSettings();
}

export async function promoteTranslationToTop(input: TranslationSettingsFlowInput, translationId: string): Promise<void> {
    input.setTranslationOrder(TranslationController.promoteTranslationToTop(createTranslationControllerState(input), translationId));
    await input.saveSettings();
    await syncTranslationOrder(input, input.getV2Data(), translationId);
}

export function getTranslationSettingsItems(input: TranslationSettingsFlowInput): TranslationSettingsItem[] {
    return TranslationController.getTranslationSettingsItems(createTranslationControllerState(input));
}

export async function moveTranslation(input: TranslationSettingsFlowInput, translationId: string, direction: -1 | 1): Promise<void> {
    const nextOrder = TranslationController.moveTranslation(createTranslationControllerState(input), translationId, direction);
    if (nextOrder === null) {
        return;
    }

    input.setTranslationOrder(nextOrder);
    await input.saveSettings();
    await syncTranslationOrder(input, input.getV2Data());
    input.setActiveTranslationId(selectActiveTranslationId(input, input.getV2Data()));
    input.updateBookMapping(input.getV2Data());
    input.showCurrentTranslationNotice();
}

export async function setTranslationOrder(input: TranslationSettingsFlowInput, nextOrder: string[]): Promise<void> {
    const normalizedOrder = TranslationController.normalizeTranslationOrder(createTranslationControllerState(input), nextOrder);
    if (areStringArraysEqual(input.getTranslationOrder(), normalizedOrder)) {
        return;
    }

    input.setTranslationOrder(normalizedOrder);
    await input.saveSettings();
    await syncTranslationOrder(input, input.getV2Data());
    input.setActiveTranslationId(selectActiveTranslationId(input, input.getV2Data()));
    input.updateBookMapping(input.getV2Data());
    input.showCurrentTranslationNotice();
}

export async function setComparisonTranslationEnabled(input: TranslationSettingsFlowInput, translationId: string, enabled: boolean): Promise<void> {
    const normalized = TranslationController.normalizeComparisonTranslationIds(createTranslationControllerState(input), translationId, enabled);
    if (normalized === null || areStringArraysEqual(input.getComparisonTranslationIds(), normalized)) {
        return;
    }

    input.setComparisonTranslationIds(normalized);
    await input.saveSettings();
    input.refreshSettings();
    await input.refreshVisibleBiblePreviewContent();
}

export function getPreviewComparisonTranslationOptions(input: TranslationSettingsFlowInput): PreviewComparisonTranslationOption[] {
    return TranslationController.getPreviewComparisonTranslationOptions(createTranslationControllerState(input));
}
