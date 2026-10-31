import { Notice, Platform } from "obsidian";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import { applyBiblePreviewScroll, type BiblePreviewChapterViewInput, createChapterRenderOptions, renderBiblePreviewContent } from "./BiblePreviewRenderer";
import { BiblePreviewHeader, scrollPreviewElement, setHeaderButtonLabel, type BiblePreviewHeaderInput, type BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import {
    clampNumber,
    COLLAPSED_BUTTON_SIZE,
    MIN_HEIGHT,
    MIN_WIDTH,
    type PreviewPosition,
    type PreviewSafeMargins,
    type PreviewSize,
    type PreviewViewport,
} from "./FloatingPreviewGeometry";
import { FloatingPreviewPointerController } from "./FloatingPreviewPointerController";

export type FloatingBiblePreviewAnchor =
    | { type: "default" }
    | { type: "element"; element: HTMLElement };

export type FloatingBiblePreviewWindowInput = BiblePreviewChapterViewInput & BiblePreviewHeaderInput & {
    getCopyNoticeText: () => string;
    getCollapseAria: () => string;
    getExpandAria: () => string;
    getBackgroundColor: () => string;
    getFindUsagesButtonText?: () => string;
    getFindUsagesButtonAria?: (target: BiblePreviewUsageTarget) => string;
    onFindUsages?: (target: BiblePreviewUsageTarget) => void;
    getCloseAria?: () => string;
    getOpenInPanelAria?: () => string;
    getOpenInPanelIcon?: () => string;
    onOpenInPanel?: (content: BiblePreviewContent) => void;
};

type PreviewSizeBounds = { maxWidth: number; maxHeight: number };
type PreviewPositionBounds = { minLeft: number; maxLeft: number; minTop: number; maxTop: number };

const HEADER_HEIGHT = 34;
const DEFAULT_DESKTOP_WIDTH = 430;
const DEFAULT_DESKTOP_HEIGHT = 320;
const DEFAULT_MOBILE_HEIGHT = 220;
const MOBILE_SAFE_TOP_ANDROID = 72;
const MOBILE_SAFE_TOP_DEFAULT = 56;
const MOBILE_SAFE_SIDE = 8;
const MOBILE_SAFE_BOTTOM = 12;

type Disposable = () => void;

function addDisposableEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): Disposable {
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
}

function disposeAll(disposables: Disposable[]): void {
    for (const dispose of disposables.splice(0)) {
        dispose();
    }
}

export class FloatingBiblePreviewWindow {
    private readonly previewPanelEl: HTMLDivElement;
    private readonly previewContentEl: HTMLDivElement;
    private readonly collapsedButtonEl: HTMLButtonElement;
    private readonly resizeHandleEls: HTMLDivElement[];
    private readonly pointer: FloatingPreviewPointerController;
    private header: BiblePreviewHeader | null = null;
    private collapsePreviewButtonEl: HTMLButtonElement | null = null;
    private closePreviewButtonEl: HTMLButtonElement | null = null;
    private openInPanelButtonEl: HTMLButtonElement | null = null;
    private previewContent: BiblePreviewContent | null = null;
    private previewText = "";
    private isPreviewCollapsed = false;
    private customPreviewSize: PreviewSize | null = null;
    private customPreviewPosition: PreviewPosition | null = null;
    private collapsedButtonPosition: PreviewPosition | null = null;
    private collapsedExpandAnchorOffset: { right: number; top: number } | null = null;
    private readonly disposables: Disposable[] = [];
    // Document of the Obsidian window that holds the preview: the main window or a popout window.
    private hostDocument: Document;

    private readonly viewportChangeHandler = () => this.updateBiblePreviewPosition();
    private readonly pointerMoveHandler = (event: PointerEvent) => this.pointer.handlePointerMove(event);
    private readonly pointerUpHandler = (event: PointerEvent) => this.pointer.handlePointerUp(event);
    private readonly keydownHandler = (event: KeyboardEvent) => this.handleKeydown(event);

    constructor(private labels: FloatingBiblePreviewWindowInput) {
        this.previewPanelEl = this.createPreviewPanelElement();
        this.previewContentEl = this.previewPanelEl.createDiv({ cls: "bible-preview-floating-content" });
        this.collapsedButtonEl = this.createCollapsedButtonElement();
        this.pointer = this.createPointerController();
        this.resizeHandleEls = this.pointer.createResizeHandleElements();

        this.hostDocument = activeDocument;
        this.hostDocument.body.appendChild(this.previewPanelEl);
        this.hostDocument.body.appendChild(this.collapsedButtonEl);
        for (const handleEl of this.resizeHandleEls) {
            this.previewPanelEl.appendChild(handleEl);
        }
        this.registerListeners();
    }

