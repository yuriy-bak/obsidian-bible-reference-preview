import { App, Modal, Setting } from "obsidian";
import { BiblePluginLocale, t } from "../i18n/I18n";
import { buildColorDialogPresets, isSameColorValue, type CssColorPreset } from "./colorDialogPresets";
import { DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR, THEME_LINK_COLOR, isCssColor } from "./cssColorValidation";

export type { CssColorPreset } from "./colorDialogPresets";

export type CssColorDialogInput = {
    title: string;
    description: string;
    value: string;
    defaultValue: string;
    previewText: string;
    /** "text": the sample text takes the color on the usual background; "background": the sample is filled with it. */
    previewMode?: "text" | "background";
    presets: CssColorPreset[];
    normalize: (value: string) => string;
    onApply: (value: string) => void;
};

type HsvColor = {
    h: number;
    s: number;
    v: number;
};

export class CssColorDialog extends Modal {
    private value: string;
    private hue = 260;
    private saturation = 58;
    private brightness = 93;

    constructor(app: App, private readonly locale: BiblePluginLocale, private readonly input: CssColorDialogInput) {
        super(app);
        this.value = input.value;
        const hsv = parseCssColorPickerHex(input.value) ?? parseCssColorPickerHex(input.defaultValue);
        if (hsv !== null) {
            this.hue = hsv.h;
            this.saturation = hsv.s;
            this.brightness = hsv.v;
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.input.title });
        contentEl.createEl("p", { text: this.input.description });

        const previewMode = this.input.previewMode ?? "background";
        const previewEl = contentEl.createDiv({ cls: "bible-color-dialog-preview" });
        const coloredEl = previewMode === "text"
            ? previewEl.createSpan({ text: this.input.previewText, cls: "bible-color-dialog-preview-link" })
            : previewEl;
        if (previewMode === "background") {
            previewEl.setText(this.input.previewText);
        }
        const paintPreview = (color: string): void => {
            if (previewMode === "text") {
                coloredEl.style.color = color;
            } else {
                previewEl.style.background = color;
            }
        };
        /** The rendered color of the preview, for values like var(--color-green) that the picker can't parse. */
        const readRenderedPreviewColor = (): HsvColor | null => {
            const view = previewEl.ownerDocument.defaultView;
            if (view === null) {
                return null;
            }
            const style = view.getComputedStyle(coloredEl);
            return parseRgbColor(previewMode === "text" ? style.color : style.backgroundColor);
        };

        const inputEl = contentEl.createEl("input", { cls: "bible-color-dialog-input" });
        inputEl.type = "text";
        inputEl.value = this.value;
        inputEl.placeholder = ["#e6e2d8", "var(--background-primary)", "color-mix(...)"].join(", ");

        const statusEl = contentEl.createDiv({ cls: "bible-color-dialog-status" });

        contentEl.createDiv({ text: t(this.locale, "settings.colorDialog.picker"), cls: "bible-color-dialog-section-title" });

        const pickerWrapEl = contentEl.createDiv({ cls: "bible-color-dialog-picker" });
        const saturationEl = pickerWrapEl.createDiv({ cls: "bible-color-dialog-saturation" });
        const saturationMarkerEl = saturationEl.createDiv({ cls: "bible-color-dialog-saturation-marker" });
        const hueEl = pickerWrapEl.createDiv({ cls: "bible-color-dialog-hue" });
        const hueMarkerEl = hueEl.createDiv({ cls: "bible-color-dialog-hue-marker" });

