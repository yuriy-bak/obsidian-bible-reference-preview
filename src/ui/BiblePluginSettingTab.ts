import { App, Notice, Plugin, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { BiblePluginLocale } from "../i18n/I18n";
import type { BibleLibraryService } from "../import/BibleLibraryService";
import type { ReferenceUsageService } from "../reference-usage/ReferenceUsageService";
import type { BibleLinkOpenShortcut, BiblePreviewDisplayMode, BiblePreviewPanelSide, BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { SettingsService } from "../settings/SettingsService";
import type { TranslationService } from "../translations/TranslationService";
import { createColorSettingDefinitions } from "./ColorSettingsSection";
import { createReferenceUsageIndexSettingsGroup, type ReferenceUsageIndexSettingKey } from "./ReferenceUsageIndexSettingsSection";
import { createTranslationSettingsList } from "./TranslationSettingsList";
import { getVersificationOptions } from "./VersificationLabels";

export type BiblePluginSettingTabServices = {
    context: PluginContext;
    settings: SettingsService;
    translations: TranslationService;
    library: BibleLibraryService;
    referenceUsage: ReferenceUsageService;
};

type SettingControlKey =
    | ReferenceUsageIndexSettingKey
    | "isPluginActive"
    | "interfaceLanguage"
    | "previewTriggerMode"
    | "previewDisplayMode"
    | "autoOpenPreviewOnVerseChange"
    | "previewPanelSide"
    | "closePreviewOnActiveLeafChange"
    | "interceptLinkOpenShortcut"
    | "linkOpenShortcut";

type SettingControlAccessor = {
    get: () => unknown;
    set: (value: unknown) => Promise<void>;
};

export class BiblePluginSettingTab extends PluginSettingTab {
    private readonly controlAccessors: Record<SettingControlKey, SettingControlAccessor>;

    constructor(app: App, ownerPlugin: Plugin, private readonly services: BiblePluginSettingTabServices) {
        super(app, ownerPlugin);
        this.controlAccessors = this.createControlAccessors();
    }

    getSettingDefinitions(): SettingDefinitionItem<SettingControlKey>[] {
        return [
            ...this.createGeneralSettings(),
            createTranslationSettingsList({
                translations: this.services.translations.getTranslationSettingsItems(),
                translate: (key, params) => this.services.context.t(key, params),
                versificationOptions: getVersificationOptions((key, params) => this.services.context.t(key, params)),
                onVersificationChange: (translationId, versification) => this.services.translations.setTranslationVersification(translationId, versification),
                onCodeChange: (translationId, code) => this.services.translations.setTranslationCode(translationId, code),
                showError: (message) => new Notice(message),
                onDelete: (translationId) => this.services.translations.deleteImportedTranslation(translationId),
                onReorder: (nextOrder) => this.services.translations.setTranslationOrder(nextOrder),
                refresh: () => this.update(),
            }),
            createReferenceUsageIndexSettingsGroup({
                translate: (key) => this.services.context.t(key),
                buildIndex: () => this.services.referenceUsage.buildReferenceUsageIndex(),
                rebuildIndex: () => this.services.referenceUsage.rebuildReferenceUsageIndex(),
                showStats: () => this.services.referenceUsage.showReferenceUsageIndexStats(),
                clearIndex: () => this.services.referenceUsage.clearReferenceUsageIndex(),
                isIndexOutdated: () => this.services.referenceUsage.isReferenceUsageIndexOutdated(),
            }),
            this.createPreviewSettingsGroup(),
            {
                type: "group",
                heading: this.services.context.t("settings.colors.title"),
                items: createColorSettingDefinitions({
                    translate: (key) => this.services.context.t(key),
                    openCssColorDialog: (input) => this.services.settings.openCssColorDialog(input),
                    openFloatingPreviewBackgroundColorDialog: () => this.services.settings.openFloatingPreviewBackgroundColorDialog(),
                    getBibleReferenceLinkColor: () => this.services.settings.getBibleReferenceLinkColor(),
                    getBibleReferenceLinkColorPickerValue: () => this.services.settings.getBibleReferenceLinkColorPickerValue(),
                    isBibleReferenceLinkColorDefault: () => this.services.settings.isBibleReferenceLinkColorDefault(),
                    setBibleReferenceLinkColor: (color) => this.services.settings.setBibleReferenceLinkColor(color),
                    resetBibleReferenceLinkColor: () => this.services.settings.resetBibleReferenceLinkColor(),
                    getFloatingPreviewBackgroundColor: () => this.services.settings.getFloatingPreviewBackgroundColor(),
                    isFloatingPreviewBackgroundColorDefault: () => this.services.settings.isFloatingPreviewBackgroundColorDefault(),
                    resetFloatingPreviewBackgroundColor: () => this.services.settings.resetFloatingPreviewBackgroundColor(),
                    refresh: () => this.update(),
                }),
            },
            this.createBibleIndexSettingsGroup(),
        ];
    }

    getControlValue(key: string): unknown {
        return this.getControlAccessor(key)?.get();
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const accessor = this.getControlAccessor(key);
        if (accessor === undefined) {
            return;
        }
        await accessor.set(value);
        // Re-evaluate `disabled` predicates that depend on the changed value.
        this.refreshDomState();
    }

    private getControlAccessor(key: string): SettingControlAccessor | undefined {
        return Object.prototype.hasOwnProperty.call(this.controlAccessors, key)
            ? this.controlAccessors[key as SettingControlKey]
            : undefined;
    }

    private createControlAccessors(): Record<SettingControlKey, SettingControlAccessor> {
        const { settings, referenceUsage } = this.services;
        return {
            isPluginActive: { get: () => settings.isPluginActive(), set: (value) => settings.setPluginActive(value === true) },
            interfaceLanguage: { get: () => settings.getInterfaceLanguage(), set: (value) => settings.setInterfaceLanguage(value as BiblePluginLocale) },
            referenceUsageIndexingEnabled: { get: () => referenceUsage.isReferenceUsageIndexingEnabled(), set: (value) => referenceUsage.setReferenceUsageIndexingEnabled(value === true) },
            referenceUsageAutoUpdate: { get: () => referenceUsage.shouldAutoUpdateReferenceUsageIndex(), set: (value) => referenceUsage.setReferenceUsageAutoUpdate(value === true) },
            referenceUsageExcludedFolders: { get: () => referenceUsage.getReferenceUsageExcludedFoldersText(), set: (value) => referenceUsage.setReferenceUsageExcludedFoldersText(String(value)) },
            previewTriggerMode: { get: () => settings.getBiblePreviewTriggerMode(), set: (value) => settings.setBiblePreviewTriggerMode(value as BiblePreviewTriggerMode) },
            previewDisplayMode: { get: () => settings.getBiblePreviewDisplayMode(), set: (value) => settings.setBiblePreviewDisplayMode(value as BiblePreviewDisplayMode) },
            autoOpenPreviewOnVerseChange: { get: () => settings.shouldAutoOpenPreviewOnVerseChange(), set: (value) => settings.setAutoOpenPreviewOnVerseChange(value === true) },
            previewPanelSide: { get: () => settings.getBiblePreviewPanelSide(), set: (value) => settings.setBiblePreviewPanelSide(value as BiblePreviewPanelSide) },
            closePreviewOnActiveLeafChange: { get: () => settings.shouldClosePreviewOnActiveLeafChange(), set: (value) => settings.setClosePreviewOnActiveLeafChange(value === true) },
            interceptLinkOpenShortcut: { get: () => settings.shouldInterceptLinkOpenShortcut(), set: (value) => settings.setInterceptLinkOpenShortcut(value === true) },
            linkOpenShortcut: { get: () => settings.getBibleLinkOpenShortcut(), set: (value) => settings.setBibleLinkOpenShortcut(value as BibleLinkOpenShortcut) },
        };
    }

    private createGeneralSettings(): SettingDefinitionItem<SettingControlKey>[] {
        return [
            {
                name: this.services.context.t("settings.pluginActive.name"),
                desc: this.services.context.t("settings.pluginActive.desc"),
                control: { type: "toggle", key: "isPluginActive" },
            },
            {
                name: this.services.context.t("settings.interfaceLanguage.name"),
                desc: this.services.context.t("settings.interfaceLanguage.desc"),
                control: {
                    type: "dropdown",
                    key: "interfaceLanguage",
                    options: {
                        ru: this.services.context.t("settings.interfaceLanguage.ru"),
                        en: this.services.context.t("settings.interfaceLanguage.en"),
                    },
                },
            },
            {
                name: this.services.context.t("settings.import.name"),
                desc: this.services.context.t("settings.import.desc"),
                render: (setting) => {
                    setting.addButton((button) => button
                        .setButtonText(this.services.context.t("settings.import.button"))
                        .setCta()
                        .onClick(() => this.services.library.openBibleFilePicker(setting.settingEl)));
                },
            },
        ];
    }

    private createPreviewSettingsGroup(): SettingDefinitionItem<SettingControlKey> {
        return {
            type: "group",
            heading: this.services.context.t("settings.preview.title"),
            items: [
                {
                    name: this.services.context.t("settings.previewMode.name"),
                    desc: this.services.context.t("settings.previewMode.desc"),
                    control: {
                        type: "dropdown",
                        key: "previewTriggerMode",
                        options: {
                            "current-paragraph": this.services.context.t("settings.previewMode.currentParagraph"),
                            "clicked-reference": this.services.context.t("settings.previewMode.clickedReference"),
                        },
                    },
                },
                {
                    name: this.services.context.t("settings.previewDisplayMode.name"),
                    desc: this.services.context.t("settings.previewDisplayMode.desc"),
                    control: {
                        type: "dropdown",
                        key: "previewDisplayMode",
                        options: {
                            floating: this.services.context.t("settings.previewDisplayMode.floating"),
                            "side-panel": this.services.context.t("settings.previewDisplayMode.sidePanel"),
                        },
                    },
                },
                {
                    name: this.services.context.t("settings.autoOpenPreviewOnVerseChange.name"),
                    desc: this.services.context.t("settings.autoOpenPreviewOnVerseChange.desc"),
                    control: { type: "toggle", key: "autoOpenPreviewOnVerseChange" },
                },
                {
                    name: this.services.context.t("settings.previewPanelSide.name"),
                    desc: this.services.context.t("settings.previewPanelSide.desc"),
                    control: {
                        type: "dropdown",
                        key: "previewPanelSide",
                        options: {
                            right: this.services.context.t("settings.previewPanelSide.right"),
                            left: this.services.context.t("settings.previewPanelSide.left"),
                        },
                    },
                },
                {
                    name: this.services.context.t("settings.closePreviewOnTabChange.name"),
                    desc: this.services.context.t("settings.closePreviewOnTabChange.desc"),
                    control: { type: "toggle", key: "closePreviewOnActiveLeafChange" },
                },
                {
                    name: this.services.context.t("settings.hotkey.name"),
                    desc: this.services.context.t("settings.hotkey.desc"),
                    control: { type: "toggle", key: "interceptLinkOpenShortcut" },
                },
                {
                    name: this.services.context.t("settings.hotkey.shortcut.name"),
                    desc: this.services.context.t("settings.hotkey.shortcut.desc"),
                    control: {
                        type: "dropdown",
                        key: "linkOpenShortcut",
                        options: {
                            "alt-enter": "Alt+Enter",
                            "ctrl-enter": "Ctrl+Enter",
                            "ctrl-alt-enter": "Ctrl+Alt+Enter",
                        },
                        disabled: () => !this.services.settings.shouldInterceptLinkOpenShortcut(),
                    },
                },
            ],
        };
    }

    private createBibleIndexSettingsGroup(): SettingDefinitionItem<SettingControlKey> {
        return {
            type: "group",
            heading: this.services.context.t("settings.bibleIndex.title"),
            items: [
                {
                    name: this.services.context.t("settings.openIndexFolder.name"),
                    desc: this.services.context.t("settings.openIndexFolder.desc"),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(this.services.context.t("settings.openIndexFolder.button"))
                            .onClick(() => void this.services.library.openBibleIndexFolder()));
                    },
                },
                {
                    name: this.services.context.t("settings.showStats.name"),
                    desc: this.services.context.t("settings.showStats.desc"),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(this.services.context.t("settings.showStats.button"))
                            .onClick(() => void this.services.library.showBibleIndexStats()));
                    },
                },
            ],
        };
    }
}
