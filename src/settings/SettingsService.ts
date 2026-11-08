import { Notice } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { BiblePluginLocale } from "../i18n/I18n";
import {
    DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
    DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
    normalizeBibleReferenceLinkColor,
    normalizeFloatingPreviewBackgroundColor,
} from "./cssColorValidation";
import { isBibleInsertFormat, type BibleInsertFormat } from "../insertion/BibleTextMarkdown";
import { normalizeReferenceSuggestTrigger, type BibleLinkOpenShortcut, type BiblePluginSettings, type BiblePreviewDisplayMode, type BiblePreviewPanelSide, type BiblePreviewTriggerMode, type PhoneReaderPlacement } from "./PluginSettings";

const DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR = "#e6e2d8";

type BooleanSettingKey = "closePreviewOnActiveLeafChange" | "autoOpenPreviewOnVerseChange" | "previewComparisonEnabled" | "interceptLinkOpenShortcut" | "insertVerseNumbers" | "insertFootnotes";

export class SettingsService {
    // Services react to changes through PluginContext.onSettingsChanged.
    constructor(private readonly context: PluginContext) {}

    private get settings(): BiblePluginSettings {
        return this.context.settings;
    }

    isPluginActive(): boolean {
        return this.settings.isPluginActive;
    }

    async togglePluginActive(): Promise<void> {
        await this.setPluginActive(!this.settings.isPluginActive);
    }

    async setPluginActive(isPluginActive: boolean): Promise<void> {
        if (this.settings.isPluginActive === isPluginActive) {
            return;
        }

        await this.save({ isPluginActive });
        this.context.refreshSettingsTab();
        new Notice(this.context.t(isPluginActive ? "notice.pluginActivated" : "notice.pluginDeactivated"), 2500);
    }

    getPluginActiveRibbonTitle(): string {
        return this.context.t(this.settings.isPluginActive ? "ribbon.deactivatePlugin" : "ribbon.activatePlugin");
    }

    getInterfaceLanguage(): BiblePluginLocale {
        return this.settings.interfaceLanguage;
    }

    async setInterfaceLanguage(interfaceLanguage: BiblePluginLocale): Promise<void> {
        if (this.settings.interfaceLanguage === interfaceLanguage) {
            return;
        }

        await this.save({ interfaceLanguage });
        this.context.refreshSettingsTab();
        new Notice(this.context.t("notice.restartPluginForCommandNames"), 6000);
    }

    getBibleReferenceLinkColor(): string {
        return normalizeBibleReferenceLinkColor(this.settings.bibleReferenceLinkColor);
    }

    isBibleReferenceLinkColorDefault(): boolean {
        return this.settings.bibleReferenceLinkColor === DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
    }

    async setBibleReferenceLinkColor(color: string): Promise<void> {
        const bibleReferenceLinkColor = normalizeBibleReferenceLinkColor(color);
        if (this.settings.bibleReferenceLinkColor === bibleReferenceLinkColor) {
            return;
        }

        await this.save({ bibleReferenceLinkColor });
        this.context.refreshSettingsTab();
    }

    async resetBibleReferenceLinkColor(): Promise<void> {
        await this.setBibleReferenceLinkColor(DEFAULT_BIBLE_REFERENCE_LINK_COLOR);
    }

    getFloatingPreviewBackgroundColor(): string {
        return normalizeFloatingPreviewBackgroundColor(this.settings.floatingPreviewBackgroundColor);
    }

    getFloatingPreviewBackgroundColorPickerValue(): string {
        return getPickerValue(this.settings.floatingPreviewBackgroundColor, DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR);
    }

    isFloatingPreviewBackgroundColorDefault(): boolean {
        return this.settings.floatingPreviewBackgroundColor === DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
    }

    async setFloatingPreviewBackgroundColor(color: string): Promise<void> {
        const floatingPreviewBackgroundColor = normalizeFloatingPreviewBackgroundColor(color);
        if (this.settings.floatingPreviewBackgroundColor === floatingPreviewBackgroundColor) {
            return;
        }

        await this.save({ floatingPreviewBackgroundColor });
        this.context.refreshSettingsTab();
    }

    async resetFloatingPreviewBackgroundColor(): Promise<void> {
        await this.setFloatingPreviewBackgroundColor(DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR);
    }

    getBiblePreviewTriggerMode(): BiblePreviewTriggerMode {
        return this.settings.previewTriggerMode;
    }

    async setBiblePreviewTriggerMode(previewTriggerMode: BiblePreviewTriggerMode): Promise<void> {
        if (this.settings.previewTriggerMode === previewTriggerMode) {
            return;
        }

        await this.save({ previewTriggerMode });
        this.context.refreshSettingsTab();
    }

    getBiblePreviewDisplayMode(): BiblePreviewDisplayMode {
        return this.settings.previewDisplayMode;
    }

