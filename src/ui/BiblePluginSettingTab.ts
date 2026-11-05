import { App, Notice, Platform, Plugin, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { BiblePluginLocale } from "../i18n/I18n";
import type { BibleLibraryService } from "../import/BibleLibraryService";
import type { ReferenceUsageService } from "../reference-usage/ReferenceUsageService";
import type { BibleLinkOpenShortcut, BiblePreviewDisplayMode, BiblePreviewPanelSide, BiblePreviewTriggerMode, PhoneReaderPlacement } from "../settings/PluginSettings";
import type { SettingsService } from "../settings/SettingsService";
import type { TranslationService } from "../translations/TranslationService";
import { createColorSettingDefinitions } from "./ColorSettingsSection";
import { renderBackgroundTaskStatus } from "./BackgroundTaskProgress";
import { createReferenceUsageIndexSettingsGroup, type ReferenceUsageIndexSettingKey } from "./ReferenceUsageIndexSettingsSection";
import { createTranslationSettingsList } from "./TranslationSettingsList";
import { openBookAliasesModal } from "./BookAliasesModal";
import { createImportDescription, renderGettingStarted } from "../onboarding/GettingStarted";
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
    | "phoneReaderPlacement"
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
            this.createTranslationsPage(),
            this.createPreviewSettingsGroup(),
            {
                type: "group",
                heading: this.services.context.t("settings.colors.title"),
                items: createColorSettingDefinitions({
                    translate: (key) => this.services.context.t(key),
                    openCssColorDialog: (input) => this.services.settings.openCssColorDialog(input),
                    openFloatingPreviewBackgroundColorDialog: () => this.services.settings.openFloatingPreviewBackgroundColorDialog(),
                    getBibleReferenceLinkColor: () => this.services.settings.getBibleReferenceLinkColor(),
                    isBibleReferenceLinkColorDefault: () => this.services.settings.isBibleReferenceLinkColorDefault(),
                    setBibleReferenceLinkColor: (color) => this.services.settings.setBibleReferenceLinkColor(color),
                    resetBibleReferenceLinkColor: () => this.services.settings.resetBibleReferenceLinkColor(),
                    getFloatingPreviewBackgroundColor: () => this.services.settings.getFloatingPreviewBackgroundColor(),
                    isFloatingPreviewBackgroundColorDefault: () => this.services.settings.isFloatingPreviewBackgroundColorDefault(),
                    resetFloatingPreviewBackgroundColor: () => this.services.settings.resetFloatingPreviewBackgroundColor(),
                    refresh: () => this.update(),
                }),
            },
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
            phoneReaderPlacement: { get: () => settings.getPhoneReaderPlacement(), set: (value) => settings.setPhoneReaderPlacement(value as PhoneReaderPlacement) },
            closePreviewOnActiveLeafChange: { get: () => settings.shouldClosePreviewOnActiveLeafChange(), set: (value) => settings.setClosePreviewOnActiveLeafChange(value === true) },
            interceptLinkOpenShortcut: { get: () => settings.shouldInterceptLinkOpenShortcut(), set: (value) => settings.setInterceptLinkOpenShortcut(value === true) },
            linkOpenShortcut: { get: () => settings.getBibleLinkOpenShortcut(), set: (value) => settings.setBibleLinkOpenShortcut(value as BibleLinkOpenShortcut) },
        };
    }

    private openBookNames(translationId: string): void {
        const translations = this.services.translations;
        const translationName = translations.getTranslationSettingsItems().find((item) => item.id === translationId)?.name ?? translationId;
        openBookAliasesModal(this.app, {
            translationName,
            translate: (key, params) => this.services.context.t(key, params),
            getBooks: () => translations.getBookAliasesEditorBooks(translationId),
            save: (bookId, aliases) => translations.setCustomBookAliases(translationId, bookId, aliases),
            resetAll: () => translations.resetCustomBookAliases(translationId),
            showError: (message) => new Notice(message),
            // The count of the user's names on the translation's button.
            onClose: () => this.update(),
        });
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
        ];
    }

    // Imported translations, their order, the Bible index and the usage index live on their own page:
    // with many translations the list would push every other setting far down the main screen.
    private createTranslationsPage(): SettingDefinitionItem<SettingControlKey> {
        return {
            type: "page",
            name: this.services.context.t("settings.translationsPage.name"),
            desc: this.getTranslationsPageDescription(),
            // Obsidian 1.13.1+: a mark on the entry while the usage index on the page needs a rebuild.
            status: () => this.services.referenceUsage.isReferenceUsageIndexOutdated() ? "warning" : null,
            items: [
                this.createImportSetting(),
                createTranslationSettingsList({
                    translations: this.services.translations.getTranslationSettingsItems(),
                    translate: (key, params) => this.services.context.t(key, params),
                    versificationOptions: getVersificationOptions((key, params) => this.services.context.t(key, params)),
                    onVersificationChange: (translationId, versification) => this.services.translations.setTranslationVersification(translationId, versification),
                    onCodeChange: (translationId, code) => this.services.translations.setTranslationCode(translationId, code),
                    onNameChange: (translationId, name) => this.services.translations.setTranslationName(translationId, name),
                    showError: (message) => new Notice(message),
                    onEditBookNames: (translationId) => this.openBookNames(translationId),
                    onDelete: (translationId) => this.services.translations.deleteImportedTranslation(translationId),
                    onReorder: (nextOrder) => this.services.translations.setTranslationOrder(nextOrder),
                    refresh: () => this.update(),
                }),
                this.createBibleIndexSettingsGroup(),
                createReferenceUsageIndexSettingsGroup({
                    translate: (key) => this.services.context.t(key),
                    buildIndex: () => this.services.referenceUsage.buildReferenceUsageIndex(),
                    rebuildIndex: () => this.services.referenceUsage.rebuildReferenceUsageIndex(),
                    showStats: () => this.services.referenceUsage.showReferenceUsageIndexStats(),
                    clearIndex: () => this.services.referenceUsage.clearReferenceUsageIndex(),
                    isIndexOutdated: () => this.services.referenceUsage.isReferenceUsageIndexOutdated(),
                    getBuildProgress: () => this.services.referenceUsage.getReferenceUsageBuildProgress(),
                }),
            ],
        };
    }

    // "3 translations · main: X", or what to do when there are none yet.
    private getTranslationsPageDescription(): string {
        const t = this.services.context.t.bind(this.services.context);
        const translations = this.services.translations.getTranslationSettingsItems();
        if (translations.length === 0) {
            return t("settings.translationsPage.empty");
        }
        const count = t(getPluralKey(this.services.context.settings.interfaceLanguage, translations.length), { count: translations.length });
        const main = translations.find((translation) => translation.isActive);
        return main === undefined ? count : `${count} · ${t("settings.translationsPage.main", { name: main.name || main.id })}`;
    }

    private createImportSetting(): SettingDefinitionItem<SettingControlKey> {
        return {
            name: this.services.context.t("settings.import.name"),
            desc: createImportDescription(this.services.context.settings.interfaceLanguage, (key, params) => this.services.context.t(key, params)),
            render: (setting) => {
                // A new user sees where to get a Bible file and what to do after the import.
                if (!this.services.context.hasImportedTranslations()) {
                    renderGettingStarted(setting.descEl, this.services.context.settings.interfaceLanguage, (key, params) => this.services.context.t(key, params));
                }
                setting.addButton((button) => button
                    .setButtonText(this.services.context.t("settings.import.button"))
                    .setCta()
                    .onClick(() => this.services.library.openBibleFilePicker(setting.settingEl)));
                const importProgress = this.services.library.getImportProgress();
                if (importProgress !== null) {
                    renderBackgroundTaskStatus(setting.descEl, importProgress);
                }
            },
        };
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
                // On a phone only: Obsidian shows one tab at a time there.
                ...(Platform.isPhone ? [{
                    name: this.services.context.t("settings.phoneReaderPlacement.name"),
                    desc: this.services.context.t("settings.phoneReaderPlacement.desc"),
                    control: {
                        type: "dropdown" as const,
                        key: "phoneReaderPlacement" as const,
                        options: {
                            tab: this.services.context.t("settings.phoneReaderPlacement.tab"),
                            below: this.services.context.t("settings.phoneReaderPlacement.below"),
                        },
                    },
                }] : []),
                {
                    name: this.services.context.t("settings.closePreviewOnTabChange.name"),
                    desc: this.services.context.t("settings.closePreviewOnTabChange.desc"),
                    control: { type: "toggle", key: "closePreviewOnActiveLeafChange" },
                },
                {
                    name: this.services.context.t("settings.hotkey.name"),
                    desc: this.services.context.t("settings.hotkey.desc", { command: this.services.context.t("command.openBibleReferenceUnderCursor") }),
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

type TranslationCountKey = "settings.translationsPage.count.one" | "settings.translationsPage.count.few" | "settings.translationsPage.count.many";

// Russian has three forms: 1 перевод, 2 перевода, 5 переводов.
function getPluralKey(locale: BiblePluginLocale, count: number): TranslationCountKey {
    const category = new Intl.PluralRules(locale).select(count);
    if (category === "one") return "settings.translationsPage.count.one";
    if (category === "few") return "settings.translationsPage.count.few";
    return "settings.translationsPage.count.many";
}
