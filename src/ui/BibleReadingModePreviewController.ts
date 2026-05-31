import type { BiblePreviewContent } from "../application/formatBibleTexts";

export type BibleReadingModePreviewControllerInput = {
    showBiblePreviewContent(content: BiblePreviewContent, anchor: { type: "element"; element: HTMLElement }, options: { reveal?: boolean }): void;
    shouldAutoOpenPreviewOnVerseChange(): boolean;
    hasImportedTranslations(): boolean;
    analyzeReferenceText(referenceText: string): Promise<BiblePreviewContent | null>;
    showNoImportedTranslationsNotice(): void;
    refreshFloatingPreviewLabels(): void;
    isFloatingPreviewTarget(target: Node): boolean;
    hideFloatingBiblePreview(): void;
};

export class BibleReadingModePreviewController {
    private readonly outsideInteractionHandler = (event: Event) => this.hideBiblePreviewIfEventIsOutside(event);
    private requestId = 0;

    constructor(private readonly input: BibleReadingModePreviewControllerInput) {}

    public async open(anchorEl: HTMLElement, referenceText: string): Promise<void> {
        if (!this.input.hasImportedTranslations()) {
            this.input.showNoImportedTranslationsNotice();
            return;
        }
        const requestId = ++this.requestId;
        const content = await this.input.analyzeReferenceText(referenceText);
        if (requestId !== this.requestId || content === null || content.plainText.length === 0) return;
        this.show(content, anchorEl);
    }

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
