import type { App } from "obsidian";
import type { BiblePluginLocale, I18nKey } from "../i18n/I18n";
import { CssColorDialog, createBackgroundColorPresets, type CssColorDialogInput } from "./CssColorDialog";
import { DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR, normalizeFloatingPreviewBackgroundColor } from "./cssColorValidation";

const DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR = "#7c3aed";
const DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR = "#e6e2d8";

export type CssColorDialogFlowInput = {
    app: App;
    locale: BiblePluginLocale;
};

export type FloatingPreviewBackgroundColorDialogFlowInput = CssColorDialogFlowInput & {
    translate(key: I18nKey): string;
    getFloatingPreviewBackgroundColor(): string;
    setFloatingPreviewBackgroundColor(color: string): void;
};

export function getBibleReferenceLinkColorPickerValue(color: string): string {
    return isHexColor(color) ? color : DEFAULT_BIBLE_REFERENCE_LINK_PICKER_COLOR;
}

export function getFloatingPreviewBackgroundColorPickerValue(color: string): string {
    return isHexColor(color) ? color : DEFAULT_FLOATING_PREVIEW_BACKGROUND_PICKER_COLOR;
}

export function openCssColorDialog(input: CssColorDialogFlowInput, dialogInput: CssColorDialogInput): void {
    new CssColorDialog(input.app, input.locale, dialogInput).open();
}

export function openFloatingPreviewBackgroundColorDialog(input: FloatingPreviewBackgroundColorDialogFlowInput): void {
    openCssColorDialog(input, {
        title: input.translate("settings.previewBackgroundColor.name"),
        description: input.translate("settings.previewBackgroundColor.desc"),
        value: input.getFloatingPreviewBackgroundColor(),
        defaultValue: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
        previewText: input.translate("settings.previewBackgroundColor.preview"),
        presets: createBackgroundColorPresets(),
        normalize: normalizeFloatingPreviewBackgroundColor,
        onApply: (color) => input.setFloatingPreviewBackgroundColor(color),
    });
}

function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
}
