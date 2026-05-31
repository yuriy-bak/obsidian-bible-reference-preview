import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";

export type ComparisonTranslationSelectorInput = {
    options: PreviewComparisonTranslationOption[];
    getTitle?(): string;
    onToggleTranslation(translationId: string, enabled: boolean): void;
};

export function renderComparisonTranslationSelector(input: ComparisonTranslationSelectorInput): HTMLElement {
    const selectorEl = document.createElement("details");
    selectorEl.className = "bible-preview-comparison-selector";
    selectorEl.style.position = "relative";
    selectorEl.appendChild(createComparisonSelectorSummary(input.options, input.getTitle?.() ?? "Compare:"));
    selectorEl.appendChild(createComparisonSelectorOptions(input));
    return selectorEl;
}

function createComparisonSelectorSummary(options: PreviewComparisonTranslationOption[], title: string): HTMLElement {
    const selectedCount = options.filter((option) => option.isSelected).length;
    const summaryEl = document.createElement("summary");
    summaryEl.textContent = `${title} ${selectedCount}/${Math.min(options.length, 4)}`;
    styleComparisonSelectorSummary(summaryEl);
    return summaryEl;
}

function styleComparisonSelectorSummary(summaryEl: HTMLElement): void {
    summaryEl.style.cursor = "pointer";
    summaryEl.style.fontWeight = "600";
    summaryEl.style.fontSize = "12px";
    summaryEl.style.whiteSpace = "nowrap";
    summaryEl.style.overflow = "hidden";
    summaryEl.style.textOverflow = "ellipsis";
    summaryEl.style.userSelect = "none";
}

function createComparisonSelectorOptions(input: ComparisonTranslationSelectorInput): HTMLElement {
    const optionsEl = document.createElement("div");
    styleComparisonSelectorOptions(optionsEl);
    for (const option of input.options) {
        optionsEl.appendChild(createComparisonSelectorOption(option, input.onToggleTranslation));
    }
    return optionsEl;
}

function styleComparisonSelectorOptions(optionsEl: HTMLElement): void {
    optionsEl.style.position = "absolute";
    optionsEl.style.left = "0";
    optionsEl.style.top = "calc(100% + 6px)";
    optionsEl.style.display = "flex";
    optionsEl.style.flexDirection = "column";
    optionsEl.style.gap = "6px";
    optionsEl.style.minWidth = "min(230px, calc(100vw - 24px))";
    optionsEl.style.maxWidth = "calc(100vw - 24px)";
    optionsEl.style.maxHeight = "240px";
    optionsEl.style.overflow = "auto";
    optionsEl.style.padding = "10px";
    optionsEl.style.border = "1px solid var(--background-modifier-border)";
    optionsEl.style.borderRadius = "6px";
    optionsEl.style.background = "var(--background-primary)";
    optionsEl.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.35)";
    optionsEl.style.zIndex = "1002";
}

function createComparisonSelectorOption(
    option: PreviewComparisonTranslationOption,
    onToggleTranslation: (translationId: string, enabled: boolean) => void,
): HTMLElement {
    const labelEl = document.createElement("label");
    styleComparisonSelectorOption(labelEl);

    const checkboxEl = document.createElement("input");
    checkboxEl.type = "checkbox";
    styleComparisonSelectorCheckbox(checkboxEl);
    checkboxEl.checked = option.isSelected;
    checkboxEl.disabled = option.isDisabled;
    checkboxEl.addEventListener("change", () => onToggleTranslation(option.id, checkboxEl.checked));

    labelEl.appendChild(checkboxEl);
    labelEl.appendChild(document.createTextNode(option.name));
    return labelEl;
}

function styleComparisonSelectorOption(labelEl: HTMLElement): void {
    labelEl.style.display = "inline-flex";
    labelEl.style.alignItems = "center";
    labelEl.style.gap = "8px";
    labelEl.style.fontSize = "14px";
    labelEl.style.lineHeight = "1.35";
    labelEl.style.whiteSpace = "normal";
    labelEl.style.minHeight = "28px";
}

function styleComparisonSelectorCheckbox(checkboxEl: HTMLInputElement): void {
    checkboxEl.style.flex = "0 0 auto";
    checkboxEl.style.width = "16px";
    checkboxEl.style.height = "16px";
}
