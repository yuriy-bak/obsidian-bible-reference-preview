import type { SettingDefinitionGroup } from "obsidian";
import { t, type BiblePluginLocale } from "../i18n/I18n";

type ReferenceUsageIndexSettingsI18nKey =
    | "settings.referenceUsageIndex.title"
    | "settings.referenceUsageIndex.desc"
    | "settings.referenceUsageIndex.enabled.name"
    | "settings.referenceUsageIndex.enabled.desc"
    | "settings.referenceUsageIndex.autoUpdate.name"
    | "settings.referenceUsageIndex.autoUpdate.desc"
    | "settings.referenceUsageIndex.excludedFolders.name"
    | "settings.referenceUsageIndex.excludedFolders.desc"
    | "settings.referenceUsageIndex.actions.name"
    | "settings.referenceUsageIndex.actions.desc"
    | "settings.referenceUsageIndex.build.button"
    | "settings.referenceUsageIndex.rebuild.button"
    | "settings.referenceUsageIndex.stats.button"
    | "settings.referenceUsageIndex.clear.button";

export type ReferenceUsageIndexSettingKey =
    | "referenceUsageIndexingEnabled"
    | "referenceUsageAutoUpdate"
    | "referenceUsageExcludedFolders";

export type ReferenceUsageIndexSettingsSectionInput = {
    translate: (key: ReferenceUsageIndexSettingsI18nKey) => string;
    buildIndex: () => Promise<void> | void;
    rebuildIndex: () => Promise<void> | void;
    showStats: () => Promise<void> | void;
    clearIndex: () => Promise<void> | void;
};

const ACTION_BUTTON_KEYS: ReferenceUsageIndexSettingsI18nKey[] = [
    "settings.referenceUsageIndex.build.button",
    "settings.referenceUsageIndex.rebuild.button",
    "settings.referenceUsageIndex.stats.button",
    "settings.referenceUsageIndex.clear.button",
];

const ALIAS_LOCALES: BiblePluginLocale[] = ["en", "ru"];

export function createReferenceUsageIndexSettingsGroup(input: ReferenceUsageIndexSettingsSectionInput): SettingDefinitionGroup<ReferenceUsageIndexSettingKey> {
    const { translate } = input;

    return {
        type: "group",
        heading: translate("settings.referenceUsageIndex.title"),
        items: [
            {
                name: translate("settings.referenceUsageIndex.enabled.name"),
                desc: translate("settings.referenceUsageIndex.enabled.desc"),
                control: { type: "toggle", key: "referenceUsageIndexingEnabled" },
            },
            {
                name: translate("settings.referenceUsageIndex.autoUpdate.name"),
                desc: translate("settings.referenceUsageIndex.autoUpdate.desc"),
                control: { type: "toggle", key: "referenceUsageAutoUpdate" },
            },
            {
                name: translate("settings.referenceUsageIndex.excludedFolders.name"),
                desc: translate("settings.referenceUsageIndex.excludedFolders.desc"),
                control: {
                    type: "textarea",
                    key: "referenceUsageExcludedFolders",
                    placeholder: ["Attachments/", "Templates/", "Archive/", "Bible/"].join("\n"),
                    rows: 4,
                },
            },
            {
                name: translate("settings.referenceUsageIndex.actions.name"),
                desc: `${translate("settings.referenceUsageIndex.actions.desc")} ${translate("settings.referenceUsageIndex.desc")}`,
                // Button labels are not indexed by settings search, so expose them as aliases in both languages.
                aliases: ALIAS_LOCALES.flatMap((locale) => ACTION_BUTTON_KEYS.map((key) => t(locale, key))),
                render: (setting) => {
                    setting
                        .addButton((button) => button
                            .setButtonText(translate("settings.referenceUsageIndex.build.button"))
                            .onClick(() => void input.buildIndex()))
                        .addButton((button) => button
                            .setButtonText(translate("settings.referenceUsageIndex.rebuild.button"))
                            .onClick(() => void input.rebuildIndex()))
                        .addButton((button) => button
                            .setButtonText(translate("settings.referenceUsageIndex.stats.button"))
                            .onClick(() => void input.showStats()))
                        .addButton((button) => button
                            .setButtonText(translate("settings.referenceUsageIndex.clear.button"))
                            .setDestructive()
                            .onClick(() => void input.clearIndex()));
                },
            },
        ],
    };
}
