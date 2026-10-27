import { Setting } from "obsidian";
import type { TranslationSettingsItem } from "../translations/TranslationModels";

type TranslationSettingsListI18nKey =
    | "settings.translations.title"
    | "settings.translations.desc"
    | "settings.translations.empty"
    | "settings.translations.language"
    | "settings.translations.books"
    | "settings.translations.file"
    | "settings.translations.deleteAria";

type TranslationSettingsListI18nParams = Record<string, string | number>;

export type TranslationSettingsSectionInput = {
    containerEl: HTMLElement;
    translations: TranslationSettingsItem[];
    translate: (key: TranslationSettingsListI18nKey, params?: TranslationSettingsListI18nParams) => string;
    onDelete: (translationId: string) => Promise<void>;
    getCurrentOrder: () => string[];
    onReorder: (nextOrder: string[]) => Promise<void>;
    refresh: () => void;
};

export function renderTranslationSettingsSection(input: TranslationSettingsSectionInput): void {
    const { containerEl, translations, translate } = input;

    new Setting(containerEl).setName(translate("settings.translations.title")).setHeading();
    containerEl.createEl("p", {
        text: translate("settings.translations.desc"),
    });

    if (translations.length === 0) {
        containerEl.createEl("p", { text: translate("settings.translations.empty") });
        return;
    }

    const listEl = containerEl.createDiv({ cls: "bible-translation-settings-list" });

    let draggedTranslationId: string | null = null;
    const rows: HTMLElement[] = [];

    const clearDropStyles = (): void => {
        for (const row of rows) {
            row.removeClass("bible-translation-settings-row-drop-before", "bible-translation-settings-row-drop-after");
        }
    };

    for (const translation of translations) {
        const row = listEl.createDiv({ cls: "bible-translation-settings-row" });
        row.toggleClass("is-active", translation.isActive);
        rows.push(row);
        row.draggable = true;

        row.createSpan({ text: "☰", cls: "bible-translation-settings-drag-handle" });

        const textEl = row.createDiv({ cls: "bible-translation-settings-text" });

        textEl.createDiv({
            text: `${translation.isActive ? "✓ " : ""}${translation.name || translation.id}`,
            cls: "bible-translation-settings-title",
        });

        const description = [
            `ID: ${translation.id}`,
            translate("settings.translations.language", { language: translation.language || "und" }),
            translate("settings.translations.books", { count: translation.bookCount }),
            translation.sourceFileName.length === 0 ? "" : translate("settings.translations.file", { fileName: translation.sourceFileName }),
        ].filter((part) => part.length > 0).join(" · ");

        textEl.createDiv({ text: description, cls: "bible-translation-settings-description" });

        const deleteButton = row.createEl("button", { text: "🗑", cls: "bible-translation-settings-delete-button" });
        deleteButton.setAttribute("aria-label", translate("settings.translations.deleteAria", { translationName: translation.name || translation.id }));
        deleteButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void input.onDelete(translation.id).then(() => input.refresh());
        });

        row.addEventListener("dragstart", (event) => {
            draggedTranslationId = translation.id;
            row.addClass("is-dragging");

            if (event.dataTransfer !== null) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", translation.id);
            }
        });

        row.addEventListener("dragend", () => {
            draggedTranslationId = null;
            row.removeClass("is-dragging");
            clearDropStyles();
        });

        row.addEventListener("dragover", (event) => {
            const sourceTranslationId = event.dataTransfer?.getData("text/plain") || draggedTranslationId;
            if (sourceTranslationId === null || sourceTranslationId === translation.id) {
                return;
            }

            event.preventDefault();
            clearDropStyles();

            const rect = row.getBoundingClientRect();
            const insertAfter = event.clientY > rect.top + rect.height / 2;
            if (insertAfter) {
                row.addClass("bible-translation-settings-row-drop-after");
            } else {
                row.addClass("bible-translation-settings-row-drop-before");
            }
        });

        row.addEventListener("dragleave", () => {
            row.removeClass("bible-translation-settings-row-drop-before", "bible-translation-settings-row-drop-after");
        });

        row.addEventListener("drop", (event) => void (async () => {
            event.preventDefault();
            const sourceTranslationId = event.dataTransfer?.getData("text/plain") || draggedTranslationId;
            clearDropStyles();

            if (sourceTranslationId === null || sourceTranslationId === translation.id) {
                return;
            }

            const nextOrder = input.getCurrentOrder();
            const sourceIndex = nextOrder.indexOf(sourceTranslationId);
            let targetIndex = nextOrder.indexOf(translation.id);

            if (sourceIndex < 0 || targetIndex < 0) {
                return;
            }

            const rect = row.getBoundingClientRect();
            const insertAfter = event.clientY > rect.top + rect.height / 2;
            nextOrder.splice(sourceIndex, 1);

            if (sourceIndex < targetIndex) {
                targetIndex -= 1;
            }

            if (insertAfter) {
                targetIndex += 1;
            }

            nextOrder.splice(targetIndex, 0, sourceTranslationId);
            await input.onReorder(nextOrder);
            input.refresh();
        })());
    }
}
