import type { BibleIndex } from "../infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { selectActiveTranslationId, syncTranslationOrder, type TranslationSettingsFlowInput } from "./TranslationSettingsFlow";

export type TranslationDeleteFlowInput = TranslationSettingsFlowInput & {
    getBibleIndexV2Data(): BibleIndexV2Data | null;
    createRepository(): ObsidianBibleIndexV2Repository;
    confirmDeleteTranslation(translationName: string): boolean;
    setBibleIndex(bibleIndex: BibleIndex): void;
    setBibleIndexV2Data(v2Data: BibleIndexV2Data | null): void;
    showTranslationDeletedNotice(translationName: string): void;
};

export async function deleteImportedTranslation(input: TranslationDeleteFlowInput, translationId: string): Promise<void> {
    const currentV2Data = input.getBibleIndexV2Data();
    if (currentV2Data?.translations[translationId] === undefined) {
        return;
    }

    const translationName = currentV2Data.translations[translationId].name || translationId;
    if (!input.confirmDeleteTranslation(translationName)) {
        return;
    }

    const repository = input.createRepository();
    await repository.load();
    await repository.deleteTranslation(translationId);

    const nextV2Data = repository.getV2Data();
    input.setBibleIndex(repository.getIndex());
    input.setBibleIndexV2Data(nextV2Data);
    input.setTranslationOrder(input.getTranslationOrder().filter((existingTranslationId) => existingTranslationId !== translationId));
    await input.saveSettings();
    await syncTranslationOrder(input, nextV2Data);
    input.setActiveTranslationId(selectActiveTranslationId(input, nextV2Data));
    input.updateBookMapping(nextV2Data);
    input.showTranslationDeletedNotice(translationName);
}
