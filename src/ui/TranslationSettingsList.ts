import type { SettingDefinitionList } from "obsidian";
import type { TranslationSettingsItem } from "../translations/TranslationModels";

type TranslationSettingsListI18nKey =
    | "settings.translations.title"
    | "settings.translations.empty"
    | "settings.translations.language"
    | "settings.translations.books"
    | "settings.translations.file"
    | "settings.translations.versification";

type TranslationSettingsListI18nParams = Record<string, string | number>;

export type TranslationSettingsListInput = {
    translations: TranslationSettingsItem[];
    translate: (key: TranslationSettingsListI18nKey, params?: TranslationSettingsListI18nParams) => string;
    /** Scheme names by key, offered in each translation's numbering dropdown. */
    versificationOptions: Record<string, string>;
    onVersificationChange: (translationId: string, versification: string) => Promise<void>;
    onDelete: (translationId: string) => Promise<void>;
    onReorder: (nextOrder: string[]) => Promise<void>;
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
            render: (setting) => {
                setting.addDropdown((dropdown) => {
                    dropdown
                        .addOptions(getOptionsWith(input.versificationOptions, translation.versification))
                        .setValue(translation.versification)
                        .onChange((value) => {
                            void input.onVersificationChange(translation.id, value).then(() => input.refresh());
                        });
                    dropdown.selectEl.setAttribute("aria-label", translate("settings.translations.versification"));
                    dropdown.selectEl.title = translate("settings.translations.versification");
                });
            },
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

// A stored key the registry no longer knows still shows up instead of silently selecting another scheme.
function getOptionsWith(options: Record<string, string>, key: string): Record<string, string> {
    return key in options ? options : { ...options, [key]: key };
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
