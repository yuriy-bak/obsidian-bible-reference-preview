import type { BiblePreviewContent } from "../application/formatBibleTexts";

export type BibleReadingModePreviewControllerInput = {
    showBiblePreviewContent(content: BiblePreviewContent, anchor: { type: "element"; element: HTMLElement }, options: { reveal?: boolean }): void;
    shouldAutoOpenPreviewOnVerseChange(): boolean;
    refreshFloatingPreviewLabels(): void;
    isFloatingPreviewTarget(target: Node): boolean;
    hideFloatingBiblePreview(): void;
};

export class BibleReadingModePreviewController {
    private readonly outsideInteractionHandler = (event: Event) => this.hideBiblePreviewIfEventIsOutside(event);

    constructor(private readonly input: BibleReadingModePreviewControllerInput) {}

    public show(content: BiblePreviewContent, anchorEl: HTMLElement): void {
        this.input.showBiblePreviewContent(content, { type: "element", element: anchorEl }, { reveal: this.input.shouldAutoOpenPreviewOnVerseChange() });
    }

    public destroy(): void { }

    public refreshLocalizedLabels(): void {
        this.input.refreshFloatingPreviewLabels();
    }

    private registerListeners(): void {
        document.addEventListener("pointerdown", this.outsideInteractionHandler, true);
        document.addEventListener("focusin", this.outsideInteractionHandler, true);
    }

    private unregisterListeners(): void {
        document.removeEventListener("pointerdown", this.outsideInteractionHandler, true);
        document.removeEventListener("focusin", this.outsideInteractionHandler, true);
    }

    private hideBiblePreviewIfEventIsOutside(event: Event): void {
        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }
        if (this.input.isFloatingPreviewTarget(target)) {
            return;
        }
        if (target instanceof HTMLElement && target.closest(".bible-reference-reading-link") !== null) {
            return;
        }
        this.input.hideFloatingBiblePreview();
    }
}
