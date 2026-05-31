import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import type { PreviewComparisonTranslationOption, TranslationSettingsItem } from "./TranslationModels";

export type TranslationControllerState = {
    v2Data: BibleIndexV2Data | null;
    activeTranslationId: string | null;
    translationOrder: string[];
    comparisonTranslationIds: string[];
};

export class TranslationController {
    public static selectActiveTranslationId(state: TranslationControllerState): string | null {
        if (state.v2Data === null) {
            return null;
        }

        const availableTranslations = new Set(Object.keys(state.v2Data.translations));
        return state.translationOrder.find((translationId) => availableTranslations.has(translationId))
            ?? Object.keys(state.v2Data.translations)[0]
            ?? null;
    }

    public static syncTranslationOrder(state: TranslationControllerState, preferredTranslationId?: string): string[] | null {
        if (state.v2Data === null) {
            return null;
        }

        const availableTranslationIds = Object.keys(state.v2Data.translations);
        const availableTranslations = new Set(availableTranslationIds);
        const nextOrder: string[] = [];

        if (state.translationOrder.length === 0
            && preferredTranslationId !== undefined
            && availableTranslations.has(preferredTranslationId)) {
            nextOrder.push(preferredTranslationId);
        }

        for (const translationId of state.translationOrder) {
            if (availableTranslations.has(translationId) && !nextOrder.includes(translationId)) {
                nextOrder.push(translationId);
            }
        }

        for (const translationId of availableTranslationIds) {
            if (!nextOrder.includes(translationId)) {
                nextOrder.push(translationId);
            }
        }

        return areStringArraysEqual(state.translationOrder, nextOrder) ? null : nextOrder;
    }

    public static promoteTranslationToTop(state: TranslationControllerState, translationId: string): string[] {
        return [
            translationId,
            ...state.translationOrder.filter((existingTranslationId) => existingTranslationId !== translationId),
        ];
    }

    public static getTranslationSettingsItems(state: TranslationControllerState): TranslationSettingsItem[] {
        if (state.v2Data === null) {
            return [];
        }

        const translations = state.v2Data.translations;
        const order = state.translationOrder.filter((translationId) => translations[translationId] !== undefined);
        const comparisonTranslationIds = new Set(this.getComparisonTranslationIds(state));

        return order.map((translationId, index) => {
            const translation = translations[translationId];
            return {
                id: translationId,
                name: translation.name,
                language: translation.language,
                sourceFileName: translation.sourceFileName ?? "",
                bookCount: Object.keys(translation.books).length,
                isActive: translationId === state.activeTranslationId,
                isComparisonEnabled: comparisonTranslationIds.has(translationId),
            };
        });
    }

    public static moveTranslation(state: TranslationControllerState, translationId: string, direction: -1 | 1): string[] | null {
        const currentIndex = state.translationOrder.indexOf(translationId);
        const nextIndex = currentIndex + direction;

        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.translationOrder.length) {
            return null;
        }

        const nextOrder = [...state.translationOrder];
        [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
        return nextOrder;
    }

    public static normalizeTranslationOrder(state: TranslationControllerState, nextOrder: string[]): string[] {
        const availableTranslations = new Set(Object.keys(state.v2Data?.translations ?? {}));
        const currentOrder = this.getTranslationSettingsItems(state).map((translation) => translation.id);
        const normalizedOrder: string[] = [];

        for (const translationId of nextOrder) {
            if (availableTranslations.has(translationId) && !normalizedOrder.includes(translationId)) {
                normalizedOrder.push(translationId);
            }
        }

        for (const translationId of currentOrder) {
            if (!normalizedOrder.includes(translationId)) {
                normalizedOrder.push(translationId);
            }
        }

        return normalizedOrder;
    }

    public static normalizeComparisonTranslationIds(state: TranslationControllerState, translationId: string, enabled: boolean): string[] | null {
        const availableTranslations = new Set(Object.keys(state.v2Data?.translations ?? {}));
        if (!availableTranslations.has(translationId)) {
            return null;
        }

        const current = this.getComparisonTranslationIds(state);
        const next = enabled
            ? [...current, translationId]
            : current.filter((existingTranslationId) => existingTranslationId !== translationId);
        const normalized = [...new Set(next)]
            .filter((existingTranslationId) => availableTranslations.has(existingTranslationId))
            .slice(0, 4);

        return normalized.length === 0 ? null : normalized;
    }

    public static getPreviewComparisonTranslationOptions(state: TranslationControllerState): PreviewComparisonTranslationOption[] {
        if (state.v2Data === null) {
            return [];
        }

        const selectedIds = new Set(this.getComparisonTranslationIds(state));
        const selectedCount = selectedIds.size;
        return this.getTranslationSettingsItems(state).map((translation) => ({
            id: translation.id,
            name: translation.name || translation.id,
            isSelected: selectedIds.has(translation.id),
            isDisabled: !selectedIds.has(translation.id) && selectedCount >= 4,
        }));
    }

    public static getComparisonTranslationIds(state: TranslationControllerState): string[] {
        if (state.v2Data === null) {
            return state.activeTranslationId === null ? [] : [state.activeTranslationId];
        }

        const availableTranslations = new Set(Object.keys(state.v2Data.translations));
        const normalizedSelectedIds = state.comparisonTranslationIds
            .filter((translationId) => availableTranslations.has(translationId))
            .slice(0, 4);

        return normalizedSelectedIds.length > 0
            ? normalizedSelectedIds
            : this.getDefaultComparisonTranslationIds(state);
    }

    public static getDefaultComparisonTranslationIds(state: TranslationControllerState): string[] {
        if (state.v2Data === null) {
            return state.activeTranslationId === null ? [] : [state.activeTranslationId];
        }

        const availableTranslationIds = Object.keys(state.v2Data.translations);
        const orderedTranslationIds = [
            ...state.translationOrder,
            ...availableTranslationIds,
        ];
        return [...new Set(orderedTranslationIds)]
            .filter((translationId) => state.v2Data?.translations[translationId] !== undefined)
            .slice(0, 4);
    }

    public static getTranslationPreviewTitle(state: TranslationControllerState, translationId: string): string {
        return state.v2Data?.translations[translationId]?.name ?? translationId;
    }
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
