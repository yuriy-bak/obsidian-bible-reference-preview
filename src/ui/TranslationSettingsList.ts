import type { SettingDefinitionList } from "obsidian";
import type { TranslationSettingsItem } from "../translations/TranslationModels";

type TranslationSettingsListI18nKey =
    | "settings.translations.title"
    | "settings.translations.empty"
    | "settings.translations.language"
    | "settings.translations.books"
    | "settings.translations.file"
    | "settings.import.button";

type TranslationSettingsListI18nParams = Record<string, string | number>;

export type TranslationSettingsListInput = {
    translations: TranslationSettingsItem[];
    translate: (key: TranslationSettingsListI18nKey, params?: TranslationSettingsListI18nParams) => string;
    onDelete: (translationId: string) => Promise<void>;
    onReorder: (nextOrder: string[]) => Promise<void>;
    onImport: () => void;
    refresh: () => void;
};

export function createTranslationSettingsList(input: TranslationSettingsListInput): SettingDefinitionList<never> {
    const { translations, translate } = input;
    const translationIds = translations.map((translation) => translation.id);

    return {
        type: "list",
        heading: translate("settings.translations.title"),
        emptyState: translate("settings.translations.empty"),
        items: translations.map((translation) => ({
            name: `${translation.isActive ? "✓ " : ""}${translation.name || translation.id}`,
            desc: createTranslationDescription(translation, translate),
        })),
        onReorder: (oldIndex, newIndex) => {
            const nextOrder = moveItem(translationIds, oldIndex, newIndex);
            if (nextOrder === null) {
                return;
            }
            void input.onReorder(nextOrder).then(() => input.refresh());
        },
        onDelete: (index) => {
            const translationId = translationIds[index];
            if (translationId === undefined) {
                return;
            }
            // The delete flow asks for confirmation; refresh either way so a cancelled delete keeps the row.
            void input.onDelete(translationId).then(() => input.refresh());
        },
        addItem: {
            name: translate("settings.import.button"),
            action: () => input.onImport(),
        },
    };
}

function createTranslationDescription(translation: TranslationSettingsItem, translate: TranslationSettingsListInput["translate"]): string {
    return [
        `ID: ${translation.id}`,
        translate("settings.translations.language", { language: translation.language || "und" }),
        translate("settings.translations.books", { count: translation.bookCount }),
        translation.sourceFileName.length === 0 ? "" : translate("settings.translations.file", { fileName: translation.sourceFileName }),
    ].filter((part) => part.length > 0).join(" · ");
}

function moveItem(items: string[], oldIndex: number, newIndex: number): string[] | null {
    if (oldIndex === newIndex || oldIndex < 0 || oldIndex >= items.length || newIndex < 0 || newIndex >= items.length) {
        return null;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(oldIndex, 1);
    nextItems.splice(newIndex, 0, movedItem);
    return nextItems;
}
