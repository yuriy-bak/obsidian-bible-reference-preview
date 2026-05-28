export const DEFAULT_BIBLE_REFERENCE_LINK_COLOR = "var(--link-color)";
export const DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR = "color-mix(in srgb, var(--background-primary) 92%, black 8%)";

const MAX_CUSTOM_CSS_COLOR_LENGTH = 160;
const SAFE_CSS_NAMED_COLORS = new Set(["black", "white", "transparent", "currentcolor"]);
const UNSAFE_CSS_VALUE_PATTERN = /(?:url\s*\(|image\s*\(|image-set\s*\(|paint\s*\(|expression\s*\(|javascript:|@import|[;{}<>])/i;

export function isCssColor(value: string): boolean {
    return isSafeCssColorValue(value);
}

function isSafeCssColorValue(value: string): boolean {
    const color = value.trim();

    if (color.length === 0 || color.length > MAX_CUSTOM_CSS_COLOR_LENGTH) {
        return false;
    }

    if (UNSAFE_CSS_VALUE_PATTERN.test(color)) {
        return false;
    }

    if (isHexColor(color) || isSafeCssVariable(color) || SAFE_CSS_NAMED_COLORS.has(color.toLowerCase()) || isSafeColorMix(color)) {
        return true;
    }

    return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", color);
}

function isSafeCssVariable(value: string): boolean {
    return /^var\(--[a-z0-9_-]+\)$/i.test(value.trim());
}

function isSafeColorMix(value: string): boolean {
    const color = value.trim();

    if (!/^color-mix\(\s*in\s+srgb\s*,/i.test(color) || !color.endsWith(")")) {
        return false;
    }

    const inner = color.slice(color.indexOf(",") + 1, -1);
    const parts = inner.split(",").map((part) => part.trim());

    if (parts.length !== 2) {
        return false;
    }

    return parts.every(isSafeColorMixPart);
}

function isSafeColorMixPart(value: string): boolean {
    const withoutPercentage = value.replace(/\s+\d+(?:\.\d+)?%$/, "").trim();

    return isHexColor(withoutPercentage)
        || isSafeCssVariable(withoutPercentage)
        || SAFE_CSS_NAMED_COLORS.has(withoutPercentage.toLowerCase());
}

function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value.trim());
}

export function normalizeBibleReferenceLinkColor(value: string): string {
    const color = value.trim();

    return isSafeCssColorValue(color)
        ? color
        : DEFAULT_BIBLE_REFERENCE_LINK_COLOR;
}

export function normalizeFloatingPreviewBackgroundColor(value: string): string {
    const color = value.trim();

    return isSafeCssColorValue(color)
        ? color
        : DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR;
}
