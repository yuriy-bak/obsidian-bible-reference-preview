import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { BiblePluginLocale, I18nKey } from "../i18n/I18n";
import type { BibleLinkOpenShortcut, BiblePreviewDisplayMode, BiblePreviewPanelSide, BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { TranslationSettingsItem } from "../translations/TranslationModels";
import type { CssColorDialogInput } from "./CssColorDialog";
import { renderColorSettingsSection as renderColorSettingsSectionView, type ColorSettingsSectionInput } from "./ColorSettingsSection";
import { renderReferenceUsageIndexSettingsSection, type ReferenceUsageIndexSettingsSectionInput } from "./ReferenceUsageIndexSettingsSection";
import { renderTranslationSettingsSection, type TranslationSettingsSectionInput } from "./TranslationSettingsList";

export type BiblePluginSettingTabInput = {
    t(key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>): string;

    isPluginActive(): boolean;
    setPluginActive(isPluginActive: boolean): Promise<void>;
    getInterfaceLanguage(): BiblePluginLocale;
    setInterfaceLanguage(interfaceLanguage: BiblePluginLocale): Promise<void>;
    openEpubFilePicker(): void;

    getTranslationSettingsItems(): TranslationSettingsItem[];
    deleteImportedTranslation(translationId: string): Promise<void>;
    setTranslationOrder(nextOrder: string[]): Promise<void>;

    isReferenceUsageIndexingEnabled(): boolean;
    setReferenceUsageIndexingEnabled(referenceUsageIndexingEnabled: boolean): Promise<void>;
    shouldAutoUpdateReferenceUsageIndex(): boolean;
    setReferenceUsageAutoUpdate(referenceUsageAutoUpdate: boolean): Promise<void>;
    getReferenceUsageExcludedFoldersText(): string;
    setReferenceUsageExcludedFoldersText(value: string): Promise<void>;
    buildReferenceUsageIndex(): Promise<void>;
    rebuildReferenceUsageIndex(): Promise<void>;
    showReferenceUsageIndexStats(): Promise<void>;
    clearReferenceUsageIndex(): Promise<void>;

    getBiblePreviewTriggerMode(): BiblePreviewTriggerMode;
    setBiblePreviewTriggerMode(previewTriggerMode: BiblePreviewTriggerMode): Promise<void>;
    getBiblePreviewDisplayMode(): BiblePreviewDisplayMode;
    setBiblePreviewDisplayMode(previewDisplayMode: BiblePreviewDisplayMode): Promise<void>;
    shouldAutoOpenPreviewOnVerseChange(): boolean;
    setAutoOpenPreviewOnVerseChange(autoOpenPreviewOnVerseChange: boolean): Promise<void>;
    getBiblePreviewPanelSide(): BiblePreviewPanelSide;
    setBiblePreviewPanelSide(previewPanelSide: BiblePreviewPanelSide): Promise<void>;
    shouldClosePreviewOnActiveLeafChange(): boolean;
    setClosePreviewOnActiveLeafChange(closePreviewOnActiveLeafChange: boolean): Promise<void>;
    shouldInterceptLinkOpenShortcut(): boolean;
    setInterceptLinkOpenShortcut(interceptLinkOpenShortcut: boolean): Promise<void>;
    getBibleLinkOpenShortcut(): BibleLinkOpenShortcut;
    setBibleLinkOpenShortcut(linkOpenShortcut: BibleLinkOpenShortcut): Promise<void>;

    openCssColorDialog(input: CssColorDialogInput): void;
    openFloatingPreviewBackgroundColorDialog(): void;
    getBibleReferenceLinkColor(): string;
    getBibleReferenceLinkColorPickerValue(): string;
    isBibleReferenceLinkColorDefault(): boolean;
    setBibleReferenceLinkColor(color: string): Promise<void>;
    resetBibleReferenceLinkColor(): Promise<void>;
    getFloatingPreviewBackgroundColor(): string;
    isFloatingPreviewBackgroundColorDefault(): boolean;
    resetFloatingPreviewBackgroundColor(): Promise<void>;

    openBibleIndexFolder(): Promise<void>;
    showBibleIndexStats(): Promise<void>;
};

export class BiblePluginSettingTab extends PluginSettingTab {
    constructor(app: App, ownerPlugin: Plugin, private readonly plugin: BiblePluginSettingTabInput) { super(app, ownerPlugin); }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: this.plugin.t("settings.title") });

        this.renderGeneralSettings(containerEl);

        this.renderTranslationsSection(containerEl);
        this.renderReferenceUsageIndexSection(containerEl);

        this.renderPreviewSettings(containerEl);

        this.renderColorSettingsSection(containerEl);
        this.renderBibleIndexSettings(containerEl);
    }

    private renderGeneralSettings(containerEl: HTMLElement): void {
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
    }

    private renderTranslationsSection(containerEl: HTMLElement): void {
        renderTranslationSettingsSection(this.createTranslationSettingsSectionInput(containerEl));
    }

    private createTranslationSettingsSectionInput(containerEl: HTMLElement): TranslationSettingsSectionInput {
        return {
            containerEl,
            translations: this.plugin.getTranslationSettingsItems(),
            translate: (key, params) => this.plugin.t(key, params),
            onDelete: (translationId) => this.plugin.deleteImportedTranslation(translationId),
            getCurrentOrder: () => this.plugin.getTranslationSettingsItems().map((item) => item.id),
            onReorder: (nextOrder) => this.plugin.setTranslationOrder(nextOrder),
            refresh: () => this.display(),
        };
    }

    private renderReferenceUsageIndexSection(containerEl: HTMLElement): void {
        renderReferenceUsageIndexSettingsSection(this.createReferenceUsageIndexSettingsSectionInput(containerEl));
    }

    private createReferenceUsageIndexSettingsSectionInput(containerEl: HTMLElement): ReferenceUsageIndexSettingsSectionInput {
        return {
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
        };
    }

    private renderPreviewSettings(containerEl: HTMLElement): void {
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
    }

    private renderColorSettingsSection(containerEl: HTMLElement): void {
        renderColorSettingsSectionView(this.createColorSettingsSectionInput(containerEl));
    }

    private createColorSettingsSectionInput(containerEl: HTMLElement): ColorSettingsSectionInput {
        return {
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
        };
    }

    private renderBibleIndexSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName(this.plugin.t("settings.openIndexFolder.name"))
            .setDesc(this.plugin.t("settings.openIndexFolder.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.openIndexFolder.button")).onClick(() => void this.plugin.openBibleIndexFolder()));

        new Setting(containerEl)
            .setName(this.plugin.t("settings.showStats.name"))
            .setDesc(this.plugin.t("settings.showStats.desc"))
            .addButton((button) => button.setButtonText(this.plugin.t("settings.showStats.button")).onClick(() => void this.plugin.showBibleIndexStats()));
    }
}