    private createPointerController(): FloatingPreviewPointerController {
        return new FloatingPreviewPointerController({
            panelEl: this.previewPanelEl,
            collapsedButtonEl: this.collapsedButtonEl,
            canStartExpandedInteraction: () => this.previewText.length > 0 && !this.isPreviewCollapsed,
            canStartCollapsedInteraction: () => this.previewText.length > 0 && this.isPreviewCollapsed,
            getExpandedInteractionStart: () => {
                const rect = this.previewPanelEl.getBoundingClientRect();
                const position = this.clampBiblePreviewPosition(rect.left, rect.top, rect.width, rect.height);
                this.customPreviewPosition = position;
                return { rect, position };
            },
            clampPosition: (left, top, width, height) => this.clampBiblePreviewPosition(left, top, width, height),
            getViewport: () => this.getBiblePreviewViewport(),
            getSafeMargins: (viewportWidth) => this.getBiblePreviewSafeMargins(viewportWidth),
            isMobileLayout: (viewportWidth) => this.isMobilePreviewLayout(viewportWidth),
            getMobileWidth: (viewportWidth) => this.getMobilePreviewWidth(viewportWidth),
            onPreviewDragged: (position) => {
                this.customPreviewPosition = position;
                this.applyPreviewPosition(position);
            },
            onPreviewResized: (result) => {
                this.customPreviewPosition = { left: result.left, top: result.top };
                this.customPreviewSize = { width: result.width, height: result.height };
                this.applyPreviewSize(result.width, result.height);
                this.applyPreviewPosition({ left: result.left, top: result.top });
            },
            onCollapsedButtonDragged: (position) => {
                this.collapsedButtonPosition = position;
                this.applyCollapsedButtonPosition(position);
            },
            setUserSelectDisabled: (disabled) => this.hostDocument.body.setCssStyles({ userSelect: disabled ? "none" : "" }),
        });
    }

    private get hostWindow(): Window {
        return this.hostDocument.defaultView ?? window;
    }

    public show(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        const shouldReveal = options.reveal !== false;
        this.moveToDocument(anchor.type === "element" ? anchor.element.ownerDocument : activeDocument);
        const wasVisible = this.isVisible();
        this.previewContent = content;
        this.previewText = content.plainText;
        renderBiblePreviewContent(this.previewContentEl, content, {
            ...createChapterRenderOptions(this.labels, content, () => this.previewContentEl.scrollTop),
            getFindUsagesButtonText: this.labels.getFindUsagesButtonText,
            getFindUsagesButtonAria: this.labels.getFindUsagesButtonAria,
            onFindUsages: this.labels.onFindUsages,
        });
        this.header?.refresh(this.labels);

        if (shouldReveal) {
            if (this.isPreviewCollapsed) {
                this.isPreviewCollapsed = false;
                this.setExpandedPreviewPositionFromCollapsedButton();
            } else if (anchor.type === "element" && this.customPreviewPosition === null) {
                this.customPreviewPosition = this.getExpandedPreviewPositionForAnchor(anchor.element);
            }
        } else if (!wasVisible) {
            this.isPreviewCollapsed = true;
        }

        this.renderBiblePreview();
        applyBiblePreviewScroll(this.previewContentEl, content);
    }

    public getContent(): BiblePreviewContent | null {
        return this.previewContent;
    }

    public hide(resetPosition = false): void {
        this.previewContent = null;
        this.previewText = "";
        this.previewPanelEl.setCssStyles({ display: "none" });
        this.collapsedButtonEl.setCssStyles({ display: "none" });

        if (resetPosition) {
            this.customPreviewPosition = null;
            this.collapsedButtonPosition = null;
            this.collapsedExpandAnchorOffset = null;
            this.customPreviewSize = null;
            this.isPreviewCollapsed = false;
        } else if (this.customPreviewPosition === null) {
            this.collapsedButtonPosition = null;
        }
    }