    async setBiblePreviewDisplayMode(previewDisplayMode: BiblePreviewDisplayMode): Promise<void> {
        if (this.settings.previewDisplayMode === previewDisplayMode) {
            return;
        }

        await this.save({ previewDisplayMode });
        this.context.refreshSettingsTab();
    }

    getBiblePreviewPanelSide(): BiblePreviewPanelSide {
        return this.settings.previewPanelSide;
    }

    async setBiblePreviewPanelSide(previewPanelSide: BiblePreviewPanelSide): Promise<void> {
        if (this.settings.previewPanelSide === previewPanelSide) {
            return;
        }

        await this.save({ previewPanelSide });
        this.context.refreshSettingsTab();
    }

    shouldClosePreviewOnActiveLeafChange(): boolean {
        return this.settings.closePreviewOnActiveLeafChange;
    }

    async setClosePreviewOnActiveLeafChange(closePreviewOnActiveLeafChange: boolean): Promise<void> {
        await this.setBooleanSetting("closePreviewOnActiveLeafChange", closePreviewOnActiveLeafChange);
    }

    shouldAutoOpenPreviewOnVerseChange(): boolean {
        return this.settings.autoOpenPreviewOnVerseChange;
    }

    async setAutoOpenPreviewOnVerseChange(autoOpenPreviewOnVerseChange: boolean): Promise<void> {
        await this.setBooleanSetting("autoOpenPreviewOnVerseChange", autoOpenPreviewOnVerseChange);
    }

    isPreviewComparisonEnabled(): boolean {
        return this.settings.previewComparisonEnabled;
    }

    async setPreviewComparisonEnabled(previewComparisonEnabled: boolean): Promise<void> {
        await this.setBooleanSetting("previewComparisonEnabled", previewComparisonEnabled);
    }

    shouldInterceptLinkOpenShortcut(): boolean {
        return this.settings.interceptLinkOpenShortcut;
    }

    async setInterceptLinkOpenShortcut(interceptLinkOpenShortcut: boolean): Promise<void> {
        await this.setBooleanSetting("interceptLinkOpenShortcut", interceptLinkOpenShortcut);
    }

    getBibleLinkOpenShortcut(): BibleLinkOpenShortcut {
        return this.settings.linkOpenShortcut;
    }

    async setBibleLinkOpenShortcut(linkOpenShortcut: BibleLinkOpenShortcut): Promise<void> {
        if (this.settings.linkOpenShortcut === linkOpenShortcut) {
            return;
        }

        await this.save({ linkOpenShortcut });
        this.context.refreshSettingsTab();
    }

    getPhoneReaderPlacement(): PhoneReaderPlacement {
        return this.settings.phoneReaderPlacement;
    }

    async setPhoneReaderPlacement(phoneReaderPlacement: PhoneReaderPlacement): Promise<void> {
        if (this.settings.phoneReaderPlacement === phoneReaderPlacement) {
            return;
        }

        await this.save({ phoneReaderPlacement });
        this.context.refreshSettingsTab();
    }

    getInsertFormat(): BibleInsertFormat {
        return this.settings.insertFormat;
    }

    async setInsertFormat(value: unknown): Promise<void> {
        if (!isBibleInsertFormat(value) || value === this.settings.insertFormat) return;
        await this.save({ insertFormat: value });
        this.context.refreshSettingsTab();
    }

    shouldInsertVerseNumbers(): boolean {
        return this.settings.insertVerseNumbers;
    }

    async setInsertVerseNumbers(value: boolean): Promise<void> {
        await this.setBooleanSetting("insertVerseNumbers", value);
    }

    shouldInsertFootnotes(): boolean {
        return this.settings.insertFootnotes;
    }

    async setInsertFootnotes(value: boolean): Promise<void> {
        await this.setBooleanSetting("insertFootnotes", value);
    }

    getReferenceSuggestTrigger(): string {
        return this.settings.referenceSuggestTrigger;
    }

    /** An invalid trigger (letters, spaces, too long) is not saved; the field keeps what was typed. */
    async setReferenceSuggestTrigger(value: string): Promise<void> {
        const trigger = value.trim();
        if (normalizeReferenceSuggestTrigger(trigger) !== trigger || trigger === this.settings.referenceSuggestTrigger) return;
        await this.save({ referenceSuggestTrigger: trigger });
    }

    private async setBooleanSetting(key: BooleanSettingKey, value: boolean): Promise<void> {
        if (this.settings[key] === value) {
            return;
        }

        await this.save({ [key]: value });
        this.context.refreshSettingsTab();
    }

    private async save(patch: Partial<BiblePluginSettings>): Promise<void> {
        this.context.updateSettings(patch);
        await this.context.saveSettings();
        await this.context.notifySettingsChanged(new Set(Object.keys(patch) as Array<keyof BiblePluginSettings>));
    }
}

function getPickerValue(color: string, fallback: string): string {
    return /^#[0-9a-f]{6}$/i.test(color.trim()) ? color : fallback;
}