        const updatePickerUi = (): void => {
            const hueColor = hsvToHex(this.hue, 100, 100);
            saturationEl.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`;
            saturationMarkerEl.style.left = `${this.saturation}%`;
            saturationMarkerEl.style.top = `${100 - this.brightness}%`;
            hueMarkerEl.style.top = `${(this.hue / 360) * 100}%`;
        };

        const applyValue = (value: string, syncPicker: boolean): void => {
            this.value = value.trim();
            inputEl.value = this.value;
            const normalized = this.input.normalize(this.value);
            paintPreview(normalized);
            statusEl.textContent = isCssColor(this.value)
                ? t(this.locale, "settings.colorDialog.valid")
                : t(this.locale, "settings.colorDialog.invalid");
            if (syncPicker) {
                const hsv = parseCssColorPickerHex(this.value) ?? readRenderedPreviewColor();
                if (hsv !== null) {
                    this.hue = hsv.h;
                    this.saturation = hsv.s;
                    this.brightness = hsv.v;
                }
            }
            updatePickerUi();
            updateActivePreset();
        };

        const applyPickerValue = (): void => {
            applyValue(hsvToHex(this.hue, this.saturation, this.brightness), false);
        };

        const updateSaturationFromPointer = (event: PointerEvent): void => {
            const rect = saturationEl.getBoundingClientRect();
            const x = clampColorDialogNumber((event.clientX - rect.left) / rect.width, 0, 1);
            const y = clampColorDialogNumber((event.clientY - rect.top) / rect.height, 0, 1);
            this.saturation = Math.round(x * 100);
            this.brightness = Math.round((1 - y) * 100);
            applyPickerValue();
        };

        const updateHueFromPointer = (event: PointerEvent): void => {
            const rect = hueEl.getBoundingClientRect();
            const y = clampColorDialogNumber((event.clientY - rect.top) / rect.height, 0, 1);
            this.hue = Math.round(y * 360) % 360;
            applyPickerValue();
        };

        this.bindColorDialogPointerDrag(saturationEl, updateSaturationFromPointer);
        this.bindColorDialogPointerDrag(hueEl, updateHueFromPointer);

        contentEl.createDiv({ text: t(this.locale, "settings.colorDialog.palette"), cls: "bible-color-dialog-section-title" });

        const presetsEl = contentEl.createDiv({ cls: "bible-color-dialog-presets" });
        const presets = buildColorDialogPresets(this.input, {
            defaultLabel: t(this.locale, "settings.colorDialog.default"),
            currentLabel: t(this.locale, "settings.colorDialog.current"),
        });
        const presetButtons: { value: string; buttonEl: HTMLButtonElement }[] = [];
        function updateActivePreset(): void {
            for (const { value, buttonEl } of presetButtons) {
                buttonEl.toggleClass("is-active", isSameColorValue(value, inputEl.value));
            }
        }
        for (const preset of presets) {
            const buttonEl = presetsEl.createEl("button", { cls: "bible-color-dialog-preset" });
            presetButtons.push({ value: preset.value, buttonEl });
            buttonEl.type = "button";
            buttonEl.addEventListener("click", (event) => {
                event.preventDefault();
                applyValue(preset.value, true);
            });
            const swatchEl = buttonEl.createSpan({ cls: "bible-color-dialog-preset-swatch" });
            swatchEl.style.background = this.input.normalize(preset.value);
            buttonEl.appendChild(swatchEl);
            buttonEl.appendText(preset.label);
        }

        inputEl.addEventListener("input", () => applyValue(inputEl.value, true));
        applyValue(this.value, true);

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(t(this.locale, "settings.colorDialog.cancel"))
                .onClick(() => this.close()))
            .addButton((button) => button
                .setButtonText(t(this.locale, "settings.colorDialog.default"))
                .onClick(() => applyValue(this.input.defaultValue, true)))
            .addButton((button) => button
                .setButtonText(t(this.locale, "settings.colorDialog.apply"))
                .setCta()
                .onClick(() => {
                    this.input.onApply(this.input.normalize(this.value));
                    this.close();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private bindColorDialogPointerDrag(element: HTMLElement, onPointerMove: (event: PointerEvent) => void): void {
        element.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            element.setPointerCapture(event.pointerId);
            onPointerMove(event);
            const handlePointerMove = (moveEvent: PointerEvent): void => {
                if (moveEvent.pointerId === event.pointerId) {
                    moveEvent.preventDefault();
                    onPointerMove(moveEvent);
                }
            };
            const handlePointerUp = (upEvent: PointerEvent): void => {
                if (upEvent.pointerId !== event.pointerId) {
                    return;
                }
                element.releasePointerCapture(event.pointerId);
                element.removeEventListener("pointermove", handlePointerMove);
                element.removeEventListener("pointerup", handlePointerUp);
                element.removeEventListener("pointercancel", handlePointerUp);
            };
            element.addEventListener("pointermove", handlePointerMove);
            element.addEventListener("pointerup", handlePointerUp);
            element.addEventListener("pointercancel", handlePointerUp);
        });
    }
}

export function createTextColorPresets(): CssColorPreset[] {
    return [
        { label: "Theme link", value: THEME_LINK_COLOR },
        { label: "Violet", value: "#7c3aed" },
        { label: "Blue", value: "#2563eb" },
        { label: "Orange", value: "#d97706" },
        { label: "Red", value: "#dc2626" },
        { label: "Gray", value: "#6b7280" },
    ];
}

export function createBackgroundColorPresets(): CssColorPreset[] {
    return [
        { label: "Theme dark", value: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR },
        { label: "Theme primary", value: "var(--background-primary)" },
        { label: "Theme secondary", value: "var(--background-secondary)" },
        { label: "Paper", value: "#e6e2d8" },
        { label: "Warm", value: "#f3ead7" },
        { label: "Gray", value: "#e5e7eb" },
        { label: "Dark", value: "#1f2937" },
        { label: "Blue gray", value: "#dbe3ea" },
    ];
}

function parseRgbColor(value: string): HsvColor | null {
    const match = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(value.trim());
    if (match === null) {
        return null;
    }
    return rgbToHsv(Math.round(Number(match[1])), Math.round(Number(match[2])), Math.round(Number(match[3])));
}

function parseCssColorPickerHex(value: string): HsvColor | null {
    const color = value.trim();
    if (!isHexColor(color)) {
        return null;
    }
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return rgbToHsv(red, green, blue);
}

function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function hsvToHex(hue: number, saturation: number, brightness: number): string {
    const { red, green, blue } = hsvToRgb(hue, saturation, brightness);
    return `#${toColorDialogHex(red)}${toColorDialogHex(green)}${toColorDialogHex(blue)}`;
}

function toColorDialogHex(value: number): string {
    return clampColorDialogNumber(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHsv(red: number, green: number, blue: number): HsvColor {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
        if (max === r) {
            hue = 60 * (((g - b) / delta) % 6);
        } else if (max === g) {
            hue = 60 * ((b - r) / delta + 2);
        } else {
            hue = 60 * ((r - g) / delta + 4);
        }
    }
    if (hue < 0) {
        hue += 360;
    }
    return {
        h: Math.round(hue),
        s: max === 0 ? 0 : Math.round((delta / max) * 100),
        v: Math.round(max * 100),
    };
}

function hsvToRgb(hue: number, saturation: number, brightness: number): { red: number; green: number; blue: number } {
    const h = ((hue % 360) + 360) % 360;
    const s = clampColorDialogNumber(saturation, 0, 100) / 100;
    const v = clampColorDialogNumber(brightness, 0, 100) / 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    return {
        red: Math.round((r + m) * 255),
        green: Math.round((g + m) * 255),
        blue: Math.round((b + m) * 255),
    };
}

function clampColorDialogNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
