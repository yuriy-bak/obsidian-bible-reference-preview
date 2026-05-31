import { App, PluginSettingTab, Setting } from "obsidian";
import type BiblePlugin from "../../main";
import { renderColorSettingsSection } from "./ColorSettingsSection";
import { renderReferenceUsageIndexSettingsSection } from "./ReferenceUsageIndexSettingsSection";
import { renderTranslationSettingsSection } from "./TranslationSettingsList";

type BiblePluginLocale = "ru" | "en";
type BiblePreviewTriggerMode = "current-paragraph" | "clicked-reference";
type BiblePreviewDisplayMode = "floating" | "side-panel";
type BiblePreviewPanelSide = "right" | "left";
type BibleLinkOpenShortcut = "alt-enter" | "ctrl-enter" | "ctrl-alt-enter";

export class BiblePluginSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: BiblePlugin) { super(app, plugin); }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: this.plugin.t("settings.title") });

        new Setting(containerEl)
            .setName(this.plugin.t("settings.pluginActive.name"))
            .setDesc(this.plugin.t("settings.pluginActive.desc"))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.isPluginActive())
                .onChange(async (value) => {
                    await this.plugin.setPluginActive(value);
                }));

        new Setting(containerEl)
            .setName(this.plugin.t("settings.interfaceLanguage.name"))
            .setDesc(this.plugin.t("settings.interfaceLanguage.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("ru", this.plugin.t("settings.interfaceLanguage.ru"))
                    .addOption("en", this.plugin.t("settings.interfaceLanguage.en"))
                    .setValue(this.plugin.getInterfaceLanguage())
                    .onChange((value) => void this.plugin.setInterfaceLanguage(value as BiblePluginLocale));
            });

        new Setting(containerEl)
            .setName(this.plugin.t("settings.import.name"))
            .setDesc(this.plugin.t("settings.import.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.import.button")).setCta().onClick(() => this.plugin.openEpubFilePicker()));

        this.renderTranslationsSection(containerEl);
        this.renderReferenceUsageIndexSection(containerEl);

        new Setting(containerEl)
            .setName(this.plugin.t("settings.previewMode.name"))
            .setDesc(this.plugin.t("settings.previewMode.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("current-paragraph", this.plugin.t("settings.previewMode.currentParagraph"))
                    .addOption("clicked-reference", this.plugin.t("settings.previewMode.clickedReference"))
                    .setValue(this.plugin.getBiblePreviewTriggerMode())
                    .onChange((value) => void this.plugin.setBiblePreviewTriggerMode(value as BiblePreviewTriggerMode));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.previewDisplayMode.name"))
            .setDesc(this.plugin.t("settings.previewDisplayMode.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("floating", this.plugin.t("settings.previewDisplayMode.floating"))
                    .addOption("side-panel", this.plugin.t("settings.previewDisplayMode.sidePanel"))
                    .setValue(this.plugin.getBiblePreviewDisplayMode())
                    .onChange((value) => void this.plugin.setBiblePreviewDisplayMode(value as BiblePreviewDisplayMode));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.autoOpenPreviewOnVerseChange.name"))
            .setDesc(this.plugin.t("settings.autoOpenPreviewOnVerseChange.desc"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.shouldAutoOpenPreviewOnVerseChange())
                    .onChange((value) => void this.plugin.setAutoOpenPreviewOnVerseChange(value));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.previewPanelSide.name"))
            .setDesc(this.plugin.t("settings.previewPanelSide.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("right", this.plugin.t("settings.previewPanelSide.right"))
                    .addOption("left", this.plugin.t("settings.previewPanelSide.left"))
                    .setValue(this.plugin.getBiblePreviewPanelSide())
                    .onChange((value) => void this.plugin.setBiblePreviewPanelSide(value as BiblePreviewPanelSide));
            });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.closePreviewOnTabChange.name"))
            .setDesc(this.plugin.t("settings.closePreviewOnTabChange.desc"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.shouldClosePreviewOnActiveLeafChange())
                    .onChange((value) => void this.plugin.setClosePreviewOnActiveLeafChange(value));
            });

        new Setting(containerEl)
            .setName(this.plugin.t("settings.hotkey.name"))
            .setDesc(this.plugin.t("settings.hotkey.desc"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.shouldInterceptLinkOpenShortcut())
                    .onChange((value) => void this.plugin.setInterceptLinkOpenShortcut(value));
            })
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("alt-enter", "Alt+Enter")
                    .addOption("ctrl-enter", "Ctrl+Enter")
                    .addOption("ctrl-alt-enter", "Ctrl+Alt+Enter")
                    .setValue(this.plugin.getBibleLinkOpenShortcut())
                    .onChange((value) => void this.plugin.setBibleLinkOpenShortcut(value as BibleLinkOpenShortcut));
            });

        renderColorSettingsSection({
            containerEl,
            translate: (key) => this.plugin.t(key),
            openCssColorDialog: (input) => this.plugin.openCssColorDialog(input),
            openFloatingPreviewBackgroundColorDialog: () => this.plugin.openFloatingPreviewBackgroundColorDialog(),
            getBibleReferenceLinkColor: () => this.plugin.getBibleReferenceLinkColor(),
            getBibleReferenceLinkColorPickerValue: () => this.plugin.getBibleReferenceLinkColorPickerValue(),
            isBibleReferenceLinkColorDefault: () => this.plugin.isBibleReferenceLinkColorDefault(),
            setBibleReferenceLinkColor: (color) => this.plugin.setBibleReferenceLinkColor(color),
            resetBibleReferenceLinkColor: () => this.plugin.resetBibleReferenceLinkColor(),
            getFloatingPreviewBackgroundColor: () => this.plugin.getFloatingPreviewBackgroundColor(),
            isFloatingPreviewBackgroundColorDefault: () => this.plugin.isFloatingPreviewBackgroundColorDefault(),
            resetFloatingPreviewBackgroundColor: () => this.plugin.resetFloatingPreviewBackgroundColor(),
            refresh: () => this.display(),
        });
        new Setting(containerEl)
            .setName(this.plugin.t("settings.openIndexFolder.name"))
            .setDesc(this.plugin.t("settings.openIndexFolder.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.openIndexFolder.button")).onClick(() => void this.plugin.openBibleIndexFolder()));

        new Setting(containerEl)
            .setName(this.plugin.t("settings.showStats.name"))
            .setDesc(this.plugin.t("settings.showStats.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.showStats.button")).onClick(() => void this.plugin.showBibleIndexStats()));
    }

    private renderReferenceUsageIndexSection(containerEl: HTMLElement): void {
        renderReferenceUsageIndexSettingsSection({
            containerEl,
            translate: (key) => this.plugin.t(key),
            isEnabled: () => this.plugin.isReferenceUsageIndexingEnabled(),
            setEnabled: (value) => this.plugin.setReferenceUsageIndexingEnabled(value),
            isAutoUpdateEnabled: () => this.plugin.shouldAutoUpdateReferenceUsageIndex(),
            setAutoUpdateEnabled: (value) => this.plugin.setReferenceUsageAutoUpdate(value),
            getExcludedFoldersText: () => this.plugin.getReferenceUsageExcludedFoldersText(),
            setExcludedFoldersText: (value) => this.plugin.setReferenceUsageExcludedFoldersText(value),
            buildIndex: () => this.plugin.buildReferenceUsageIndex(),
            rebuildIndex: () => this.plugin.rebuildReferenceUsageIndex(),
            showStats: () => this.plugin.showReferenceUsageIndexStats(),
            clearIndex: () => this.plugin.clearReferenceUsageIndex(),
        });
    }

    private renderTranslationsSection(containerEl: HTMLElement): void {
        renderTranslationSettingsSection({
            containerEl,
            translations: this.plugin.getTranslationSettingsItems(),
            translate: (key, params) => this.plugin.t(key, params),
            onDelete: (translationId) => this.plugin.deleteImportedTranslation(translationId),
            onToggleComparison: (translationId, enabled) => this.plugin.setComparisonTranslationEnabled(translationId, enabled),
            getCurrentOrder: () => this.plugin.getTranslationSettingsItems().map((item) => item.id),
            onReorder: (nextOrder) => this.plugin.setTranslationOrder(nextOrder),
            refresh: () => this.display(),
        });
    }
}
