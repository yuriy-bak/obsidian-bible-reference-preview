import type { ReferenceUsageReturnPoint } from "../reference-usage/ReferenceUsageService";
import type { BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import { clampReaderSplitRatio, getReaderSplitHeight } from "../reader/ReaderSplitGeometry";
import { BibleReaderPanel, createReaderIconButton, type BibleReaderLocation, type BibleReaderOpenState, type BibleReaderViewInput } from "./BibleReaderPanel";

/** Body class while the reader is open under the note. */
export const READER_SPLIT_OPEN_CLASS = "bible-reader-split-open";

export type BibleReaderSplitPanelInput = {
    reader: BibleReaderViewInput;
    getRatio: () => number;
    /** The handle was let go at that share. */
    onRatioChange: (ratio: number) => void;
    /** The chapter changed: what the panel shows is remembered for the next start. */
    onLocationChange: (location: BibleReaderLocation | null) => void;
    getReturnPoint: () => ReferenceUsageReturnPoint | null;
    onClose: () => void;
    onOpenInTab: (location: BibleReaderLocation | null) => void;
    getCloseAria: () => string;
    getOpenInTabAria: () => string;
    getResizeAria: () => string;
};

/**
 * The Bible reader under the note on a phone, where Obsidian shows one tab at a time. The panel goes into the
 * app's layout right after the workspace, above the navbar, so the note above it shrinks; a handle on top changes
 * the height. No workspace leaf: the reader panel (BibleReaderPanel) is hosted in the plugin's own element.
 */
export class BibleReaderSplitPanel {
    private splitEl: HTMLDivElement | null = null;
    private panel: BibleReaderPanel | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private readonly disposers: Array<() => void> = [];
    /** The share while the handle is dragged; saved when it is let go. */
    private dragRatio: number | null = null;

    constructor(private input: BibleReaderSplitPanelInput) {}

    isOpen(): boolean {
        return this.splitEl !== null;
    }

    getLocation(): BibleReaderLocation | null {
        return this.panel?.getLocation() ?? null;
    }

    /** Opens the panel (or reuses the open one) at a chapter, or at the book picker without one. */
    async open(state: BibleReaderOpenState, doc: Document = activeDocument): Promise<void> {
        const panel = this.ensureOpen(doc);
        await panel.open(state);
    }

    /** Opens the panel without changing what it shows; a new one opens the book picker. */
    async show(doc: Document = activeDocument): Promise<void> {
        if (this.panel !== null) return;
        await this.open({}, doc);
    }

    openNavigator(doc: Document = activeDocument): void {
        const panel = this.panel;
        if (panel === null) {
            void this.open({}, doc);
            return;
        }
        panel.openNavigator();
    }

    async refresh(input: BibleReaderViewInput): Promise<void> {
        this.input = { ...this.input, reader: input };
        await this.panel?.refresh(input);
    }

    scrollReader(command: BiblePreviewScrollCommand): boolean {
        return this.panel?.scrollReader(command) ?? false;
    }

    /** Removes the panel; the note takes the whole height again. */
    close(): void {
        const splitEl = this.splitEl;
        if (splitEl === null) return;
        this.panel?.dispose();
        this.panel = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        for (const dispose of this.disposers.splice(0)) dispose();
        splitEl.doc.body.removeClass(READER_SPLIT_OPEN_CLASS);
        splitEl.remove();
        this.splitEl = null;
        this.dragRatio = null;
    }

    private ensureOpen(doc: Document): BibleReaderPanel {
        if (this.panel !== null) return this.panel;
        const hostEl = findSplitHost(doc);
        const splitEl = hostEl.containerEl.createDiv({ cls: "bible-reader-split" });
        // Right after the workspace: above Obsidian's navbar, which stays at the bottom.
        hostEl.anchorEl?.after(splitEl);
        doc.body.addClass(READER_SPLIT_OPEN_CLASS);

        const handleEl = splitEl.createDiv({ cls: "bible-reader-split-handle" });
        handleEl.setAttribute("role", "separator");
        handleEl.setAttribute("aria-orientation", "horizontal");
        handleEl.setAttribute("aria-label", this.input.getResizeAria());
        handleEl.title = this.input.getResizeAria();
        handleEl.createDiv({ cls: "bible-reader-split-grip" });
        this.registerHandle(handleEl, hostEl.containerEl);

        const scrollEl = splitEl.createDiv({ cls: "bible-reader-split-scroll" });
        this.splitEl = splitEl;

        const panel = new BibleReaderPanel(this.input.reader, {
            containerEl: scrollEl,
            scrollEl,
            onChange: () => this.input.onLocationChange(this.panel?.getLocation() ?? null),
            getReturnPoint: () => this.input.getReturnPoint(),
            renderBarExtras: (barEl) => {
                createReaderIconButton(barEl, "maximize-2", this.input.getOpenInTabAria(), false, () => this.input.onOpenInTab(this.getLocation()));
                createReaderIconButton(barEl, "x", this.input.getCloseAria(), false, () => this.input.onClose());
            },
        });
        this.panel = panel;
        panel.load();

        // The height follows the container: the keyboard (Obsidian shrinks the app on Android), rotation.
        const ResizeObserverCtor = (doc.defaultView as Partial<typeof window> | null)?.ResizeObserver;
        if (ResizeObserverCtor !== undefined) {
            this.resizeObserver = new ResizeObserverCtor(() => this.applyHeight(hostEl.containerEl));
            this.resizeObserver.observe(hostEl.containerEl);
            // The navbar hides and shows ("Full screen" option) without resizing the container.
            for (const child of Array.from(hostEl.containerEl.children)) {
                if (child !== splitEl && child !== hostEl.anchorEl) this.resizeObserver.observe(child);
            }
        }
        this.applyHeight(hostEl.containerEl);
        return panel;
    }

    private applyHeight(containerEl: HTMLElement): void {
        const splitEl = this.splitEl;
        if (splitEl === null) return;
        const ratio = this.dragRatio ?? this.input.getRatio();
        const height = getReaderSplitHeight(ratio, getAvailableHeight(containerEl, splitEl));
        splitEl.setCssProps({ "--bible-reader-split-height": `${height}px` });
    }

    // Dragging the handle up makes the reader taller; the share is saved when the handle is let go.
    private registerHandle(handleEl: HTMLElement, containerEl: HTMLElement): void {
        let pointerId: number | null = null;
        const onPointerDown = (event: PointerEvent): void => {
            if (event.button !== 0 && event.pointerType === "mouse") return;
            event.preventDefault();
            pointerId = event.pointerId;
            handleEl.setPointerCapture?.(event.pointerId);
            handleEl.addClass("is-dragging");
        };
        const onPointerMove = (event: PointerEvent): void => {
            const splitEl = this.splitEl;
            if (pointerId !== event.pointerId || splitEl === null) return;
            event.preventDefault();
            const available = getAvailableHeight(containerEl, splitEl);
            if (available <= 0) return;
            const bottom = splitEl.getBoundingClientRect().bottom;
            this.dragRatio = clampReaderSplitRatio((bottom - event.clientY) / available);
            this.applyHeight(containerEl);
        };
        const onPointerEnd = (event: PointerEvent): void => {
            if (pointerId !== event.pointerId) return;
            pointerId = null;
            handleEl.removeClass("is-dragging");
            const ratio = this.dragRatio;
            this.dragRatio = null;
            if (ratio !== null) this.input.onRatioChange(ratio);
            this.applyHeight(containerEl);
        };
        handleEl.addEventListener("pointerdown", onPointerDown);
        handleEl.addEventListener("pointermove", onPointerMove);
        handleEl.addEventListener("pointerup", onPointerEnd);
        handleEl.addEventListener("pointercancel", onPointerEnd);
        this.disposers.push(() => {
            handleEl.removeEventListener("pointerdown", onPointerDown);
            handleEl.removeEventListener("pointermove", onPointerMove);
            handleEl.removeEventListener("pointerup", onPointerEnd);
            handleEl.removeEventListener("pointercancel", onPointerEnd);
        });
    }
}

/** Obsidian's app container and its workspace row (the panel goes right after it), or the body without them. */
function findSplitHost(doc: Document): { containerEl: HTMLElement; anchorEl: HTMLElement | null } {
    const appContainerEl = doc.querySelector<HTMLElement>(".app-container");
    if (appContainerEl === null) return { containerEl: doc.body, anchorEl: null };
    const mainEl = Array.from(appContainerEl.children).find((child): child is HTMLElement =>
        child.instanceOf(HTMLElement) && child.classList.contains("horizontal-main-container")) ?? null;
    return { containerEl: appContainerEl, anchorEl: mainEl };
}

/** The height the note and the reader share: the container without its other rows (the navbar). */
function getAvailableHeight(containerEl: HTMLElement, splitEl: HTMLElement): number {
    let height = containerEl.clientHeight;
    const style = containerEl.win.getComputedStyle(containerEl);
    height -= (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    for (const child of Array.from(containerEl.children)) {
        if (child === splitEl || !child.instanceOf(HTMLElement) || child.classList.contains("horizontal-main-container")) continue;
        const childStyle = child.win.getComputedStyle(child);
        if (childStyle.position === "absolute" || childStyle.position === "fixed" || childStyle.display === "none") continue;
        height -= child.offsetHeight;
    }
    return Math.max(0, height);
}
