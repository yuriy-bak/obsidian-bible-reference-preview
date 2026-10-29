import { Notice } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import { openConfirmModal } from "../ui/ConfirmModal";
import { areStringArraysEqual } from "../utils/ArrayEquality";
import { TranslationController, type TranslationControllerState } from "./TranslationController";
import type { PreviewComparisonTranslationOption, TranslationSettingsItem } from "./TranslationModels";

export type TranslationServiceEffects = {
    refreshVisibleBiblePreviewContent: () => Promise<void>;
};

export class TranslationService {
    constructor(
        private readonly context: PluginContext,
        private readonly effects: TranslationServiceEffects,
    ) {}

    getControllerState(): TranslationControllerState {
        return {
            v2Data: this.context.v2Data,
            activeTranslationId: this.context.activeTranslationId,
            translationOrder: this.context.settings.translationOrder,
            comparisonTranslationIds: this.context.settings.comparisonTranslationIds,
        };
    }

    /**
     * Picks the active translation from the current order and rebuilds the book mapping.
     * The open preview is rebuilt too: it may show another translation or data replaced by a re-import.
     */
    activateTopTranslation(): void {
        this.context.setActiveTranslationId(TranslationController.selectActiveTranslationId(this.getControllerState()));
        this.context.updateBookMapping();
        void this.effects.refreshVisibleBiblePreviewContent();
    }

    async syncTranslationOrder(preferredTranslationId?: string): Promise<void> {
        const nextOrder = TranslationController.syncTranslationOrder(this.getControllerState(), preferredTranslationId);
        if (nextOrder === null) {
            return;
        }
        this.context.updateSettings({ translationOrder: nextOrder });
        await this.context.saveSettings();
    }

    async promoteTranslationToTop(translationId: string): Promise<void> {
        this.context.updateSettings({ translationOrder: TranslationController.promoteTranslationToTop(this.getControllerState(), translationId) });
        await this.context.saveSettings();
        await this.syncTranslationOrder(translationId);
    }

    getTranslationSettingsItems(): TranslationSettingsItem[] {
        return TranslationController.getTranslationSettingsItems(this.getControllerState());
    }

    /** Stores the numbering scheme the user picked for a translation and redraws the open preview. */
    async setTranslationVersification(translationId: string, versification: string): Promise<void> {
        if (this.context.v2Data?.translations[translationId]?.versification === versification) {
            return;
        }

        const repository = this.context.createRepository();
        await repository.load();
        await repository.updateTranslationVersification(translationId, { versification });
        this.context.setBibleData(repository.getIndex(), repository.getV2Data());
        this.context.updateBookMapping();
        await this.effects.refreshVisibleBiblePreviewContent();
    }

    async moveTranslation(translationId: string, direction: -1 | 1): Promise<void> {
        const nextOrder = TranslationController.moveTranslation(this.getControllerState(), translationId, direction);
        if (nextOrder === null) {
            return;
        }
        await this.applyTranslationOrder(nextOrder);
    }

    async setTranslationOrder(nextOrder: string[]): Promise<void> {
        const normalizedOrder = TranslationController.normalizeTranslationOrder(this.getControllerState(), nextOrder);
        if (areStringArraysEqual(this.context.settings.translationOrder, normalizedOrder)) {
            return;
        }
        await this.applyTranslationOrder(normalizedOrder);
    }

    async setComparisonTranslationEnabled(translationId: string, enabled: boolean): Promise<void> {
        const normalized = TranslationController.normalizeComparisonTranslationIds(this.getControllerState(), translationId, enabled);
        if (normalized === null || areStringArraysEqual(this.context.settings.comparisonTranslationIds, normalized)) {
            return;
        }

        this.context.updateSettings({ comparisonTranslationIds: normalized });
        await this.context.saveSettings();
        this.context.refreshSettingsTab();
        await this.effects.refreshVisibleBiblePreviewContent();
    }

    getPreviewComparisonTranslationOptions(): PreviewComparisonTranslationOption[] {
        return TranslationController.getPreviewComparisonTranslationOptions(this.getControllerState());
    }

    async deleteImportedTranslation(translationId: string): Promise<void> {
        const currentV2Data = this.context.v2Data;
        if (currentV2Data?.translations[translationId] === undefined) {
            return;
        }

        const translationName = currentV2Data.translations[translationId].name || translationId;
        const confirmed = await openConfirmModal(this.context.app, {
            title: this.context.t("confirm.deleteTranslation.title", { translationName }),
            messageLines: [
                this.context.t("confirm.deleteTranslation.filesWillBeDeleted"),
                this.context.t("confirm.deleteTranslation.reimportHint"),
            ],
            confirmText: this.context.t("confirm.deleteTranslation.confirm"),
            cancelText: this.context.t("common.cancel"),
        });
        if (!confirmed) {
            return;
        }

        const repository = this.context.createRepository();
        await repository.load();
        await repository.deleteTranslation(translationId);

        this.context.setBibleData(repository.getIndex(), repository.getV2Data());
        this.context.updateSettings({
            translationOrder: this.context.settings.translationOrder.filter((existingTranslationId) => existingTranslationId !== translationId),
        });
        await this.context.saveSettings();
        await this.syncTranslationOrder();
        this.activateTopTranslation();
        new Notice(this.context.t("notice.translationDeleted", { translationName }), 5000);
    }

    getActiveTranslationDisplayName(): string {
        const activeTranslationId = this.context.activeTranslationId;
        if (activeTranslationId === null) {
            return this.context.t("translation.noImported");
        }

        const translation = this.context.v2Data?.translations[activeTranslationId];
        return translation === undefined ? activeTranslationId : `${translation.name} (${translation.language})`;
    }

    getActiveTranslationPreviewTitle(): string {
        const activeTranslationId = this.context.activeTranslationId;
        if (activeTranslationId === null) {
            return this.context.t("preview.titleFallback");
        }

        return this.context.v2Data?.translations[activeTranslationId]?.name ?? activeTranslationId;
    }

    private async applyTranslationOrder(nextOrder: string[]): Promise<void> {
        this.context.updateSettings({ translationOrder: nextOrder });
        await this.context.saveSettings();
        await this.syncTranslationOrder();
        this.activateTopTranslation();
        new Notice(this.context.t("notice.currentTranslation", { translationName: this.getActiveTranslationDisplayName() }), 4000);
    }
}
