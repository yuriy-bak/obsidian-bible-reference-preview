import { Notice } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import { getTranslationBooks } from "../infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { findCustomBookAliasConflicts, getBookIndexAliases, normalizeCustomBookAliases, type CustomBookAliasConflict } from "../parsing/customBookAliases";
import { openConfirmModal } from "../ui/ConfirmModal";
import { areStringArraysEqual } from "../utils/ArrayEquality";
import { isValidTranslationCode, normalizeTranslationCode } from "./translationCodes";
import { TranslationController, type TranslationControllerState } from "./TranslationController";
import type { BookAliasesEditorBook, PreviewComparisonTranslationOption, TranslationSettingsItem } from "./TranslationModels";

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

    getTranslationSettingsItems(): TranslationSettingsItem[] {
        const codes = this.context.getTranslationCodes();
        return TranslationController.getTranslationSettingsItems(this.getControllerState())
            .map((item) => ({
                ...item,
                code: codes.get(item.id) ?? "",
                customBookAliasCount: Object.values(this.context.settings.bookAliases[item.id] ?? {})
                    .reduce((count, aliases) => count + aliases.length, 0),
            }));
    }

    /** The translation's books for the "Book names" window, in the translation's order. */
    getBookAliasesEditorBooks(translationId: string): BookAliasesEditorBook[] {
        const translation = this.context.v2Data?.translations[translationId];
        if (translation === undefined) {
            return [];
        }
        const customAliases = this.context.settings.bookAliases[translationId] ?? {};
        const books = getTranslationBooks(translation);
        const order = translation.bookOrder ?? [];
        const position = (bookId: number): number => {
            const index = order.indexOf(bookId);
            return index === -1 ? order.length + bookId : index;
        };
        return books
            .sort((left, right) => position(left.id) - position(right.id))
            .map((book) => ({
                id: book.id,
                name: getBookIndexAliases(book)[0] ?? String(book.id),
                indexAliases: getBookIndexAliases(book),
                customAliases: customAliases[String(book.id)] ?? [],
            }));
    }

    /** Asks for confirmation and removes all the user's book names of a translation. Resolves with whether it did. */
    async resetCustomBookAliases(translationId: string): Promise<boolean> {
        if (this.context.settings.bookAliases[translationId] === undefined) {
            return false;
        }
        const translationName = this.context.v2Data?.translations[translationId]?.name || translationId;
        const confirmed = await openConfirmModal(this.context.app, {
            title: this.context.t("confirm.resetBookAliases.title", { translationName }),
            messageLines: [this.context.t("confirm.resetBookAliases.message")],
            confirmText: this.context.t("confirm.resetBookAliases.confirm"),
            cancelText: this.context.t("common.cancel"),
        });
        if (!confirmed) {
            return false;
        }
        const { [translationId]: _removed, ...otherTranslations } = this.context.settings.bookAliases;
        this.context.updateSettings({ bookAliases: otherTranslations });
        await this.context.saveSettings();
        this.context.updateBookMapping();
        await this.effects.refreshVisibleBiblePreviewContent();
        return true;
    }

    /**
     * Stores the user's names of a book; an empty list removes them. A name another book of the translation
     * already has is refused: the conflicts are returned and nothing is saved.
     */
    async setCustomBookAliases(translationId: string, bookId: number, aliases: string[]): Promise<CustomBookAliasConflict[]> {
        const translation = this.context.v2Data?.translations[translationId];
        if (translation === undefined) {
            return [];
        }
        const normalized = normalizeCustomBookAliases(aliases);
        const translationAliases = this.context.settings.bookAliases[translationId] ?? {};
        const conflicts = findCustomBookAliasConflicts(getTranslationBooks(translation, translationAliases), bookId, normalized);
        if (conflicts.length > 0) {
            return conflicts;
        }

        const { [String(bookId)]: _previous, ...otherBooks } = translationAliases;
        const nextTranslationAliases = normalized.length > 0 ? { ...otherBooks, [String(bookId)]: normalized } : otherBooks;
        const { [translationId]: _previousTranslation, ...otherTranslations } = this.context.settings.bookAliases;
        this.context.updateSettings({
            bookAliases: Object.keys(nextTranslationAliases).length > 0
                ? { ...otherTranslations, [translationId]: nextTranslationAliases }
                : otherTranslations,
        });
        await this.context.saveSettings();
        this.context.updateBookMapping();
        await this.effects.refreshVisibleBiblePreviewContent();
        return [];
    }

    /**
     * Stores the code the user gave a translation; an empty code brings back the default one.
     * Returns why the code was not accepted, or null.
     */
    async setTranslationCode(translationId: string, code: string): Promise<"invalid" | "taken" | null> {
        const trimmedCode = code.trim();
        const { [translationId]: _previousCode, ...otherCodes } = this.context.settings.translationCodes;
        if (trimmedCode.length > 0) {
            if (!isValidTranslationCode(trimmedCode)) {
                return "invalid";
            }
            const normalizedCode = normalizeTranslationCode(trimmedCode);
            const isTaken = [...this.context.getTranslationCodes()]
                .some(([otherId, otherCode]) => otherId !== translationId && normalizeTranslationCode(otherCode) === normalizedCode);
            if (isTaken) {
                return "taken";
            }
        }

        this.context.updateSettings({ translationCodes: trimmedCode.length > 0 ? { ...otherCodes, [translationId]: trimmedCode } : otherCodes });
        await this.context.saveSettings();
        this.context.updateBookMapping();
        await this.effects.refreshVisibleBiblePreviewContent();
        return null;
    }

    /**
     * Renames a translation; its id stays, so settings and the usage index still find it.
     * The default code is made from the name, so the current one is kept as the user's code:
     * references like "Пс 22:1 (СП)" already written in notes keep working.
     * Returns "empty" when the name is blank, or null.
     */
    async setTranslationName(translationId: string, name: string): Promise<"empty" | null> {
        const trimmedName = name.trim().replace(/\s+/gu, " ");
        if (trimmedName.length === 0) {
            return "empty";
        }
        const translation = this.context.v2Data?.translations[translationId];
        if (translation === undefined || translation.name === trimmedName) {
            return null;
        }

        const currentCode = this.context.getTranslationCodes().get(translationId);
        if (this.context.settings.translationCodes[translationId] === undefined && currentCode !== undefined && currentCode.length > 0) {
            this.context.updateSettings({ translationCodes: { ...this.context.settings.translationCodes, [translationId]: currentCode } });
            await this.context.saveSettings();
        }

        if (this.isBeingImported(translationId)) {
            return null;
        }
        const repository = this.context.createRepository();
        await repository.load();
        await repository.updateTranslationName(translationId, trimmedName);
        this.context.setBibleData(repository.getIndex(), repository.getV2Data());
        this.context.updateBookMapping();
        await this.effects.refreshVisibleBiblePreviewContent();
        return null;
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

    // A running import writes this translation's files and metadata at its end, over a rename or a deletion.
    private isBeingImported(translationId: string): boolean {
        if (this.context.importingTranslationId !== translationId) {
            return false;
        }
        new Notice(this.context.t("notice.translationBeingImported"), 5000);
        return true;
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

        if (this.isBeingImported(translationId)) {
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

        if (this.isBeingImported(translationId)) {
            return;
        }
        const repository = this.context.createRepository();
        await repository.load();
        await repository.deleteTranslation(translationId);

        this.context.setBibleData(repository.getIndex(), repository.getV2Data());
        const { [translationId]: _deletedBookAliases, ...otherBookAliases } = this.context.settings.bookAliases;
        this.context.updateSettings({
            translationOrder: this.context.settings.translationOrder.filter((existingTranslationId) => existingTranslationId !== translationId),
            bookAliases: otherBookAliases,
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
