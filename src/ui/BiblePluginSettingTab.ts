import { App, Plugin, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type { BiblePluginLocale, I18nKey } from "../i18n/I18n";
import type { BibleLinkOpenShortcut, BiblePreviewDisplayMode, BiblePreviewPanelSide, BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { TranslationSettingsItem } from "../translations/TranslationModels";
import type { CssColorDialogInput } from "./CssColorDialog";
import { createColorSettingDefinitions } from "./ColorSettingsSection";
import { createReferenceUsageIndexSettingsGroup, type ReferenceUsageIndexSettingKey } from "./ReferenceUsageIndexSettingsSection";
import { createTranslationSettingsList } from "./TranslationSettingsList";

export type BiblePluginSettingTabInput = {
    t: (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;

    isPluginActive: () => boolean;
    setPluginActive: (isPluginActive: boolean) => Promise<void>;
    getInterfaceLanguage: () => BiblePluginLocale;
    setInterfaceLanguage: (interfaceLanguage: BiblePluginLocale) => Promise<void>;
    openEpubFilePicker: (hostEl?: HTMLElement) => void;

    getTranslationSettingsItems: () => TranslationSettingsItem[];
    deleteImportedTranslation: (translationId: string) => Promise<void>;
    setTranslationOrder: (nextOrder: string[]) => Promise<void>;

    isReferenceUsageIndexingEnabled: () => boolean;
    setReferenceUsageIndexingEnabled: (referenceUsageIndexingEnabled: boolean) => Promise<void>;
    shouldAutoUpdateReferenceUsageIndex: () => boolean;
    setReferenceUsageAutoUpdate: (referenceUsageAutoUpdate: boolean) => Promise<void>;
    getReferenceUsageExcludedFoldersText: () => string;
    setReferenceUsageExcludedFoldersText: (value: string) => Promise<void>;
    buildReferenceUsageIndex: () => Promise<void>;
    rebuildReferenceUsageIndex: () => Promise<void>;
    showReferenceUsageIndexStats: () => Promise<void>;
    clearReferenceUsageIndex: () => Promise<void>;

    getBiblePreviewTriggerMode: () => BiblePreviewTriggerMode;
    setBiblePreviewTriggerMode: (previewTriggerMode: BiblePreviewTriggerMode) => Promise<void>;
    getBiblePreviewDisplayMode: () => BiblePreviewDisplayMode;
    setBiblePreviewDisplayMode: (previewDisplayMode: BiblePreviewDisplayMode) => Promise<void>;
    shouldAutoOpenPreviewOnVerseChange: () => boolean;
    setAutoOpenPreviewOnVerseChange: (autoOpenPreviewOnVerseChange: boolean) => Promise<void>;
    getBiblePreviewPanelSide: () => BiblePreviewPanelSide;
    setBiblePreviewPanelSide: (previewPanelSide: BiblePreviewPanelSide) => Promise<void>;
    shouldClosePreviewOnActiveLeafChange: () => boolean;
    setClosePreviewOnActiveLeafChange: (closePreviewOnActiveLeafChange: boolean) => Promise<void>;
    shouldInterceptLinkOpenShortcut: () => boolean;
    setInterceptLinkOpenShortcut: (interceptLinkOpenShortcut: boolean) => Promise<void>;
    getBibleLinkOpenShortcut: () => BibleLinkOpenShortcut;
    setBibleLinkOpenShortcut: (linkOpenShortcut: BibleLinkOpenShortcut) => Promise<void>;

    openCssColorDialog: (input: CssColorDialogInput) => void;
    openFloatingPreviewBackgroundColorDialog: () => void;
    getBibleReferenceLinkColor: () => string;
    getBibleReferenceLinkColorPickerValue: () => string;
    isBibleReferenceLinkColorDefault: () => boolean;
    setBibleReferenceLinkColor: (color: string) => Promise<void>;
    resetBibleReferenceLinkColor: () => Promise<void>;
    getFloatingPreviewBackgroundColor: () => string;
    isFloatingPreviewBackgroundColorDefault: () => boolean;
    resetFloatingPreviewBackgroundColor: () => Promise<void>;

    openBibleIndexFolder: () => Promise<void>;
    showBibleIndexStats: () => Promise<void>;
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

    constructor(app: App, ownerPlugin: Plugin, private readonly plugin: BiblePluginSettingTabInput) {
        super(app, ownerPlugin);
        this.controlAccessors = this.createControlAccessors();
    }

    getSettingDefinitions(): SettingDefinitionItem<SettingControlKey>[] {
        return [
            ...this.createGeneralSettings(),
            createTranslationSettingsList({
                translations: this.plugin.getTranslationSettingsItems(),
                translate: (key, params) => this.plugin.t(key, params),
                onDelete: (translationId) => this.plugin.deleteImportedTranslation(translationId),
                onReorder: (nextOrder) => this.plugin.setTranslationOrder(nextOrder),
                onImport: (hostEl) => this.plugin.openEpubFilePicker(hostEl),
                refresh: () => this.update(),
            }),
            createReferenceUsageIndexSettingsGroup({
                translate: (key) => this.plugin.t(key),
                buildIndex: () => this.plugin.buildReferenceUsageIndex(),
                rebuildIndex: () => this.plugin.rebuildReferenceUsageIndex(),
                showStats: () => this.plugin.showReferenceUsageIndexStats(),
                clearIndex: () => this.plugin.clearReferenceUsageIndex(),
            }),
            this.createPreviewSettingsGroup(),
            {
                type: "group",
                heading: this.plugin.t("settings.colors.title"),
                items: createColorSettingDefinitions({
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
        const { plugin } = this;
        return {
            isPluginActive: { get: () => plugin.isPluginActive(), set: (value) => plugin.setPluginActive(value === true) },
            interfaceLanguage: { get: () => plugin.getInterfaceLanguage(), set: (value) => plugin.setInterfaceLanguage(value as BiblePluginLocale) },
            referenceUsageIndexingEnabled: { get: () => plugin.isReferenceUsageIndexingEnabled(), set: (value) => plugin.setReferenceUsageIndexingEnabled(value === true) },
            referenceUsageAutoUpdate: { get: () => plugin.shouldAutoUpdateReferenceUsageIndex(), set: (value) => plugin.setReferenceUsageAutoUpdate(value === true) },
            referenceUsageExcludedFolders: { get: () => plugin.getReferenceUsageExcludedFoldersText(), set: (value) => plugin.setReferenceUsageExcludedFoldersText(String(value)) },
            previewTriggerMode: { get: () => plugin.getBiblePreviewTriggerMode(), set: (value) => plugin.setBiblePreviewTriggerMode(value as BiblePreviewTriggerMode) },
            previewDisplayMode: { get: () => plugin.getBiblePreviewDisplayMode(), set: (value) => plugin.setBiblePreviewDisplayMode(value as BiblePreviewDisplayMode) },
            autoOpenPreviewOnVerseChange: { get: () => plugin.shouldAutoOpenPreviewOnVerseChange(), set: (value) => plugin.setAutoOpenPreviewOnVerseChange(value === true) },
            previewPanelSide: { get: () => plugin.getBiblePreviewPanelSide(), set: (value) => plugin.setBiblePreviewPanelSide(value as BiblePreviewPanelSide) },
            closePreviewOnActiveLeafChange: { get: () => plugin.shouldClosePreviewOnActiveLeafChange(), set: (value) => plugin.setClosePreviewOnActiveLeafChange(value === true) },
            interceptLinkOpenShortcut: { get: () => plugin.shouldInterceptLinkOpenShortcut(), set: (value) => plugin.setInterceptLinkOpenShortcut(value === true) },
            linkOpenShortcut: { get: () => plugin.getBibleLinkOpenShortcut(), set: (value) => plugin.setBibleLinkOpenShortcut(value as BibleLinkOpenShortcut) },
        };
    }

    private createGeneralSettings(): SettingDefinitionItem<SettingControlKey>[] {
        return [
            {
                name: this.plugin.t("settings.pluginActive.name"),
                desc: this.plugin.t("settings.pluginActive.desc"),
                control: { type: "toggle", key: "isPluginActive" },
            },
            {
                name: this.plugin.t("settings.interfaceLanguage.name"),
                desc: this.plugin.t("settings.interfaceLanguage.desc"),
                control: {
                    type: "dropdown",
                    key: "interfaceLanguage",
                    options: {
                        ru: this.plugin.t("settings.interfaceLanguage.ru"),
                        en: this.plugin.t("settings.interfaceLanguage.en"),
                    },
                },
            },
            {
                name: this.plugin.t("settings.import.name"),
                desc: this.plugin.t("settings.import.desc"),
                render: (setting) => {
                    setting.addButton((button) => button
                        .setButtonText(this.plugin.t("settings.import.button"))
                        .setCta()
                        .onClick(() => this.plugin.openEpubFilePicker(setting.settingEl)));
                },
            },
        ];
    }

    private createPreviewSettingsGroup(): SettingDefinitionItem<SettingControlKey> {
        return {
            type: "group",
            heading: this.plugin.t("settings.preview.title"),
            items: [
                {
                    name: this.plugin.t("settings.previewMode.name"),
                    desc: this.plugin.t("settings.previewMode.desc"),
                    control: {
                        type: "dropdown",
                        key: "previewTriggerMode",
                        options: {
                            "current-paragraph": this.plugin.t("settings.previewMode.currentParagraph"),
                            "clicked-reference": this.plugin.t("settings.previewMode.clickedReference"),
                        },
                    },
                },
                {
                    name: this.plugin.t("settings.previewDisplayMode.name"),
                    desc: this.plugin.t("settings.previewDisplayMode.desc"),
                    control: {
                        type: "dropdown",
                        key: "previewDisplayMode",
                        options: {
                            floating: this.plugin.t("settings.previewDisplayMode.floating"),
                            "side-panel": this.plugin.t("settings.previewDisplayMode.sidePanel"),
                        },
                    },
                },
                {
                    name: this.plugin.t("settings.autoOpenPreviewOnVerseChange.name"),
                    desc: this.plugin.t("settings.autoOpenPreviewOnVerseChange.desc"),
                    control: { type: "toggle", key: "autoOpenPreviewOnVerseChange" },
                },
                {
                    name: this.plugin.t("settings.previewPanelSide.name"),
                    desc: this.plugin.t("settings.previewPanelSide.desc"),
                    control: {
                        type: "dropdown",
                        key: "previewPanelSide",
                        options: {
                            right: this.plugin.t("settings.previewPanelSide.right"),
                            left: this.plugin.t("settings.previewPanelSide.left"),
                        },
                    },
                },
                {
                    name: this.plugin.t("settings.closePreviewOnTabChange.name"),
                    desc: this.plugin.t("settings.closePreviewOnTabChange.desc"),
                    control: { type: "toggle", key: "closePreviewOnActiveLeafChange" },
                },
                {
                    name: this.plugin.t("settings.hotkey.name"),
                    desc: this.plugin.t("settings.hotkey.desc"),
                    control: { type: "toggle", key: "interceptLinkOpenShortcut" },
                },
                {
                    name: this.plugin.t("settings.hotkey.shortcut.name"),
                    desc: this.plugin.t("settings.hotkey.shortcut.desc"),
                    control: {
                        type: "dropdown",
                        key: "linkOpenShortcut",
                        options: {
                            "alt-enter": "Alt+Enter",
                            "ctrl-enter": "Ctrl+Enter",
                            "ctrl-alt-enter": "Ctrl+Alt+Enter",
                        },
                        disabled: () => !this.plugin.shouldInterceptLinkOpenShortcut(),
                    },
                },
            ],
        };
    }

    private createBibleIndexSettingsGroup(): SettingDefinitionItem<SettingControlKey> {
        return {
            type: "group",
            heading: this.plugin.t("settings.bibleIndex.title"),
            items: [
                {
                    name: this.plugin.t("settings.openIndexFolder.name"),
                    desc: this.plugin.t("settings.openIndexFolder.desc"),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(this.plugin.t("settings.openIndexFolder.button"))
                            .onClick(() => void this.plugin.openBibleIndexFolder()));
                    },
                },
                {
                    name: this.plugin.t("settings.showStats.name"),
                    desc: this.plugin.t("settings.showStats.desc"),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(this.plugin.t("settings.showStats.button"))
                            .onClick(() => void this.plugin.showBibleIndexStats()));
                    },
                },
            ],
        };
    }
}
