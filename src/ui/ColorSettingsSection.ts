import { Setting } from "obsidian";
import { createTextColorPresets, type CssColorDialogInput } from "./CssColorDialog";
import { DEFAULT_BIBLE_REFERENCE_LINK_COLOR, normalizeBibleReferenceLinkColor } from "./cssColorValidation";

type ColorSettingsI18nKey =
    | "settings.linkColor.name"
    | "settings.linkColor.desc"
    | "settings.linkColor.preview"
    | "settings.previewBackgroundColor.name"
    | "settings.previewBackgroundColor.desc"
    | "settings.reset";

export type ColorSettingsSectionInput = {
    containerEl: HTMLElement;
    translate(key: ColorSettingsI18nKey): string;
    openCssColorDialog(input: CssColorDialogInput): void;
    openFloatingPreviewBackgroundColorDialog(): void;
    getBibleReferenceLinkColor(): string;
    getBibleReferenceLinkColorPickerValue(): string;
    isBibleReferenceLinkColorDefault(): boolean;
    setBibleReferenceLinkColor(color: string): Promise<void> | void;
    resetBibleReferenceLinkColor(): Promise<void> | void;
    getFloatingPreviewBackgroundColor(): string;
    isFloatingPreviewBackgroundColorDefault(): boolean;
    resetFloatingPreviewBackgroundColor(): Promise<void> | void;
    refresh(): void;
};

export function renderColorSettingsSection(input: ColorSettingsSectionInput): void {
    const { containerEl, translate } = input;

    const bibleReferenceLinkColorSetting = new Setting(containerEl)
        .setName(translate("settings.linkColor.name"))
        .setDesc(translate("settings.linkColor.desc"));

    const openBibleReferenceLinkColorDialog = (): void => input.openCssColorDialog({
        title: translate("settings.linkColor.name"),
        description: translate("settings.linkColor.desc"),
        value: input.getBibleReferenceLinkColor(),
        defaultValue: DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
        previewText: translate("settings.linkColor.preview"),
        presets: createTextColorPresets(),
        normalize: normalizeBibleReferenceLinkColor,
        onApply: (color) => void input.setBibleReferenceLinkColor(color),
    });

    const previewEl = bibleReferenceLinkColorSetting.controlEl.createSpan({ text: translate("settings.linkColor.preview") });
    previewEl.className = "bible-reference-preview-color-sample bible-reference-preview-link-color-sample";
    previewEl.style.color = input.isBibleReferenceLinkColorDefault()
        ? "var(--link-color)"
        : input.getBibleReferenceLinkColorPickerValue();
    previewEl.tabIndex = 0;
    previewEl.setAttribute("role", "button");
    previewEl.setAttribute("aria-label", translate("settings.linkColor.name"));
    previewEl.addEventListener("click", openBibleReferenceLinkColorDialog);
    previewEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        openBibleReferenceLinkColorDialog();
    });

    const resetButton = bibleReferenceLinkColorSetting.controlEl.createEl("button", { text: translate("settings.reset") });
    resetButton.disabled = input.isBibleReferenceLinkColorDefault();
    resetButton.className = "bible-reference-preview-setting-inline-button";
    resetButton.addEventListener("click", async (event) => {
        event.preventDefault();
        await input.resetBibleReferenceLinkColor();
        input.refresh();
    });

    const floatingPreviewBackgroundColorSetting = new Setting(containerEl)
        .setName(translate("settings.previewBackgroundColor.name"))
        .setDesc(translate("settings.previewBackgroundColor.desc"));

    const openFloatingPreviewBackgroundColorDialog = (): void => input.openFloatingPreviewBackgroundColorDialog();
    const previewBackgroundSampleEl = floatingPreviewBackgroundColorSetting.controlEl.createSpan({
        text: "...",
    });
    previewBackgroundSampleEl.className = "bible-reference-preview-color-sample bible-reference-preview-background-color-sample";
    previewBackgroundSampleEl.style.background = input.getFloatingPreviewBackgroundColor();
    previewBackgroundSampleEl.tabIndex = 0;
    previewBackgroundSampleEl.setAttribute("role", "button");
    previewBackgroundSampleEl.setAttribute("aria-label", translate("settings.previewBackgroundColor.name"));
    previewBackgroundSampleEl.addEventListener("click", openFloatingPreviewBackgroundColorDialog);
    previewBackgroundSampleEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        openFloatingPreviewBackgroundColorDialog();
    });

    const resetPreviewBackgroundButton = floatingPreviewBackgroundColorSetting.controlEl.createEl("button", { text: translate("settings.reset") });
    resetPreviewBackgroundButton.disabled = input.isFloatingPreviewBackgroundColorDefault();
    resetPreviewBackgroundButton.className = "bible-reference-preview-setting-inline-button";
    resetPreviewBackgroundButton.addEventListener("click", async (event) => {
        event.preventDefault();
        await input.resetFloatingPreviewBackgroundColor();
        input.refresh();
    });
}
