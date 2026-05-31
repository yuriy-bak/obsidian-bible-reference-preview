import type { BibleIndex } from "../infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import {
    createTranslationControllerState as createTranslationControllerStateFlow,
    getPreviewComparisonTranslationOptions as getPreviewComparisonTranslationOptionsFlow,
    getTranslationSettingsItems as getTranslationSettingsItemsFlow,
    moveTranslation as moveTranslationFlow,
    promoteTranslationToTop as promoteTranslationToTopFlow,
    selectActiveTranslationId as selectActiveTranslationIdFlow,
    setComparisonTranslationEnabled as setComparisonTranslationEnabledFlow,
    setTranslationOrder as setTranslationOrderFlow,
    syncTranslationOrder as syncTranslationOrderFlow,
    type TranslationSettingsFlowInput,
} from "./TranslationSettingsFlow";
import {
    deleteImportedTranslation as deleteImportedTranslationFlow,
    type TranslationDeleteFlowInput,
} from "./TranslationDeleteFlow";
import {
    getActiveTranslationDisplayName as getActiveTranslationDisplayNameFlow,
    getActiveTranslationPreviewTitle as getActiveTranslationPreviewTitleFlow,
    type TranslationDisplayFlowInput,
} from "./TranslationDisplayFlow";
import type { TranslationControllerState } from "./TranslationController";
import type { PreviewComparisonTranslationOption, TranslationSettingsItem } from "./TranslationModels";

export type TranslationPluginFlowInput = {
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
    getBibleIndexV2Data(): BibleIndexV2Data | null;
    createRepository(): ObsidianBibleIndexV2Repository;
    confirmDeleteTranslation(translationName: string): boolean;
    setBibleIndex(bibleIndex: BibleIndex): void;
    setBibleIndexV2Data(v2Data: BibleIndexV2Data | null): void;
    showTranslationDeletedNotice(translationName: string): void;
    getNoImportedTranslationText(): string;
    getPreviewTitleFallbackText(): string;
};

function createTranslationSettingsFlowInput(input: TranslationPluginFlowInput): TranslationSettingsFlowInput {
    return {
        getV2Data: input.getV2Data,
        getActiveTranslationId: input.getActiveTranslationId,
        getTranslationOrder: input.getTranslationOrder,
        getComparisonTranslationIds: input.getComparisonTranslationIds,
        setTranslationOrder: input.setTranslationOrder,
        setComparisonTranslationIds: input.setComparisonTranslationIds,
        setActiveTranslationId: input.setActiveTranslationId,
        saveSettings: input.saveSettings,
        updateBookMapping: input.updateBookMapping,
        showCurrentTranslationNotice: input.showCurrentTranslationNotice,
        refreshSettings: input.refreshSettings,
        refreshVisibleBiblePreviewContent: input.refreshVisibleBiblePreviewContent,
    };
}

function createTranslationDeleteFlowInput(input: TranslationPluginFlowInput): TranslationDeleteFlowInput {
    return {
        ...createTranslationSettingsFlowInput(input),
        getBibleIndexV2Data: input.getBibleIndexV2Data,
        createRepository: input.createRepository,
        confirmDeleteTranslation: input.confirmDeleteTranslation,
        setBibleIndex: input.setBibleIndex,
        setBibleIndexV2Data: input.setBibleIndexV2Data,
        showTranslationDeletedNotice: input.showTranslationDeletedNotice,
    };
}

function createTranslationDisplayFlowInput(input: TranslationPluginFlowInput): TranslationDisplayFlowInput {
    return {
        activeV2Data: input.getV2Data(),
        activeTranslationId: input.getActiveTranslationId(),
        getNoImportedTranslationText: input.getNoImportedTranslationText,
        getPreviewTitleFallbackText: input.getPreviewTitleFallbackText,
    };
}

export function createTranslationControllerState(
    input: TranslationPluginFlowInput,
    v2Data: BibleIndexV2Data | null = input.getV2Data(),
): TranslationControllerState {
    return createTranslationControllerStateFlow(createTranslationSettingsFlowInput(input), v2Data);
}

export function selectActiveTranslationId(input: TranslationPluginFlowInput, v2Data: BibleIndexV2Data | null): string | null {
    return selectActiveTranslationIdFlow(createTranslationSettingsFlowInput(input), v2Data);
}

export async function syncTranslationOrder(
    input: TranslationPluginFlowInput,
    v2Data: BibleIndexV2Data | null,
    preferredTranslationId?: string,
): Promise<void> {
    await syncTranslationOrderFlow(createTranslationSettingsFlowInput(input), v2Data, preferredTranslationId);
}

export async function promoteTranslationToTop(input: TranslationPluginFlowInput, translationId: string): Promise<void> {
    await promoteTranslationToTopFlow(createTranslationSettingsFlowInput(input), translationId);
}

export function getTranslationSettingsItems(input: TranslationPluginFlowInput): TranslationSettingsItem[] {
    return getTranslationSettingsItemsFlow(createTranslationSettingsFlowInput(input));
}

export async function moveTranslation(input: TranslationPluginFlowInput, translationId: string, direction: -1 | 1): Promise<void> {
    await moveTranslationFlow(createTranslationSettingsFlowInput(input), translationId, direction);
}

export async function setTranslationOrder(input: TranslationPluginFlowInput, nextOrder: string[]): Promise<void> {
    await setTranslationOrderFlow(createTranslationSettingsFlowInput(input), nextOrder);
}

export async function setComparisonTranslationEnabled(input: TranslationPluginFlowInput, translationId: string, enabled: boolean): Promise<void> {
    await setComparisonTranslationEnabledFlow(createTranslationSettingsFlowInput(input), translationId, enabled);
}

export function getPreviewComparisonTranslationOptions(input: TranslationPluginFlowInput): PreviewComparisonTranslationOption[] {
    return getPreviewComparisonTranslationOptionsFlow(createTranslationSettingsFlowInput(input));
}

export async function deleteImportedTranslation(input: TranslationPluginFlowInput, translationId: string): Promise<void> {
    await deleteImportedTranslationFlow(createTranslationDeleteFlowInput(input), translationId);
}

export function getActiveTranslationDisplayName(input: TranslationPluginFlowInput): string {
    return getActiveTranslationDisplayNameFlow(createTranslationDisplayFlowInput(input));
}

export function getActiveTranslationPreviewTitle(input: TranslationPluginFlowInput): string {
    return getActiveTranslationPreviewTitleFlow(createTranslationDisplayFlowInput(input));
}

export type { PreviewComparisonTranslationOption, TranslationControllerState, TranslationSettingsItem };
