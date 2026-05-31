import { Notice, type App } from "obsidian";
import type { I18nKey } from "../i18n/I18n";
import type { CssColorDialogInput } from "../ui/CssColorDialog";
import {
    getBibleReferenceLinkColorPickerValue as getBibleReferenceLinkColorPickerValueFlow,
    getFloatingPreviewBackgroundColorPickerValue as getFloatingPreviewBackgroundColorPickerValueFlow,
    openCssColorDialog as openCssColorDialogFlow,
    openFloatingPreviewBackgroundColorDialog as openFloatingPreviewBackgroundColorDialogFlow,
} from "../ui/ColorSettingsFlow";
import {
    DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
    DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
    normalizeBibleReferenceLinkColor,
    normalizeFloatingPreviewBackgroundColor,
} from "../ui/cssColorValidation";
import type { BibleLinkOpenShortcut, BiblePluginSettings, BiblePreviewDisplayMode, BiblePreviewPanelSide, BiblePreviewTriggerMode } from "./PluginSettings";

export type PluginSettingsFlowInput = {
    app: App;
    getSettings(): BiblePluginSettings;
    setSettings(settings: BiblePluginSettings): void;
    saveSettings(): Promise<void>;
    refreshSettings(): void;
    refreshBibleReferenceLinks(): void;
    refreshFloatingPreviewLabels(): void;
    updatePluginActiveRibbonIcon(): void;
    hideFloatingBiblePreview(resetPosition?: boolean): void;
    closeBiblePreviewPane(options: { collapseSideDock?: boolean; requireActivePreview?: boolean }): Promise<void>;
    clearBibleReferenceLinks(): void;
    dispatchEditorViewNoopUpdate(): void;
    getFloatingPreviewBackgroundColor(): string;
    translate(key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>): string;
};

export function getBibleReferenceLinkColorPickerValue(input: PluginSettingsFlowInput): string {
    return getBibleReferenceLinkColorPickerValueFlow(input.getSettings().bibleReferenceLinkColor);
}

export function isBibleReferenceLinkColorDefault(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().bibleReferenceLinkColor === DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
}

export async function setBibleReferenceLinkColor(input: PluginSettingsFlowInput, color: string): Promise<void> {
    const settings = input.getSettings();
    const nextColor = normalizeBibleReferenceLinkColor(color);

    if (settings.bibleReferenceLinkColor === nextColor) {
        return;
    }

    input.setSettings({ ...settings, bibleReferenceLinkColor: nextColor });
    await input.saveSettings();
    input.refreshBibleReferenceLinks();
    input.refreshSettings();
}

export async function resetBibleReferenceLinkColor(input: PluginSettingsFlowInput): Promise<void> {
    await setBibleReferenceLinkColor(input, DEFAULT_BIBLE_REFERENCE_LINK_COLOR);
}

export function isPluginActive(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().isPluginActive;
}

export async function togglePluginActive(input: PluginSettingsFlowInput): Promise<void> {
    await setPluginActive(input, !input.getSettings().isPluginActive);
}

export async function setPluginActive(input: PluginSettingsFlowInput, isPluginActive: boolean): Promise<void> {
    const settings = input.getSettings();
    if (settings.isPluginActive === isPluginActive) {
        return;
    }

    input.setSettings({ ...settings, isPluginActive });
    await input.saveSettings();
    applyPluginActiveStateChange(input);
    input.refreshSettings();
    new Notice(input.translate(isPluginActive ? "notice.pluginActivated" : "notice.pluginDeactivated"), 2500);
}

export function applyPluginActiveStateChange(input: PluginSettingsFlowInput): void {
    input.updatePluginActiveRibbonIcon();
    if (input.getSettings().isPluginActive) {
        input.refreshBibleReferenceLinks();
        return;
    }
    input.hideFloatingBiblePreview(true);
    void input.closeBiblePreviewPane({ collapseSideDock: false, requireActivePreview: false });
    input.clearBibleReferenceLinks();
}

export function getPluginActiveRibbonTitle(input: PluginSettingsFlowInput): string {
    return input.translate(input.getSettings().isPluginActive ? "ribbon.deactivatePlugin" : "ribbon.activatePlugin");
}

export async function setFloatingPreviewBackgroundColor(input: PluginSettingsFlowInput, color: string): Promise<void> {
    const settings = input.getSettings();
    const nextColor = normalizeFloatingPreviewBackgroundColor(color);
    if (settings.floatingPreviewBackgroundColor === nextColor) {
        return;
    }
    input.setSettings({ ...settings, floatingPreviewBackgroundColor: nextColor });
    await input.saveSettings();
    input.refreshFloatingPreviewLabels();
    input.refreshSettings();
}

export async function resetFloatingPreviewBackgroundColor(input: PluginSettingsFlowInput): Promise<void> {
    await setFloatingPreviewBackgroundColor(input, DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR);
}

export function getFloatingPreviewBackgroundColor(input: PluginSettingsFlowInput): string {
    return normalizeFloatingPreviewBackgroundColor(input.getSettings().floatingPreviewBackgroundColor);
}

export function getFloatingPreviewBackgroundColorPickerValue(input: PluginSettingsFlowInput): string {
    return getFloatingPreviewBackgroundColorPickerValueFlow(input.getSettings().floatingPreviewBackgroundColor);
}

