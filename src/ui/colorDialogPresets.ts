export type CssColorPreset = {
    label: string;
    value: string;
};

/**
 * The palette: the default value first, then the presets, then the current value
 * if it is not one of them. Each value appears once.
 */
export function buildColorDialogPresets(
    input: { value: string; defaultValue: string; presets: CssColorPreset[] },
    labels: { defaultLabel: string; currentLabel: string },
): CssColorPreset[] {
    const presets: CssColorPreset[] = [{ label: labels.defaultLabel, value: input.defaultValue }];
    for (const preset of input.presets) {
        if (!presets.some((existing) => isSameColorValue(existing.value, preset.value))) {
            presets.push(preset);
        }
    }
    if (input.value.trim().length > 0 && !presets.some((existing) => isSameColorValue(existing.value, input.value))) {
        presets.push({ label: labels.currentLabel, value: input.value.trim() });
    }
    return presets;
}

export function isSameColorValue(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}
