import type { ReferenceUsageController } from "./ReferenceUsageController";
import { normalizeReferenceUsageExcludedFolders } from "./ReferenceUsageIndexService";
import { areStringArraysEqual } from "../utils/ArrayEquality";

export type ReferenceUsageSettingsFlowInput = {
    referenceUsageIndexingEnabled: boolean;
    referenceUsageAutoUpdate: boolean;
    referenceUsageExcludedFolders: string[];
    setReferenceUsageIndexingEnabled(value: boolean): void;
    setReferenceUsageAutoUpdate(value: boolean): void;
    setReferenceUsageExcludedFolders(value: string[]): void;
    saveSettings(): Promise<void>;
    refreshSettings(): void;
    getReferenceUsageController(): ReferenceUsageController;
};

export function isReferenceUsageIndexingEnabled(input: ReferenceUsageSettingsFlowInput): boolean {
    return input.referenceUsageIndexingEnabled;
}

export function shouldAutoUpdateReferenceUsageIndex(input: ReferenceUsageSettingsFlowInput): boolean {
    return input.referenceUsageAutoUpdate;
}

export function getReferenceUsageExcludedFoldersText(input: ReferenceUsageSettingsFlowInput): string {
    return input.referenceUsageExcludedFolders.join("\n");
}

export async function setReferenceUsageIndexingEnabled(input: ReferenceUsageSettingsFlowInput, referenceUsageIndexingEnabled: boolean): Promise<void> {
    if (input.referenceUsageIndexingEnabled === referenceUsageIndexingEnabled) return;
    input.setReferenceUsageIndexingEnabled(referenceUsageIndexingEnabled);
    await input.saveSettings();
    input.refreshSettings();
}

export async function setReferenceUsageAutoUpdate(input: ReferenceUsageSettingsFlowInput, referenceUsageAutoUpdate: boolean): Promise<void> {
    if (input.referenceUsageAutoUpdate === referenceUsageAutoUpdate) return;
    input.setReferenceUsageAutoUpdate(referenceUsageAutoUpdate);
    await input.saveSettings();
    input.refreshSettings();
}

export async function setReferenceUsageExcludedFoldersText(input: ReferenceUsageSettingsFlowInput, value: string): Promise<void> {
    const referenceUsageExcludedFolders = normalizeReferenceUsageExcludedFolders(value);
    if (areStringArraysEqual(input.referenceUsageExcludedFolders, referenceUsageExcludedFolders)) return;
    input.setReferenceUsageExcludedFolders(referenceUsageExcludedFolders);
    await input.saveSettings();
    input.refreshSettings();
}

export async function buildReferenceUsageIndex(input: ReferenceUsageSettingsFlowInput): Promise<void> {
    await input.getReferenceUsageController().buildIndex(false);
}

export async function rebuildReferenceUsageIndex(input: ReferenceUsageSettingsFlowInput): Promise<void> {
    await input.getReferenceUsageController().buildIndex(true);
}

export async function clearReferenceUsageIndex(input: ReferenceUsageSettingsFlowInput): Promise<void> {
    await input.getReferenceUsageController().clearIndex();
}

export function showReferenceUsageIndexStats(input: ReferenceUsageSettingsFlowInput): void {
    input.getReferenceUsageController().showStats();
}
