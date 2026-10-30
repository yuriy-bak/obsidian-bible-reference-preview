import { DropdownComponent, TextComponent, type SettingDefinitionList } from "obsidian";
import { MAX_TRANSLATION_CODE_LENGTH } from "../translations/translationCodes";
import type { TranslationSettingsItem } from "../translations/TranslationModels";

type TranslationSettingsListI18nKey =
    | "settings.translations.title"
    | "settings.translations.empty"
    | "settings.translations.language"
    | "settings.translations.books"
    | "settings.translations.file"
    | "settings.translations.versification"
    | "settings.translations.code"
    | "settings.translations.codeHint"
    | "settings.translations.codeInvalid"
    | "settings.translations.codeTaken";

type TranslationSettingsListI18nParams = Record<string, string | number>;

export type TranslationSettingsListInput = {
    translations: TranslationSettingsItem[];
    translate: (key: TranslationSettingsListI18nKey, params?: TranslationSettingsListI18nParams) => string;
    /** Scheme names by key, offered in each translation's numbering dropdown. */
    versificationOptions: Record<string, string>;
    onVersificationChange: (translationId: string, versification: string) => Promise<void>;
    /** Resolves with why the code was not accepted, or null. */
    onCodeChange: (translationId: string, code: string) => Promise<"invalid" | "taken" | null>;
    showError: (message: string) => void;
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
            // The numbering and the code sit under the description: beside the name they get squeezed on a phone.
            // Obsidian may render the same row again (on mobile it does), so the previous controls go first.
            render: (setting) => {
                setting.infoEl.querySelectorAll(".bible-translation-setting-controls").forEach((element) => element.remove());
                const controlsEl = setting.infoEl.createDiv({ cls: "bible-translation-setting-controls" });

                const versificationEl = controlsEl.createEl("label", { cls: "bible-translation-setting-control" });
                versificationEl.createSpan({ text: translate("settings.translations.versification") });
                const versificationOptions = getOptionsWith(input.versificationOptions, translation.versification);
                const versificationDropdown = new DropdownComponent(versificationEl)
                    .addOptions(getShortOptions(versificationOptions))
                    .setValue(translation.versification)
                    .onChange((value) => {
                        void input.onVersificationChange(translation.id, value).then(() => input.refresh());
                    });
                versificationDropdown.selectEl.title = versificationOptions[translation.versification] ?? "";

                const codeEl = controlsEl.createEl("label", { cls: "bible-translation-setting-control" });
                codeEl.createSpan({ text: translate("settings.translations.code") });
                const codeInput = new TextComponent(codeEl).setValue(translation.code);
                codeInput.inputEl.addClass("bible-translation-setting-code");
                codeInput.inputEl.maxLength = MAX_TRANSLATION_CODE_LENGTH;
                codeInput.inputEl.title = translate("settings.translations.codeHint", { code: translation.code });
                // Saved when the field is left, not on every key: each code change rebuilds the parser.
                codeInput.inputEl.addEventListener("change", () => {
                    const code = codeInput.getValue();
                    if (code.trim() === translation.code) {
                        return;
                    }
                    void input.onCodeChange(translation.id, code).then((error) => {
                        if (error !== null) {
                            input.showError(translate(error === "invalid" ? "settings.translations.codeInvalid" : "settings.translations.codeTaken", { code: code.trim() }));
                        }
                        input.refresh();
                    });
                });

                return () => controlsEl.remove();
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

// The list is narrow on a phone: "English (KJV, NWT, …)" is shown as "English", the full name is the tooltip.
function getShortOptions(options: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(options).map(([key, label]) => [key, label.replace(/\s*\(.*\)\s*$/u, "") || label]));
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