export function isFloatingPreviewBackgroundColorDefault(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().floatingPreviewBackgroundColor === DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
}

export function openCssColorDialog(input: PluginSettingsFlowInput, dialogInput: CssColorDialogInput): void {
    openCssColorDialogFlow({
        app: input.app,
        locale: input.getSettings().interfaceLanguage,
    }, dialogInput);
}

export function openFloatingPreviewBackgroundColorDialog(input: PluginSettingsFlowInput): void {
    openFloatingPreviewBackgroundColorDialogFlow({
        app: input.app,
        locale: input.getSettings().interfaceLanguage,
        translate: (key) => input.translate(key),
        getFloatingPreviewBackgroundColor: input.getFloatingPreviewBackgroundColor,
        setFloatingPreviewBackgroundColor: (color) => void setFloatingPreviewBackgroundColor(input, color),
    });
}

export function getBiblePreviewTriggerMode(input: PluginSettingsFlowInput): BiblePreviewTriggerMode {
    return input.getSettings().previewTriggerMode;
}

export function getBiblePreviewDisplayMode(input: PluginSettingsFlowInput): BiblePreviewDisplayMode {
    return input.getSettings().previewDisplayMode;
}

export function getBiblePreviewPanelSide(input: PluginSettingsFlowInput): BiblePreviewPanelSide {
    return input.getSettings().previewPanelSide;
}

export async function setBiblePreviewDisplayMode(input: PluginSettingsFlowInput, previewDisplayMode: BiblePreviewDisplayMode): Promise<void> {
    const settings = input.getSettings();
    if (settings.previewDisplayMode === previewDisplayMode) {
        return;
    }

    input.setSettings({ ...settings, previewDisplayMode });
    await input.saveSettings();
    input.refreshSettings();
}

export async function setBiblePreviewPanelSide(input: PluginSettingsFlowInput, previewPanelSide: BiblePreviewPanelSide): Promise<void> {
    const settings = input.getSettings();
    if (settings.previewPanelSide === previewPanelSide) {
        return;
    }

    input.setSettings({ ...settings, previewPanelSide });
    await input.saveSettings();
    await input.closeBiblePreviewPane({ collapseSideDock: true, requireActivePreview: false });
    input.refreshSettings();
}

export async function setBiblePreviewTriggerMode(input: PluginSettingsFlowInput, previewTriggerMode: BiblePreviewTriggerMode): Promise<void> {
    const settings = input.getSettings();
    if (settings.previewTriggerMode === previewTriggerMode) {
        return;
    }

    input.setSettings({ ...settings, previewTriggerMode });
    await input.saveSettings();
    input.refreshSettings();
    input.dispatchEditorViewNoopUpdate();
}

export function shouldClosePreviewOnActiveLeafChange(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().closePreviewOnActiveLeafChange;
}

export async function setClosePreviewOnActiveLeafChange(input: PluginSettingsFlowInput, closePreviewOnActiveLeafChange: boolean): Promise<void> {
    await setBooleanSetting(input, "closePreviewOnActiveLeafChange", closePreviewOnActiveLeafChange);
}

export function shouldAutoOpenPreviewOnVerseChange(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().autoOpenPreviewOnVerseChange;
}

export async function setAutoOpenPreviewOnVerseChange(input: PluginSettingsFlowInput, autoOpenPreviewOnVerseChange: boolean): Promise<void> {
    await setBooleanSetting(input, "autoOpenPreviewOnVerseChange", autoOpenPreviewOnVerseChange);
}

export function isPreviewComparisonEnabled(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().previewComparisonEnabled;
}

export async function setPreviewComparisonEnabled(input: PluginSettingsFlowInput, previewComparisonEnabled: boolean): Promise<void> {
    await setBooleanSetting(input, "previewComparisonEnabled", previewComparisonEnabled);
}

export function shouldInterceptLinkOpenShortcut(input: PluginSettingsFlowInput): boolean {
    return input.getSettings().interceptLinkOpenShortcut;
}

export async function setInterceptLinkOpenShortcut(input: PluginSettingsFlowInput, interceptLinkOpenShortcut: boolean): Promise<void> {
    await setBooleanSetting(input, "interceptLinkOpenShortcut", interceptLinkOpenShortcut);
}

export function getBibleLinkOpenShortcut(input: PluginSettingsFlowInput): BibleLinkOpenShortcut {
    return input.getSettings().linkOpenShortcut;
}

export async function setBibleLinkOpenShortcut(input: PluginSettingsFlowInput, linkOpenShortcut: BibleLinkOpenShortcut): Promise<void> {
    const settings = input.getSettings();
    if (settings.linkOpenShortcut === linkOpenShortcut) {
        return;
    }

    input.setSettings({ ...settings, linkOpenShortcut });
    await input.saveSettings();
    input.refreshSettings();
}

async function setBooleanSetting(
    input: PluginSettingsFlowInput,
    key: "closePreviewOnActiveLeafChange" | "autoOpenPreviewOnVerseChange" | "previewComparisonEnabled" | "interceptLinkOpenShortcut",
    value: boolean,
): Promise<void> {
    const settings = input.getSettings();
    if (settings[key] === value) {
        return;
    }

    input.setSettings({ ...settings, [key]: value });
    await input.saveSettings();
    input.refreshSettings();
}