    /**
     * Moves the preview into the window where it is shown: the reference may be in a popout window.
     * The position belongs to the old window, so the preview opens at its default place.
     */
    private moveToDocument(targetDocument: Document): void {
        if (targetDocument === this.hostDocument && this.previewPanelEl.isConnected) {
            return;
        }
        this.unregisterListeners();
        this.hide(true);
        this.hostDocument = targetDocument;
        this.hostDocument.body.appendChild(this.previewPanelEl);
        this.hostDocument.body.appendChild(this.collapsedButtonEl);
        this.registerListeners();
    }

    /**
     * A popout window closed. When the preview lived there, its listeners go now instead of at the next
     * move, and it returns to the main window; the next show() puts it where the reference is.
     */
    public handleWindowClose(closedWindow: Window): void {
        if (closedWindow.document !== this.hostDocument) {
            return;
        }
        this.unregisterListeners();
        this.hide(true);
        this.previewPanelEl.remove();
        this.collapsedButtonEl.remove();
        this.hostDocument = document;
    }

    public destroy(): void {
        this.unregisterListeners();
        this.previewPanelEl.remove();
        this.collapsedButtonEl.remove();
    }

    public refreshLabels(labels: FloatingBiblePreviewWindowInput): void {
        this.labels = labels;
        this.header?.refresh(labels);
        this.updateBiblePreviewBackground();
        this.setPreviewButtonLabel(this.collapsePreviewButtonEl, this.labels.getCollapseAria());
        this.setPreviewButtonLabel(this.closePreviewButtonEl, this.getCloseAriaLabel());
        this.setPreviewButtonLabel(this.openInPanelButtonEl, this.getOpenInPanelAriaLabel());
        this.updateOpenInPanelButtonText();
        this.setCollapsedButtonLabel(this.collapsedButtonEl);
    }

    public containsTarget(target: Node): boolean {
        return this.previewPanelEl.contains(target) || this.collapsedButtonEl.contains(target);
    }

    public isVisible(): boolean {
        // A closed popout window takes the preview elements with it.
        return this.previewText.length > 0
            && this.previewPanelEl.isConnected
            && (this.previewPanelEl.style.display !== "none" || this.collapsedButtonEl.style.display !== "none");
    }

    public canScrollPreview(): boolean {
        return this.previewText.length > 0
            && !this.isPreviewCollapsed
            && this.previewPanelEl.style.display !== "none"
            && this.previewContentEl.scrollHeight > this.previewContentEl.clientHeight;
    }

    public scrollPreview(command: BiblePreviewScrollCommand): boolean {
        if (!this.canScrollPreview()) {
            return false;
        }
        scrollPreviewElement(this.previewContentEl, command);
        return true;
    }

    private createPreviewPanelElement(): HTMLDivElement {
        const panelEl = createDiv({ cls: "bible-preview-floating-panel" });
        panelEl.setCssStyles({ display: "none" });
        this.applyBackgroundColor(panelEl);

        this.buildPreviewHeader(panelEl);

        return panelEl;
    }

    private buildPreviewHeader(panelEl: HTMLElement): void {
        const header = new BiblePreviewHeader(panelEl, this.labels, {
            variant: "floating",
            onCopy: () => this.copyBiblePreviewText(),
            onToggleComparison: () => {
                if (this.previewContent !== null) this.labels.onToggleComparison?.(this.previewContent);
            },
        });
        this.header = header;
        header.el.addEventListener("pointerdown", (event) => this.pointer.startPreviewDrag(event));

        this.openInPanelButtonEl = header.addButton(this.getOpenInPanelButtonIcon(), this.getOpenInPanelAriaLabel(), () => this.handleOpenInPanelButtonClick());
        this.updateOpenInPanelButtonText();
        const collapseButton = header.addButton("▾", this.labels.getCollapseAria(), () => this.collapseBiblePreview(collapseButton));
        this.collapsePreviewButtonEl = collapseButton;
        this.closePreviewButtonEl = header.addButton("×", this.getCloseAriaLabel(), () => this.hide());
        this.closePreviewButtonEl.addClass("bible-preview-floating-close-button");
    }

    private handleOpenInPanelButtonClick(): void {
        if (this.previewContent !== null && this.labels.onOpenInPanel !== undefined) {
            this.labels.onOpenInPanel(this.previewContent);
            this.hide();
        }
    }

    private stopEventPropagation(event: Event): void {
        event.stopPropagation();
    }

