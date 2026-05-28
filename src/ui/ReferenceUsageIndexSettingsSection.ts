import { Setting } from "obsidian";

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

export type ReferenceUsageIndexSettingsSectionInput = {
    containerEl: HTMLElement;
    translate(key: ReferenceUsageIndexSettingsI18nKey): string;
    isEnabled(): boolean;
    setEnabled(value: boolean): Promise<void> | void;
    isAutoUpdateEnabled(): boolean;
    setAutoUpdateEnabled(value: boolean): Promise<void> | void;
    getExcludedFoldersText(): string;
    setExcludedFoldersText(value: string): Promise<void> | void;
    buildIndex(): Promise<void> | void;
    rebuildIndex(): Promise<void> | void;
    showStats(): Promise<void> | void;
    clearIndex(): Promise<void> | void;
};

export function renderReferenceUsageIndexSettingsSection(input: ReferenceUsageIndexSettingsSectionInput): void {
    const { containerEl, translate } = input;

    containerEl.createEl("h3", { text: translate("settings.referenceUsageIndex.title") });
    containerEl.createEl("p", { text: translate("settings.referenceUsageIndex.desc") });

    new Setting(containerEl)
        .setName(translate("settings.referenceUsageIndex.enabled.name"))
        .setDesc(translate("settings.referenceUsageIndex.enabled.desc"))
        .addToggle((toggle) => toggle
            .setValue(input.isEnabled())
            .onChange((value) => void input.setEnabled(value)));

    new Setting(containerEl)
        .setName(translate("settings.referenceUsageIndex.autoUpdate.name"))
        .setDesc(translate("settings.referenceUsageIndex.autoUpdate.desc"))
        .addToggle((toggle) => toggle
            .setValue(input.isAutoUpdateEnabled())
            .onChange((value) => void input.setAutoUpdateEnabled(value)));

    new Setting(containerEl)
        .setName(translate("settings.referenceUsageIndex.excludedFolders.name"))
        .setDesc(translate("settings.referenceUsageIndex.excludedFolders.desc"))
        .addTextArea((textArea) => {
            textArea
                .setPlaceholder("Attachments/\nTemplates/\nArchive/\nBible/")
                .setValue(input.getExcludedFoldersText())
                .onChange((value) => void input.setExcludedFoldersText(value));
            textArea.inputEl.rows = 4;
            textArea.inputEl.style.width = "100%";
        });

    new Setting(containerEl)
        .setName(translate("settings.referenceUsageIndex.actions.name"))
        .setDesc(translate("settings.referenceUsageIndex.actions.desc"))
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
            .onClick(() => void input.clearIndex()));
}
