import type { SettingDefinitionItem } from "obsidian";
import type { I18nKey } from "../i18n/I18n";

/** Where people can thank the author; the same pages as fundingUrl in manifest.json and .github/FUNDING.yml. */
export const FUNDING_LINKS: { name: string; url: string }[] = [
    { name: "Boosty", url: "https://boosty.to/yuriybak" },
];

/** The last group of the main settings screen: a button for each page where the author can be thanked. */
export function createSupportSettingsGroup<K extends string>(translate: (key: I18nKey) => string, openUrl: (url: string) => void): SettingDefinitionItem<K> {
    return {
        type: "group",
        heading: translate("settings.support.title"),
        items: [
            {
                name: translate("settings.support.name"),
                desc: translate("settings.support.desc"),
                render: (setting) => {
                    FUNDING_LINKS.forEach((link) => {
                        setting.addButton((button) => button
                            .setButtonText(link.name)
                            .setCta()
                            .onClick(() => openUrl(link.url)));
                    });
                },
            },
        ],
    };
}