    private stopHeaderButtonClick(event: MouseEvent): void {
        event.preventDefault();
        this.stopEventPropagation(event);
    }

    private createCollapsedButtonElement(): HTMLButtonElement {
        const buttonEl = createEl("button", { cls: "bible-preview-floating-collapsed-button" });
        buttonEl.type = "button";
        buttonEl.textContent = "📖";
        buttonEl.setCssStyles({ display: "none" });
        this.applyBackgroundColor(buttonEl);
        this.setCollapsedButtonLabel(buttonEl);
        this.registerCollapsedButtonListeners(buttonEl);
        return buttonEl;
    }

    private setCollapsedButtonLabel(buttonEl: HTMLButtonElement): void {
        buttonEl.setAttribute("aria-label", this.labels.getExpandAria());
        buttonEl.title = this.labels.getExpandAria();
    }

    private registerCollapsedButtonListeners(buttonEl: HTMLButtonElement): void {
        buttonEl.addEventListener("pointerdown", (event) => this.pointer.startCollapsedButtonDrag(event));
        buttonEl.addEventListener("click", (event) => this.handleCollapsedButtonClick(event));
    }

    private handleCollapsedButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        if (this.pointer.consumeCollapsedButtonClickSuppression()) {
            return;
        }
        this.expandBiblePreviewFromCollapsedButton();
    }


    // Desktop: all edges and corners resize. Mobile: only a bottom grip (see styles.css).
    private updateResizeHandleStyles(viewportWidth: number): void {
        this.previewPanelEl.toggleClass("is-mobile-layout", this.isMobilePreviewLayout(viewportWidth));
    }

    private updateBiblePreviewBackground(): void {
        this.applyBackgroundColor(this.previewPanelEl);
        this.applyBackgroundColor(this.collapsedButtonEl);
    }

    private applyBackgroundColor(element: HTMLElement): void {
        element.setCssProps({ "--bible-preview-floating-background": this.labels.getBackgroundColor() });
    }

    private setPreviewButtonLabel(buttonEl: HTMLButtonElement | null, label: string): void {
        if (buttonEl === null) {
            return;
        }
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
    }

    private getCloseAriaLabel(): string {
        return this.labels.getCloseAria?.() ?? "Закрыть окно";
    }

    private getOpenInPanelAriaLabel(): string {
        return this.labels.getOpenInPanelAria?.() ?? "Открыть в панели";
    }

    private getOpenInPanelButtonIcon(): string {
        return this.labels.getOpenInPanelIcon?.() ?? "◨";
    }

    private updateOpenInPanelButtonText(): void {
        if (this.openInPanelButtonEl === null) {
            return;
        }
        setHeaderButtonLabel(this.openInPanelButtonEl, this.getOpenInPanelButtonIcon(), this.getOpenInPanelAriaLabel());
        this.openInPanelButtonEl.toggle(this.labels.onOpenInPanel !== undefined);
    }

    private renderBiblePreview(): void {
        if (this.hidePreviewWhenEmpty()) {
            return;
        }

        if (this.isPreviewCollapsed) {
            this.renderCollapsedPreviewState();
        } else {
            this.renderExpandedPreviewState();
        }

        this.scheduleBiblePreviewPositionUpdate();
    }

    private hidePreviewWhenEmpty(): boolean {
        if (this.previewText.length > 0) {
            return false;
        }
        this.hide();
        return true;
    }

    private renderCollapsedPreviewState(): void {
        this.previewPanelEl.setCssStyles({ display: "none" });
        this.collapsedButtonEl.setCssStyles({ display: "block" });
    }

    private renderExpandedPreviewState(): void {
        this.collapsedButtonEl.setCssStyles({ display: "none" });
        this.previewPanelEl.setCssStyles({ display: "flex" });
    }

    private scheduleBiblePreviewPositionUpdate(): void {
        this.hostWindow.requestAnimationFrame(() => this.updateBiblePreviewPosition());
    }

    private registerListeners(): void {
        const hostWindow = this.hostWindow;
        this.disposables.push(addDisposableEventListener(hostWindow, "resize", this.viewportChangeHandler));
        if (hostWindow.visualViewport !== null) {
            this.disposables.push(addDisposableEventListener(hostWindow.visualViewport, "resize", this.viewportChangeHandler));
            this.disposables.push(addDisposableEventListener(hostWindow.visualViewport, "scroll", this.viewportChangeHandler));
        }
        this.disposables.push(addDisposableEventListener(hostWindow, "pointermove", this.pointerMoveHandler as EventListener));
        this.disposables.push(addDisposableEventListener(hostWindow, "pointerup", this.pointerUpHandler as EventListener));
        this.disposables.push(addDisposableEventListener(hostWindow, "pointercancel", this.pointerUpHandler as EventListener));
        this.disposables.push(addDisposableEventListener(this.hostDocument, "keydown", this.keydownHandler as EventListener, true));
        this.observeWorkspaceResize();
    }

    // Opening or closing a sidebar changes the workspace area without a window resize event.
    private observeWorkspaceResize(): void {
        const rootWorkspaceEl = this.hostDocument.querySelector<HTMLElement>(".workspace-split.mod-root");
        const ResizeObserverCtor = (this.hostWindow as typeof window).ResizeObserver;
        if (rootWorkspaceEl === null || ResizeObserverCtor === undefined) {
            return;
        }
        const observer = new ResizeObserverCtor(this.viewportChangeHandler);
        observer.observe(rootWorkspaceEl);
        this.disposables.push(() => observer.disconnect());
    }

    private unregisterListeners(): void {
        disposeAll(this.disposables);
        this.pointer.reset();
    }

    private handleKeydown(event: KeyboardEvent): void {
        if (event.key !== "Escape" || this.previewText.length === 0) {
            return;
        }
        if (this.isPreviewCollapsed) {
            this.hide();
        } else {
            this.collapseBiblePreview(this.collapsePreviewButtonEl ?? this.previewPanelEl);
        }
        event.preventDefault();
        event.stopPropagation();
    }

    private collapseBiblePreview(anchorEl: HTMLElement): void {
        this.rememberCollapsedExpandAnchorOffset(anchorEl);
        this.rememberCollapsedButtonPosition(anchorEl);
        this.isPreviewCollapsed = true;
        this.renderBiblePreview();
    }

    private expandBiblePreviewFromCollapsedButton(): void {
        this.isPreviewCollapsed = false;
        this.setExpandedPreviewPositionFromCollapsedButton();
        this.renderBiblePreview();
    }

    private setExpandedPreviewPositionFromCollapsedButton(): void {
        const collapsedButtonCenter = this.getCollapsedButtonCenter();
        const viewport = this.getBiblePreviewViewport();
        const panelSize = this.getPreviewPanelSize(viewport.width, viewport.height);
        const anchorOffset = this.collapsedExpandAnchorOffset ?? {
            right: 46,
            top: 17,
        };
        const preferredLeft = collapsedButtonCenter.x - (panelSize.width - anchorOffset.right);
        const preferredTop = collapsedButtonCenter.y - anchorOffset.top;
        this.customPreviewPosition = this.clampBiblePreviewPosition(
            preferredLeft,
            preferredTop,
            panelSize.width,
            panelSize.height,
        );
        this.collapsedButtonPosition = null;
    }

    private getCollapsedButtonCenter(): { x: number; y: number } {
        const rect = this.collapsedButtonEl.getBoundingClientRect();
        if (this.collapsedButtonEl.style.display !== "none" && rect.width > 0 && rect.height > 0) {
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        }
        if (this.collapsedButtonPosition !== null) {
            return {
                x: this.collapsedButtonPosition.left + COLLAPSED_BUTTON_SIZE / 2,
                y: this.collapsedButtonPosition.top + COLLAPSED_BUTTON_SIZE / 2,
            };
        }
        const panelWidth = this.getCurrentPreviewPanelWidth();
        return {
            x: (this.customPreviewPosition?.left ?? 0) + Math.max(COLLAPSED_BUTTON_SIZE / 2, panelWidth - COLLAPSED_BUTTON_SIZE / 2),
            y: (this.customPreviewPosition?.top ?? 0) + COLLAPSED_BUTTON_SIZE / 2,
        };
    }

    private updateBiblePreviewPosition(): void {
        const visibleEl = this.isPreviewCollapsed ? this.collapsedButtonEl : this.previewPanelEl;
        if (this.isPreviewPositionUpdateSkipped(visibleEl)) {
            return;
        }
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);

        if (this.isPreviewCollapsed) {
            this.updateCollapsedButtonPosition(viewport, safeMargins);
            return;
        }

        this.updateExpandedPreviewPosition(viewport, safeMargins);
    }

    private isPreviewPositionUpdateSkipped(visibleEl: HTMLElement): boolean {
        return this.previewText.length === 0 || visibleEl.style.display === "none";
    }

    private updateExpandedPreviewPosition(
        viewport: PreviewViewport,
        safeMargins: PreviewSafeMargins,
    ): void {
        const panelSize = this.getPreviewPanelSize(viewport.width, viewport.height);
        this.applyPreviewSize(panelSize.width, panelSize.height);

        if (this.updateCustomPreviewPosition(panelSize)) {
            return;
        }

        if (this.isMobilePreviewLayout(viewport.width)) {
            this.updateMobilePreviewPosition(viewport, safeMargins, panelSize);
            return;
        }

        this.updateDefaultDesktopPreviewPosition(viewport, safeMargins, panelSize);
    }

    private updateCustomPreviewPosition(panelSize: PreviewSize): boolean {
        if (this.customPreviewPosition === null) {
            return false;
        }
        const clamped = this.clampBiblePreviewPosition(
            this.customPreviewPosition.left,
            this.customPreviewPosition.top,
            panelSize.width,
            panelSize.height,
        );
        this.customPreviewPosition = clamped;
        this.applyPreviewPosition(clamped);
        return true;
    }

    private updateMobilePreviewPosition(
        viewport: PreviewViewport,
        safeMargins: PreviewSafeMargins,
        panelSize: PreviewSize,
    ): void {
        const clamped = this.clampBiblePreviewPosition(
            viewport.left + safeMargins.left,
            viewport.top + safeMargins.top,
            panelSize.width,
            panelSize.height,
        );
        this.applyPreviewPosition(clamped);
    }

    private updateDefaultDesktopPreviewPosition(
        viewport: PreviewViewport,
        safeMargins: PreviewSafeMargins,
        panelSize: PreviewSize,
    ): void {
        const clamped = this.clampBiblePreviewPosition(
            viewport.left + viewport.width - panelSize.width - safeMargins.right,
            viewport.top + viewport.height - panelSize.height - safeMargins.bottom,
            panelSize.width,
            panelSize.height,
        );
        this.applyPreviewPosition(clamped);
    }

    private applyPreviewPosition(position: PreviewPosition): void {
        this.previewPanelEl.style.left = `${position.left}px`;
        this.previewPanelEl.style.top = `${position.top}px`;
    }

    private applyCollapsedButtonPosition(position: PreviewPosition): void {
        this.collapsedButtonEl.style.left = `${position.left}px`;
        this.collapsedButtonEl.style.top = `${position.top}px`;
    }

    private rememberCollapsedExpandAnchorOffset(anchorEl: HTMLElement): void {
        const panelRect = this.previewPanelEl.getBoundingClientRect();
        const anchorRect = anchorEl.getBoundingClientRect();

        if (panelRect.width <= 0 || panelRect.height <= 0) {
            return;
        }

        const anchorCenterX = anchorRect.left + anchorRect.width / 2;
        const anchorCenterY = anchorRect.top + anchorRect.height / 2;

        this.collapsedExpandAnchorOffset = {
            right: panelRect.right - anchorCenterX,
            top: anchorCenterY - panelRect.top,
        };
    }

    private rememberCollapsedButtonPosition(anchorEl: HTMLElement): void {
        const anchorRect = anchorEl.getBoundingClientRect();
        this.collapsedButtonPosition = this.clampBiblePreviewPosition(
            anchorRect.left + anchorRect.width / 2 - COLLAPSED_BUTTON_SIZE / 2,
            anchorRect.top + anchorRect.height / 2 - COLLAPSED_BUTTON_SIZE / 2,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
    }

    private updateCollapsedButtonPosition(
        viewport: PreviewViewport,
        safeMargins: PreviewSafeMargins,
    ): void {
        if (this.updateStoredCollapsedButtonPosition()) {
            return;
        }
        if (this.updateCollapsedButtonPositionFromCustomPreview()) {
            return;
        }
        this.updateDefaultCollapsedButtonPosition(viewport, safeMargins);
    }

    private updateStoredCollapsedButtonPosition(): boolean {
        if (this.collapsedButtonPosition === null) {
            return false;
        }
        const clamped = this.clampBiblePreviewPosition(
            this.collapsedButtonPosition.left,
            this.collapsedButtonPosition.top,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
        this.collapsedButtonPosition = clamped;
        this.applyCollapsedButtonPosition(clamped);
        return true;
    }

    private updateCollapsedButtonPositionFromCustomPreview(): boolean {
        if (this.customPreviewPosition === null) {
            return false;
        }
        const panelWidth = this.getCurrentPreviewPanelWidth();
        const clamped = this.clampBiblePreviewPosition(
            this.customPreviewPosition.left + Math.max(0, panelWidth - COLLAPSED_BUTTON_SIZE),
            this.customPreviewPosition.top,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
        this.applyCollapsedButtonPosition(clamped);
        return true;
    }

    private updateDefaultCollapsedButtonPosition(
        viewport: PreviewViewport,
        safeMargins: PreviewSafeMargins,
    ): void {
        const clamped = this.clampBiblePreviewPosition(
            viewport.left + viewport.width - COLLAPSED_BUTTON_SIZE - safeMargins.right,
            this.isMobilePreviewLayout(viewport.width)
                ? viewport.top + safeMargins.top
                : viewport.top + viewport.height - COLLAPSED_BUTTON_SIZE - safeMargins.bottom,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
        this.applyCollapsedButtonPosition(clamped);
    }

    private getPreviewPanelSize(viewportWidth: number, viewportHeight: number): PreviewSize {
        if (this.isMobilePreviewLayout(viewportWidth)) {
            return this.getMobilePreviewPanelSize(viewportWidth, viewportHeight);
        }

        const customSize = this.getCustomPreviewPanelSize(viewportWidth, viewportHeight);
        if (customSize !== null) {
            return customSize;
        }

        return this.getDefaultDesktopPreviewPanelSize(viewportWidth, viewportHeight);
    }

    private getMobilePreviewPanelSize(viewportWidth: number, viewportHeight: number): PreviewSize {
        const height = this.customPreviewSize?.height ?? DEFAULT_MOBILE_HEIGHT;
        const size = this.clampPreviewSize(this.getMobilePreviewWidth(viewportWidth), height, viewportWidth, viewportHeight);
        this.customPreviewSize = size;
        return size;
    }

    private getCustomPreviewPanelSize(viewportWidth: number, viewportHeight: number): PreviewSize | null {
        if (this.customPreviewSize === null) {
            return null;
        }
        const clampedSize = this.clampPreviewSize(this.customPreviewSize.width, this.customPreviewSize.height, viewportWidth, viewportHeight);
        this.customPreviewSize = clampedSize;
        return clampedSize;
    }

    private getDefaultDesktopPreviewPanelSize(viewportWidth: number, viewportHeight: number): PreviewSize {
        const defaultSize = this.clampPreviewSize(
            this.getDefaultDesktopPreviewWidth(viewportWidth),
            DEFAULT_DESKTOP_HEIGHT,
            viewportWidth,
            viewportHeight,
        );
        this.customPreviewSize = defaultSize;
        return defaultSize;
    }

    private getDefaultDesktopPreviewWidth(viewportWidth: number): number {
        return Math.min(720, Math.max(320, Math.min(DEFAULT_DESKTOP_WIDTH, viewportWidth * 0.42)));
    }

    private applyPreviewSize(width: number, height: number): void {
        const viewport = this.getBiblePreviewViewport();
        this.applyPreviewPanelDimensions(width, height);
        this.applyPreviewContentMaxHeight(height);
        this.updateResizeHandleStyles(viewport.width);
    }

    private applyPreviewPanelDimensions(width: number, height: number): void {
        this.previewPanelEl.style.width = `${width}px`;
        this.previewPanelEl.style.height = `${height}px`;
        this.previewPanelEl.style.maxHeight = `${height}px`;
    }

    private applyPreviewContentMaxHeight(height: number): void {
        this.previewContentEl.style.maxHeight = `${Math.max(78, height - HEADER_HEIGHT)}px`;
    }

    private getExpandedPreviewPositionForAnchor(anchorEl: HTMLElement): PreviewPosition {
        const viewport = this.getBiblePreviewViewport();
        const rect = anchorEl.getBoundingClientRect();
        const panelSize = this.getPreviewPanelSize(viewport.width, viewport.height);
        return this.clampBiblePreviewPosition(rect.left, rect.bottom + 6, panelSize.width, panelSize.height);
    }

    private getCurrentPreviewPanelWidth(): number {
        const parsedWidth = Number.parseFloat(this.previewPanelEl.style.width);
        return Number.isFinite(parsedWidth) && parsedWidth > 0
            ? parsedWidth
            : Math.max(MIN_WIDTH, this.previewPanelEl.offsetWidth);
    }

    private getMobilePreviewWidth(viewportWidth: number): number {
        return Math.max(MIN_WIDTH, viewportWidth - 16);
    }

    private clampPreviewSize(width: number, height: number, viewportWidth: number, viewportHeight: number): PreviewSize {
        const bounds = this.getPreviewSizeBounds(viewportWidth, viewportHeight);
        return {
            width: Math.min(Math.max(width, MIN_WIDTH), bounds.maxWidth),
            height: Math.min(Math.max(height, MIN_HEIGHT), bounds.maxHeight),
        };
    }

    private getPreviewSizeBounds(viewportWidth: number, viewportHeight: number): PreviewSizeBounds {
        const safeMargins = this.getBiblePreviewSafeMargins(viewportWidth);
        return {
            maxWidth: Math.max(MIN_WIDTH, viewportWidth - safeMargins.left - safeMargins.right),
            maxHeight: Math.max(MIN_HEIGHT, viewportHeight - safeMargins.top - safeMargins.bottom),
        };
    }

    private clampBiblePreviewPosition(left: number, top: number, width: number, height: number): PreviewPosition {
        const bounds = this.getPreviewPositionBounds(width, height);
        return {
            left: clampNumber(left, bounds.minLeft, bounds.maxLeft),
            top: clampNumber(top, bounds.minTop, bounds.maxTop),
        };
    }

    private getPreviewPositionBounds(width: number, height: number): PreviewPositionBounds {
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);
        const minLeft = viewport.left + safeMargins.left;
        const minTop = viewport.top + safeMargins.top;
        return {
            minLeft,
            maxLeft: Math.max(minLeft, viewport.left + viewport.width - width - safeMargins.right),
            minTop,
            maxTop: Math.max(minTop, viewport.top + viewport.height - height - safeMargins.bottom),
        };
    }

    private getBiblePreviewViewport(): PreviewViewport {
        return this.getWorkspacePreviewViewport() ?? this.getWindowPreviewViewport();
    }

    private getWorkspacePreviewViewport(): PreviewViewport | null {
        const rootWorkspaceEl = this.hostDocument.querySelector<HTMLElement>(".workspace-split.mod-root");
        if (rootWorkspaceEl === null) {
            return null;
        }
        const rect = rootWorkspaceEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        };
    }

    private getWindowPreviewViewport(): PreviewViewport {
        const hostWindow = this.hostWindow;
        const viewport = hostWindow.visualViewport;
        return {
            left: viewport?.offsetLeft ?? 0,
            top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? hostWindow.innerWidth,
            height: viewport?.height ?? hostWindow.innerHeight,
        };
    }

    private getBiblePreviewSafeMargins(viewportWidth: number): PreviewSafeMargins {
        return this.isMobilePreviewLayout(viewportWidth)
            ? this.getMobilePreviewSafeMargins()
            : this.getDefaultPreviewSafeMargins();
    }

    private getMobilePreviewSafeMargins(): PreviewSafeMargins {
        return {
            top: Platform.isAndroidApp ? MOBILE_SAFE_TOP_ANDROID : MOBILE_SAFE_TOP_DEFAULT,
            right: MOBILE_SAFE_SIDE,
            bottom: MOBILE_SAFE_BOTTOM,
            left: MOBILE_SAFE_SIDE,
        };
    }

    private getDefaultPreviewSafeMargins(): PreviewSafeMargins {
        return {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        };
    }

    // Phone/tablet only: on desktop a narrow workspace (e.g. with sidebars open) keeps all resize handles.
    private isMobilePreviewLayout(viewportWidth: number): boolean {
        return Platform.isMobile && viewportWidth < 700;
    }

    private async copyBiblePreviewText(): Promise<boolean> {
        if (this.previewText.length === 0) {
            return false;
        }
        try {
            await navigator.clipboard.writeText(this.previewText);
            this.showCopyNotice();
            return true;
        } catch (error) {
            console.error("Bible Reference Preview: failed to copy preview text", error);
            return false;
        }
    }

    private showCopyNotice(): void {
        new Notice(this.labels.getCopyNoticeText(), 2500);
    }

}
