import { Notice } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { BiblePluginLocale } from "../i18n/I18n";
import { CssColorDialog, createBackgroundColorPresets, type CssColorDialogInput } from "../ui/CssColorDialog";
import {
    DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
    DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
    normalizeBibleReferenceLinkColor,
    normalizeFloatingPreviewBackgroundColor,
} from "../ui/cssColorValidation";
import type { BibleLinkOpenShortcut, BiblePluginSettings, BiblePreviewDisplayMode, BiblePreviewPanelSide, BiblePreviewTriggerMode } from "./PluginSettings";

const DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR = "#e6e2d8";

type BooleanSettingKey = "closePreviewOnActiveLeafChange" | "autoOpenPreviewOnVerseChange" | "previewComparisonEnabled" | "interceptLinkOpenShortcut";

/** Reactions of the editor and the preview to settings changes. */
export type SettingsServiceEffects = {
    refreshBibleReferenceLinks: () => void;
    clearBibleReferenceLinks: () => void;
    dispatchEditorViewNoopUpdate: () => void;
    refreshFloatingPreviewLabels: () => void;
    refreshBiblePreviewLocalizedLabels: () => void;
    hideFloatingBiblePreview: (resetPosition?: boolean) => void;
    closeBiblePreviewPane: (options: { collapseSideDock?: boolean; requireActivePreview?: boolean }) => Promise<void>;
    updatePluginActiveRibbonIcon: () => void;
};

export class SettingsService {
    constructor(
        private readonly context: PluginContext,
        private readonly effects: SettingsServiceEffects,
    ) {}

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
        this.effects.updatePluginActiveRibbonIcon();
        if (isPluginActive) {
            this.effects.refreshBibleReferenceLinks();
        } else {
            this.effects.hideFloatingBiblePreview(true);
            void this.effects.closeBiblePreviewPane({ collapseSideDock: false, requireActivePreview: false });
            this.effects.clearBibleReferenceLinks();
        }
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
        this.effects.refreshBiblePreviewLocalizedLabels();
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
        this.effects.refreshBibleReferenceLinks();
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
        this.effects.refreshFloatingPreviewLabels();
        this.context.refreshSettingsTab();
    }

    async resetFloatingPreviewBackgroundColor(): Promise<void> {
        await this.setFloatingPreviewBackgroundColor(DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR);
    }

    openCssColorDialog(input: CssColorDialogInput): void {
        new CssColorDialog(this.context.app, this.settings.interfaceLanguage, input).open();
    }

    openFloatingPreviewBackgroundColorDialog(): void {
        this.openCssColorDialog({
            title: this.context.t("settings.previewBackgroundColor.name"),
            description: this.context.t("settings.previewBackgroundColor.desc"),
            value: this.getFloatingPreviewBackgroundColor(),
            defaultValue: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
            previewText: this.context.t("settings.previewBackgroundColor.preview"),
            presets: createBackgroundColorPresets(),
            normalize: normalizeFloatingPreviewBackgroundColor,
            onApply: (color) => void this.setFloatingPreviewBackgroundColor(color),
        });
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
        this.effects.dispatchEditorViewNoopUpdate();
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
        await this.effects.closeBiblePreviewPane({ collapseSideDock: true, requireActivePreview: false });
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
    }
}

function getPickerValue(color: string, fallback: string): string {
    return /^#[0-9a-f]{6}$/i.test(color.trim()) ? color : fallback;
}
