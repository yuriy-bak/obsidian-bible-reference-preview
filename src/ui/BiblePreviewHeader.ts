import type { BiblePreviewContent } from "../application/BiblePreviewModel";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import { getHTMLElementTarget } from "../utils/EventTargetElement";
import { renderComparisonTranslationSelector } from "./ComparisonTranslationSelector";

export type BiblePreviewScrollCommand = "page-up" | "page-down" | "top" | "bottom";

export type BiblePreviewHeaderInput = {
    getTitle: () => string;
    getCopyIcon?: () => string;
    getCopyAria: () => string;
    getComparisonButtonText?: () => string;
    getComparisonButtonAria?: () => string;
    getComparisonTranslationsTitle?: () => string;
    getComparisonTranslations?: () => PreviewComparisonTranslationOption[];
    onToggleComparisonTranslation?: (translationId: string, enabled: boolean) => void;
    onToggleComparison?: (content: BiblePreviewContent) => void;
};

export type BiblePreviewHeaderOptions = {
    // "pane" or "floating": picks the header and button classes in styles.css.
    variant: "pane" | "floating";
    onCopy: () => void;
    onToggleComparison: () => void;
};

/**
 * Header shared by the floating window and the side panel: title, translations selector,
 * copy and comparison buttons. Each view appends its own buttons with addButton().
 */
export class BiblePreviewHeader {
    readonly el: HTMLDivElement;
    private readonly titleEl: HTMLDivElement;
    private readonly comparisonSelectorEl: HTMLDivElement;
    private readonly copyButtonEl: HTMLButtonElement;
    private readonly comparisonButtonEl: HTMLButtonElement;

    constructor(parentEl: HTMLElement, private input: BiblePreviewHeaderInput, private readonly options: BiblePreviewHeaderOptions) {
        this.el = parentEl.createDiv({ cls: ["bible-preview-header", `bible-preview-${options.variant}-header`] });
        this.titleEl = this.el.createDiv({ cls: "bible-preview-header-title", text: input.getTitle() });
        this.comparisonSelectorEl = this.el.createDiv({ cls: "bible-preview-header-selector-host" });
        // Only the selector itself is interactive; the empty space around it stays part of the header (a drag handle in the floating window).
        this.comparisonSelectorEl.addEventListener("pointerdown", (event) => stopSelectorEventPropagation(event));
        this.comparisonSelectorEl.addEventListener("click", (event) => stopSelectorEventPropagation(event));

        this.copyButtonEl = this.addButton(this.getCopyIcon(), input.getCopyAria(), () => options.onCopy());
        this.comparisonButtonEl = this.addButton("⇄", this.getComparisonAria(), () => options.onToggleComparison());
        this.updateComparisonButton();
    }

    addButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
        const buttonEl = this.el.createEl("button", { cls: `bible-preview-${this.options.variant}-icon-button` });
        buttonEl.type = "button";
        setHeaderButtonLabel(buttonEl, text, label);
        buttonEl.addEventListener("pointerdown", (event) => event.stopPropagation());
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return buttonEl;
    }

    refresh(input: BiblePreviewHeaderInput): void {
        this.input = input;
        this.titleEl.textContent = input.getTitle();
        setHeaderButtonLabel(this.copyButtonEl, this.getCopyIcon(), input.getCopyAria());
        this.updateComparisonButton();
        this.renderComparisonSelector();
    }

    renderComparisonSelector(): void {
        const hostEl = this.comparisonSelectorEl;
        hostEl.replaceChildren();
        const options = this.input.getComparisonTranslations?.() ?? [];
        if (options.length <= 1 || this.input.onToggleComparisonTranslation === undefined) {
            hostEl.hide();
            this.titleEl.show();
            return;
        }

        hostEl.show();
        this.titleEl.hide();
        hostEl.appendChild(renderComparisonTranslationSelector({
            options,
            getTitle: () => this.input.getComparisonTranslationsTitle?.() ?? "Compare:",
            onToggleTranslation: (translationId, enabled) => this.input.onToggleComparisonTranslation?.(translationId, enabled),
        }));
    }

    private updateComparisonButton(): void {
        setHeaderButtonLabel(this.comparisonButtonEl, this.input.getComparisonButtonText?.() ?? "⇄", this.getComparisonAria());
        this.comparisonButtonEl.toggle(this.input.onToggleComparison !== undefined);
    }

    private getCopyIcon(): string {
        return this.input.getCopyIcon?.() ?? "📋";
    }

    private getComparisonAria(): string {
        return this.input.getComparisonButtonAria?.() ?? this.input.getComparisonButtonText?.() ?? "Compare translations";
    }
}

export function setHeaderButtonLabel(buttonEl: HTMLButtonElement, text: string, label: string): void {
    buttonEl.textContent = text;
    buttonEl.setAttribute("aria-label", label);
    buttonEl.title = label;
}

export function scrollPreviewElement(scrollEl: HTMLElement, command: BiblePreviewScrollCommand): void {
    const delta = Math.max(120, scrollEl.clientHeight * 0.8);
    switch (command) {
        case "page-down":
            scrollEl.scrollTop += delta;
            return;
        case "page-up":
            scrollEl.scrollTop -= delta;
            return;
        case "top":
            scrollEl.scrollTop = 0;
            return;
        case "bottom":
            scrollEl.scrollTop = scrollEl.scrollHeight;
            return;
    }
}

function stopSelectorEventPropagation(event: Event): void {
    const target = getHTMLElementTarget(event.target);
    if (target !== null && target.closest(".bible-preview-comparison-selector") !== null) {
        event.stopPropagation();
    }
}
