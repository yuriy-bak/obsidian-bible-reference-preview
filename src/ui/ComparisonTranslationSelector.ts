import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";

export type ComparisonTranslationSelectorInput = {
    options: PreviewComparisonTranslationOption[];
    getTitle?: () => string;
    onToggleTranslation: (translationId: string, enabled: boolean) => void;
};

export function renderComparisonTranslationSelector(input: ComparisonTranslationSelectorInput): HTMLElement {
    const selectorEl = createEl("details");
    selectorEl.className = "bible-preview-comparison-selector";
    selectorEl.appendChild(createComparisonSelectorSummary(input.options, input.getTitle?.() ?? "Compare:"));
    selectorEl.appendChild(createComparisonSelectorOptions(input));
    return selectorEl;
}

function createComparisonSelectorSummary(options: PreviewComparisonTranslationOption[], title: string): HTMLElement {
    const selectedCount = options.filter((option) => option.isSelected).length;
    const summaryEl = createEl("summary");
    summaryEl.textContent = `${title} ${selectedCount}/${Math.min(options.length, 4)}`;
    summaryEl.classList.add("bible-preview-comparison-selector-summary");
    return summaryEl;
}

function createComparisonSelectorOptions(input: ComparisonTranslationSelectorInput): HTMLElement {
    const optionsEl = createDiv();
    optionsEl.classList.add("bible-preview-comparison-selector-options");
    for (const option of input.options) {
        optionsEl.appendChild(createComparisonSelectorOption(option, input.onToggleTranslation));
    }
    return optionsEl;
}

function createComparisonSelectorOption(
    option: PreviewComparisonTranslationOption,
    onToggleTranslation: (translationId: string, enabled: boolean) => void,
): HTMLElement {
    const labelEl = createEl("label");
    labelEl.classList.add("bible-preview-comparison-selector-option");

    const checkboxEl = createEl("input");
    checkboxEl.type = "checkbox";
    checkboxEl.classList.add("bible-preview-comparison-selector-checkbox");
    checkboxEl.checked = option.isSelected;
    checkboxEl.disabled = option.isDisabled;
    checkboxEl.addEventListener("change", () => onToggleTranslation(option.id, checkboxEl.checked));

    labelEl.appendChild(checkboxEl);
    labelEl.appendChild(document.createTextNode(option.name));
    return labelEl;
}
