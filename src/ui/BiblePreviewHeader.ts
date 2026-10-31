import { setIcon, type Menu } from "obsidian";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import { getHTMLElementTarget } from "../utils/EventTargetElement";
import { renderComparisonTranslationSelector } from "./ComparisonTranslationSelector";
import { ICONS, setBookTitle } from "./Icons";

const COPIED_FEEDBACK_MS = 1500;

export type BiblePreviewScrollCommand = "page-up" | "page-down" | "top" | "bottom";

export type BiblePreviewHeaderInput = {
    getTitle: () => string;
    getCopyAria: () => string;
    getOpenSettingsText?: () => string;
    onOpenSettings?: () => void;
    isComparisonEnabled?: () => boolean;
    getComparisonButtonAria?: () => string;
    getComparisonTranslationsTitle?: () => string;
    getComparisonTranslations?: () => PreviewComparisonTranslationOption[];
    onToggleComparisonTranslation?: (translationId: string, enabled: boolean) => void;
    onToggleComparison?: (content: BiblePreviewContent) => void;
};

export type BiblePreviewHeaderOptions = {
    // "pane" or "floating": picks the header and button classes in styles.css.
    variant: "pane" | "floating";
    /** Resolves to true when the text was copied; the button then briefly shows a check mark. */
    onCopy: () => Promise<boolean>;
    onToggleComparison: () => void;
};

/**
 * Header shared by the floating window and the side panel: title, translations selector,
 * copy and comparison buttons (Lucide icons). Each view appends its own buttons with addIconButton().
 */
export class BiblePreviewHeader {
    readonly el: HTMLDivElement;
    private readonly titleEl: HTMLDivElement;
    private readonly comparisonSelectorEl: HTMLDivElement;
    private readonly copyButtonEl: HTMLButtonElement;
    private readonly comparisonButtonEl: HTMLButtonElement;
    private copyFeedbackTimer: number | null = null;

    constructor(parentEl: HTMLElement, private input: BiblePreviewHeaderInput, private readonly options: BiblePreviewHeaderOptions) {
        this.el = parentEl.createDiv({ cls: ["bible-preview-header", `bible-preview-${options.variant}-header`] });
        this.titleEl = this.el.createDiv({ cls: "bible-preview-header-title" });
        setBookTitle(this.titleEl, input.getTitle());
        this.comparisonSelectorEl = this.el.createDiv({ cls: "bible-preview-header-selector-host" });
        // Only the selector itself is interactive; the empty space around it stays part of the header (a drag handle in the floating window).
        this.comparisonSelectorEl.addEventListener("pointerdown", (event) => stopSelectorEventPropagation(event));
        this.comparisonSelectorEl.addEventListener("click", (event) => stopSelectorEventPropagation(event));

        this.copyButtonEl = this.addIconButton(ICONS.copy, input.getCopyAria(), () => void this.copy());
        this.comparisonButtonEl = this.addIconButton(ICONS.comparison, this.getComparisonAria(), () => options.onToggleComparison());
        this.updateComparisonButton();
    }

    /** A header button showing a Lucide icon (the set built into Obsidian). */
    addIconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
        const buttonEl = this.createButton(label, onClick);
        buttonEl.addClass("bible-preview-header-lucide-button");
        setIcon(buttonEl, icon);
        return buttonEl;
    }

    private createButton(label: string, onClick: () => void): HTMLButtonElement {
        const buttonEl = this.el.createEl("button", { cls: `bible-preview-${this.options.variant}-icon-button` });
        buttonEl.type = "button";
        setHeaderButtonAria(buttonEl, label);
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
        setBookTitle(this.titleEl, input.getTitle());
        setHeaderButtonAria(this.copyButtonEl, input.getCopyAria());
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
        setHeaderButtonAria(this.comparisonButtonEl, this.getComparisonAria());
        const enabled = this.input.isComparisonEnabled?.() ?? false;
        this.comparisonButtonEl.toggleClass("is-active", enabled);
        this.comparisonButtonEl.setAttribute("aria-pressed", String(enabled));
        this.comparisonButtonEl.toggle(this.input.onToggleComparison !== undefined);
    }

    private async copy(): Promise<void> {
        if (!await this.options.onCopy()) return;
        const win = this.el.win;
        if (this.copyFeedbackTimer !== null) win.clearTimeout(this.copyFeedbackTimer);
        setIcon(this.copyButtonEl, ICONS.copied);
        this.copyFeedbackTimer = win.setTimeout(() => {
            this.copyFeedbackTimer = null;
            setIcon(this.copyButtonEl, ICONS.copy);
        }, COPIED_FEEDBACK_MS);
    }

    private getComparisonAria(): string {
        return this.input.getComparisonButtonAria?.() ?? "Compare translations";
    }
}

export function setHeaderButtonAria(buttonEl: HTMLButtonElement, label: string): void {
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

/** Adds "Plugin settings" to a menu of the preview (the side panel's "More options" or the floating header's context menu). */
export function addOpenSettingsMenuItem(menu: Menu, input: BiblePreviewHeaderInput): void {
    const onOpenSettings = input.onOpenSettings;
    if (onOpenSettings === undefined) return;
    menu.addItem((item) => item
        .setTitle(input.getOpenSettingsText?.() ?? "Plugin settings")
        .setIcon("settings")
        .onClick(() => onOpenSettings()));
}
