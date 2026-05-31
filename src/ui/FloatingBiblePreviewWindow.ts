import { Notice, Platform } from "obsidian";
import { BiblePreviewContent, BiblePreviewReferenceBlock, renderBiblePreviewContent } from "../application/formatBibleTexts";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import { renderComparisonTranslationSelector as renderComparisonTranslationSelectorView } from "./ComparisonTranslationSelector";

export type FloatingBiblePreviewAnchor =
    | { type: "default" }
    | { type: "element"; element: HTMLElement };

export type FloatingBiblePreviewScrollCommand = "page-up" | "page-down" | "top" | "bottom";

export type FloatingBiblePreviewWindowInput = {
    getTitle(): string;
    getCopyNoticeText(): string;
    getCopyAria(): string;
    getCollapseAria(): string;
    getExpandAria(): string;
    getBackgroundColor(): string;
    getFindUsagesButtonText?(): string;
    getFindUsagesButtonAria?(block: BiblePreviewReferenceBlock): string;
    onFindUsages?(block: BiblePreviewReferenceBlock): void;
    getComparisonButtonText?(): string;
    getComparisonButtonAria?(): string;
    getComparisonTranslationsTitle?(): string;
    getComparisonTranslations?(): PreviewComparisonTranslationOption[];
    onToggleComparisonTranslation?(translationId: string, enabled: boolean): void;
    onToggleComparison?(content: BiblePreviewContent): void;
    getCloseAria?(): string;
    getOpenInPanelAria?(): string;
    getOpenInPanelIcon?(): string;
    onOpenInPanel?(content: BiblePreviewContent): void;
};

type PreviewResizeEdge =
    | "top"
    | "right"
    | "bottom"
    | "left"
    | "top-left"
    | "top-right"
    | "bottom-right"
    | "bottom-left";

type PreviewPosition = { left: number; top: number };
type PreviewSize = { width: number; height: number };
type PreviewViewport = { left: number; top: number; width: number; height: number };
type PreviewSafeMargins = { top: number; right: number; bottom: number; left: number };
type PreviewBounds = { left: number; top: number; right: number; bottom: number };
type PreviewSizeBounds = { maxWidth: number; maxHeight: number };
type PreviewPositionBounds = { minLeft: number; maxLeft: number; minTop: number; maxTop: number };
type PreviewPointerDelta = { x: number; y: number };
type PreviewResizeStartEdges = { right: number; bottom: number };
type PreviewResizeResult = PreviewPosition & PreviewSize;
type PreviewDragState = {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
};
type CollapsedButtonDragState = PreviewDragState & { moved: boolean };
type PreviewResizeState = {
    pointerId: number;
    edge: PreviewResizeEdge;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
};

const COLLAPSED_BUTTON_SIZE = 42;
const HEADER_HEIGHT = 34;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 140;
const DEFAULT_DESKTOP_WIDTH = 430;
const DEFAULT_DESKTOP_HEIGHT = 320;
const DEFAULT_MOBILE_HEIGHT = 220;
const EDGE_SIZE = 8;
const CORNER_SIZE = 16;
const MOBILE_HANDLE_HEIGHT = 22;
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
    private previewTitleEl: HTMLDivElement | null = null;
    private comparisonSelectorEl: HTMLDivElement | null = null;
    private copyPreviewButtonEl: HTMLButtonElement | null = null;
    private comparisonPreviewButtonEl: HTMLButtonElement | null = null;
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
    private collapsedButtonDragState: CollapsedButtonDragState | null = null;
    private previewDragState: PreviewDragState | null = null;
    private previewResizeState: PreviewResizeState | null = null;
    private suppressCollapsedButtonClick = false;
    private readonly disposables: Disposable[] = [];

    private readonly viewportChangeHandler = () => this.updateBiblePreviewPosition();
    private readonly pointerMoveHandler = (event: PointerEvent) => this.handlePointerMove(event);
    private readonly pointerUpHandler = (event: PointerEvent) => this.handlePointerUp(event);
    private readonly keydownHandler = (event: KeyboardEvent) => this.handleKeydown(event);

    constructor(private labels: FloatingBiblePreviewWindowInput) {
        this.previewPanelEl = this.createPreviewPanelElement();
        this.previewContentEl = this.previewPanelEl.createDiv();
        this.resizeHandleEls = this.createResizeHandleElements();
        this.collapsedButtonEl = this.createCollapsedButtonElement();

        document.body.appendChild(this.previewPanelEl);
        document.body.appendChild(this.collapsedButtonEl);
        this.configurePreviewContentElement();
        for (const handleEl of this.resizeHandleEls) {
            this.previewPanelEl.appendChild(handleEl);
        }
        this.registerListeners();
    }

    public show(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        const shouldReveal = options.reveal !== false;
        const wasVisible = this.isVisible();
        this.previewContent = content;
        this.previewText = content.plainText;
        renderBiblePreviewContent(this.previewContentEl, content, {
            getFindUsagesButtonText: this.labels.getFindUsagesButtonText,
            getFindUsagesButtonAria: this.labels.getFindUsagesButtonAria,
            onFindUsages: this.labels.onFindUsages,
        });
        this.renderComparisonTranslationSelector();
        this.updateBiblePreviewTitle();

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
    }

    public getContent(): BiblePreviewContent | null {
        return this.previewContent;
    }

    public hide(resetPosition = false): void {
        this.previewContent = null;
        this.previewText = "";
        this.previewPanelEl.style.display = "none";
        this.collapsedButtonEl.style.display = "none";

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

    public destroy(): void {
        this.unregisterListeners();
        this.previewPanelEl.remove();
        this.collapsedButtonEl.remove();
    }

    public refreshLabels(labels: FloatingBiblePreviewWindowInput): void {
        this.labels = labels;
        this.updateBiblePreviewTitle();
        this.updateBiblePreviewBackground();
        this.setPreviewButtonLabel(this.copyPreviewButtonEl, this.labels.getCopyAria());
        this.updateComparisonButtonText();
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
        return this.previewText.length > 0
            && (this.previewPanelEl.style.display !== "none" || this.collapsedButtonEl.style.display !== "none");
    }

    public canScrollPreview(): boolean {
        return this.previewText.length > 0
            && !this.isPreviewCollapsed
            && this.previewPanelEl.style.display !== "none"
            && this.previewContentEl.scrollHeight > this.previewContentEl.clientHeight;
    }

    public scrollPreview(command: FloatingBiblePreviewScrollCommand): boolean {
        if (!this.canScrollPreview()) {
            return false;
        }

        const delta = Math.max(120, this.previewContentEl.clientHeight * 0.8);
        switch (command) {
            case "page-down":
                this.previewContentEl.scrollTop += delta;
                return true;
            case "page-up":
                this.previewContentEl.scrollTop -= delta;
                return true;
            case "top":
                this.previewContentEl.scrollTop = 0;
                return true;
            case "bottom":
                this.previewContentEl.scrollTop = this.previewContentEl.scrollHeight;
                return true;
        }
    }

    private createPreviewPanelElement(): HTMLDivElement {
        const panelEl = document.createElement("div");
        this.stylePreviewPanel(panelEl);

        this.buildPreviewHeader(panelEl);

        return panelEl;
    }

    private stylePreviewPanel(panelEl: HTMLElement): void {
        this.setStyles(panelEl, {
            position: "fixed",
            display: "none",
            flexDirection: "column",
            boxSizing: "border-box",
            zIndex: "1000",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            background: this.labels.getBackgroundColor(),
            color: "var(--text-normal)",
            boxShadow: "0 12px 34px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.04) inset",
            overflow: "hidden",
            minWidth: `${MIN_WIDTH}px`,
            minHeight: `${MIN_HEIGHT}px`,
            pointerEvents: "auto",
        });
    }

    private buildPreviewHeader(panelEl: HTMLElement): void {
        const headerEl = panelEl.createDiv();
        this.stylePreviewHeader(headerEl);
        headerEl.addEventListener("pointerdown", (event) => this.startBiblePreviewDrag(event));

        this.buildPreviewTitle(headerEl);
        this.buildComparisonSelectorHost(headerEl);
        this.buildCopyPreviewButton(headerEl);
        this.buildComparisonPreviewButton(headerEl);
        this.buildOpenInPanelButton(headerEl);
        this.buildCollapsePreviewButton(headerEl);
        this.buildClosePreviewButton(headerEl);
    }

    private stylePreviewHeader(headerEl: HTMLElement): void {
        this.setStyles(headerEl, {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minHeight: "26px",
            flex: "0 0 auto",
            padding: "4px 6px",
            borderBottom: "1px solid var(--background-modifier-border)",
            background: "color-mix(in srgb, var(--background-secondary-alt) 92%, black 8%)",
            cursor: "move",
            touchAction: "none",
        });
    }

    private buildPreviewTitle(headerEl: HTMLElement): void {
        const titleEl = headerEl.createDiv({ text: this.labels.getTitle() });
        this.previewTitleEl = titleEl;
        this.stylePreviewTitle(titleEl);
    }

    private stylePreviewTitle(titleEl: HTMLElement): void {
        this.setStyles(titleEl, {
            flex: "1",
            minWidth: "0",
            fontWeight: "600",
            fontSize: "12px",
            lineHeight: "1.2",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        });
    }

    private buildComparisonSelectorHost(headerEl: HTMLElement): void {
        const comparisonSelectorEl = headerEl.createDiv();
        this.comparisonSelectorEl = comparisonSelectorEl;
        this.styleComparisonSelectorHost(comparisonSelectorEl);
        comparisonSelectorEl.addEventListener("pointerdown", (event) => event.stopPropagation());
        comparisonSelectorEl.addEventListener("click", (event) => event.stopPropagation());
    }

    private styleComparisonSelectorHost(comparisonSelectorEl: HTMLElement): void {
        this.setStyles(comparisonSelectorEl, {
            flex: "1 1 auto",
            minWidth: "0",
        });
    }

    private buildCopyPreviewButton(headerEl: HTMLElement): void {
        const copyButton = this.createPreviewIconButton("📋", this.labels.getCopyAria());
        this.copyPreviewButtonEl = copyButton;
        this.stopHeaderButtonDrag(copyButton);
        copyButton.addEventListener("click", (event) => this.handleCopyPreviewButtonClick(event));
        headerEl.appendChild(copyButton);
    }

    private buildComparisonPreviewButton(headerEl: HTMLElement): void {
        const comparisonButton = this.createPreviewIconButton("⇄", this.getComparisonAriaLabel());
        this.comparisonPreviewButtonEl = comparisonButton;
        this.updateComparisonButtonText();
        this.stopHeaderButtonDrag(comparisonButton);
        comparisonButton.addEventListener("click", (event) => this.handleComparisonPreviewButtonClick(event));
        headerEl.appendChild(comparisonButton);
    }

    private buildOpenInPanelButton(headerEl: HTMLElement): void {
        const openInPanelButton = this.createPreviewIconButton("◨", this.getOpenInPanelAriaLabel());
        this.openInPanelButtonEl = openInPanelButton;
        this.updateOpenInPanelButtonText();
        this.stopHeaderButtonDrag(openInPanelButton);
        openInPanelButton.addEventListener("click", (event) => this.handleOpenInPanelButtonClick(event));
        headerEl.appendChild(openInPanelButton);
    }

    private buildCollapsePreviewButton(headerEl: HTMLElement): void {
        const collapseButton = this.createPreviewIconButton("▾", this.labels.getCollapseAria());
        this.collapsePreviewButtonEl = collapseButton;
        this.stopHeaderButtonDrag(collapseButton);
        collapseButton.addEventListener("click", (event) => this.handleCollapsePreviewButtonClick(event, collapseButton));
        headerEl.appendChild(collapseButton);
    }

    private buildClosePreviewButton(headerEl: HTMLElement): void {
        const closeButton = this.createPreviewIconButton("×", this.getCloseAriaLabel());
        this.closePreviewButtonEl = closeButton;
        this.styleClosePreviewButton(closeButton);
        this.stopHeaderButtonDrag(closeButton);
        closeButton.addEventListener("click", (event) => this.handleClosePreviewButtonClick(event));
        headerEl.appendChild(closeButton);
    }

    private handleCopyPreviewButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        void this.copyBiblePreviewText();
    }

    private handleComparisonPreviewButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        if (this.previewContent !== null && this.labels.onToggleComparison !== undefined) {
            this.labels.onToggleComparison(this.previewContent);
        }
    }

    private handleOpenInPanelButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        if (this.previewContent !== null && this.labels.onOpenInPanel !== undefined) {
            this.labels.onOpenInPanel(this.previewContent);
            this.hide();
        }
    }

    private handleCollapsePreviewButtonClick(event: MouseEvent, collapseButton: HTMLButtonElement): void {
        this.stopHeaderButtonClick(event);
        this.collapseBiblePreview(collapseButton);
    }

    private handleClosePreviewButtonClick(event: MouseEvent): void {
        this.stopHeaderButtonClick(event);
        this.hide();
    }

    private stopHeaderButtonClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    private styleClosePreviewButton(closeButton: HTMLButtonElement): void {
        closeButton.style.fontSize = "18px";
        closeButton.style.fontWeight = "700";
    }

    private stopHeaderButtonDrag(buttonEl: HTMLElement): void {
        buttonEl.addEventListener("pointerdown", (event) => event.stopPropagation());
    }

    private configurePreviewContentElement(): void {
        this.stylePreviewContentElement(this.previewContentEl);
    }

    private stylePreviewContentElement(contentEl: HTMLElement): void {
        this.setStyles(contentEl, {
            flex: "1 1 auto",
            minHeight: "0",
            padding: "8px 10px 18px",
            whiteSpace: "pre-wrap",
            overflow: "auto",
            userSelect: "text",
            lineHeight: "1.45",
            fontSize: "var(--font-text-size)",
        });
    }

    private createCollapsedButtonElement(): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.textContent = "📖";
        this.setCollapsedButtonLabel(buttonEl);
        this.styleCollapsedButton(buttonEl);
        this.registerCollapsedButtonListeners(buttonEl);
        return buttonEl;
    }

    private setCollapsedButtonLabel(buttonEl: HTMLButtonElement): void {
        buttonEl.setAttribute("aria-label", this.labels.getExpandAria());
        buttonEl.title = this.labels.getExpandAria();
    }

    private styleCollapsedButton(buttonEl: HTMLButtonElement): void {
        this.setStyles(buttonEl, {
            position: "fixed",
            display: "none",
            zIndex: "1000",
            width: `${COLLAPSED_BUTTON_SIZE}px`,
            height: `${COLLAPSED_BUTTON_SIZE}px`,
            borderRadius: "999px",
            border: "1px solid var(--background-modifier-border)",
            background: this.labels.getBackgroundColor(),
            color: "var(--text-normal)",
            boxShadow: "0 8px 22px rgba(0, 0, 0, 0.36)",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            fontSize: "20px",
            lineHeight: "1",
            padding: "0",
        });
    }

    private registerCollapsedButtonListeners(buttonEl: HTMLButtonElement): void {
        buttonEl.addEventListener("pointerdown", (event) => this.startCollapsedButtonDrag(event));
        buttonEl.addEventListener("click", (event) => this.handleCollapsedButtonClick(event));
    }

    private handleCollapsedButtonClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        if (this.suppressCollapsedButtonClick) {
            this.suppressCollapsedButtonClick = false;
            return;
        }
        this.expandBiblePreviewFromCollapsedButton();
    }

    private createPreviewIconButton(text: string, label: string): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.textContent = text;
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
        this.stylePreviewIconButton(buttonEl);
        return buttonEl;
    }

    private stylePreviewIconButton(buttonEl: HTMLButtonElement): void {
        this.setStyles(buttonEl, {
            width: "24px",
            height: "24px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "5px",
            border: "1px solid var(--background-modifier-border)",
            background: "color-mix(in srgb, var(--background-secondary) 94%, black 6%)",
            color: "var(--text-normal)",
            cursor: "pointer",
            fontSize: "13px",
            lineHeight: "1",
            padding: "0",
        });
    }

    private createResizeHandleElements(): HTMLDivElement[] {
        return this.getResizeHandleEdges().map((edge) => this.createResizeHandleElement(edge));
    }

    private getResizeHandleEdges(): PreviewResizeEdge[] {
        return [
            "top",
            "right",
            "bottom",
            "left",
            "top-left",
            "top-right",
            "bottom-right",
            "bottom-left",
        ];
    }

    private createResizeHandleElement(edge: PreviewResizeEdge): HTMLDivElement {
        const handleEl = document.createElement("div");
        this.setResizeHandleMetadata(handleEl, edge);
        this.styleResizeHandleBase(handleEl, edge);
        this.applyDesktopResizeHandleStyle(handleEl, edge);
        this.registerResizeHandleListeners(handleEl, edge);
        return handleEl;
    }

    private setResizeHandleMetadata(handleEl: HTMLDivElement, edge: PreviewResizeEdge): void {
        handleEl.dataset.resizeEdge = edge;
        handleEl.setAttribute("aria-hidden", "true");
    }

    private styleResizeHandleBase(handleEl: HTMLDivElement, edge: PreviewResizeEdge): void {
        this.setStyles(handleEl, {
            position: "absolute",
            boxSizing: "border-box",
            zIndex: this.isCornerResizeEdge(edge) ? "3" : "2",
            touchAction: "none",
            background: "transparent",
        });
    }

    private registerResizeHandleListeners(handleEl: HTMLDivElement, edge: PreviewResizeEdge): void {
        handleEl.addEventListener("pointerdown", (event) => this.startBiblePreviewResize(event, edge));
    }

    private applyDesktopResizeHandleStyle(handleEl: HTMLDivElement, edge: PreviewResizeEdge): void {
        this.setStyles(handleEl, {
            display: "block",
            left: "",
            right: "",
            top: "",
            bottom: "",
            width: "",
            height: "",
            cursor: this.getResizeCursor(edge),
            background: this.isCornerResizeEdge(edge)
                ? "radial-gradient(circle at center, color-mix(in srgb, var(--color-accent) 68%, transparent) 0 1px, transparent 2px)"
                : "transparent",
            backgroundSize: "5px 5px",
            backgroundRepeat: "repeat",
            backgroundPosition: "initial",
        });

        if (edge === "top" || edge === "bottom") {
            this.setStyles(handleEl, {
                left: `${CORNER_SIZE}px`,
                right: `${CORNER_SIZE}px`,
                [edge]: "0",
                height: `${EDGE_SIZE}px`,
            });
            return;
        }
        if (edge === "left" || edge === "right") {
            this.setStyles(handleEl, {
                [edge]: "0",
                top: `${CORNER_SIZE}px`,
                bottom: `${CORNER_SIZE}px`,
                width: `${EDGE_SIZE}px`,
            });
            return;
        }

        const [vertical, horizontal] = edge.split("-") as ["top" | "bottom", "left" | "right"];
        this.setStyles(handleEl, {
            [vertical]: "0",
            [horizontal]: "0",
            width: `${CORNER_SIZE}px`,
            height: `${CORNER_SIZE}px`,
        });
    }

    private applyMobileResizeHandleStyle(handleEl: HTMLDivElement, edge: PreviewResizeEdge): void {
        if (edge !== "bottom") {
            handleEl.style.display = "none";
            return;
        }
        this.setStyles(handleEl, {
            display: "block",
            left: "0",
            right: "0",
            top: "",
            bottom: "0",
            width: "auto",
            height: `${MOBILE_HANDLE_HEIGHT}px`,
            cursor: "ns-resize",
            background: "linear-gradient(to bottom, transparent 0 7px, color-mix(in srgb, var(--color-accent) 55%, transparent) 8px 10px, transparent 11px)",
            backgroundSize: "64px 18px",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
        });
    }

    private updateResizeHandleStyles(viewportWidth: number): void {
        for (const handleEl of this.resizeHandleEls) {
            const edge = handleEl.dataset.resizeEdge as PreviewResizeEdge | undefined;
            if (edge === undefined) {
                continue;
            }
            if (this.isMobilePreviewLayout(viewportWidth)) {
                this.applyMobileResizeHandleStyle(handleEl, edge);
            } else {
                this.applyDesktopResizeHandleStyle(handleEl, edge);
            }
        }
    }

    private isCornerResizeEdge(edge: PreviewResizeEdge): boolean {
        return edge.includes("-");
    }

    private getResizeCursor(edge: PreviewResizeEdge): string {
        switch (edge) {
            case "top":
            case "bottom":
                return "ns-resize";
            case "left":
            case "right":
                return "ew-resize";
            case "top-left":
            case "bottom-right":
                return "nwse-resize";
            case "top-right":
            case "bottom-left":
                return "nesw-resize";
        }
    }

    private updateBiblePreviewTitle(): void {
        if (this.previewTitleEl !== null) {
            this.previewTitleEl.textContent = this.labels.getTitle();
        }
    }

    private updateBiblePreviewBackground(): void {
        this.previewPanelEl.style.background = this.labels.getBackgroundColor();
        this.collapsedButtonEl.style.background = this.labels.getBackgroundColor();
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

    private getComparisonAriaLabel(): string {
        return this.labels.getComparisonButtonAria?.() ?? this.labels.getComparisonButtonText?.() ?? "Compare translations";
    }

    private updateComparisonButtonText(): void {
        if (this.comparisonPreviewButtonEl === null) {
            return;
        }
        this.comparisonPreviewButtonEl.textContent = this.labels.getComparisonButtonText?.() ?? "⇄";
        this.comparisonPreviewButtonEl.setAttribute("aria-label", this.getComparisonAriaLabel());
        this.comparisonPreviewButtonEl.title = this.getComparisonAriaLabel();
        this.comparisonPreviewButtonEl.style.display = this.labels.onToggleComparison === undefined ? "none" : "inline-flex";
    }

    private renderComparisonTranslationSelector(): void {
        const hostEl = this.comparisonSelectorEl;
        if (hostEl === null) {
            return;
        }

        hostEl.replaceChildren();
        const options = this.labels.getComparisonTranslations?.() ?? [];
        if (options.length <= 1 || this.labels.onToggleComparisonTranslation === undefined) {
            hostEl.style.display = "none";
            if (this.previewTitleEl !== null) {
                this.previewTitleEl.style.display = "block";
            }
            return;
        }

        hostEl.style.display = "block";
        if (this.previewTitleEl !== null) {
            this.previewTitleEl.style.display = "none";
        }
        hostEl.appendChild(renderComparisonTranslationSelectorView({
            options,
            getTitle: () => this.labels.getComparisonTranslationsTitle?.() ?? "Compare:",
            onToggleTranslation: (translationId, enabled) => this.labels.onToggleComparisonTranslation?.(translationId, enabled),
        }));
    }

    private updateOpenInPanelButtonText(): void {
        if (this.openInPanelButtonEl === null) {
            return;
        }
        this.openInPanelButtonEl.textContent = this.getOpenInPanelButtonIcon();
        this.openInPanelButtonEl.style.display = this.labels.onOpenInPanel === undefined ? "none" : "inline-flex";
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
        this.previewPanelEl.style.display = "none";
        this.collapsedButtonEl.style.display = "block";
    }

    private renderExpandedPreviewState(): void {
        this.collapsedButtonEl.style.display = "none";
        this.previewPanelEl.style.display = "flex";
    }

    private scheduleBiblePreviewPositionUpdate(): void {
        window.requestAnimationFrame(() => this.updateBiblePreviewPosition());
    }

    private registerListeners(): void {
        this.disposables.push(addDisposableEventListener(window, "resize", this.viewportChangeHandler));
        if (window.visualViewport !== null) {
            this.disposables.push(addDisposableEventListener(window.visualViewport, "resize", this.viewportChangeHandler));
            this.disposables.push(addDisposableEventListener(window.visualViewport, "scroll", this.viewportChangeHandler));
        }
        this.disposables.push(addDisposableEventListener(window, "pointermove", this.pointerMoveHandler as EventListener));
        this.disposables.push(addDisposableEventListener(window, "pointerup", this.pointerUpHandler as EventListener));
        this.disposables.push(addDisposableEventListener(window, "pointercancel", this.pointerUpHandler as EventListener));
        this.disposables.push(addDisposableEventListener(document, "keydown", this.keydownHandler as EventListener, true));
    }

    private unregisterListeners(): void {
        disposeAll(this.disposables);
        this.collapsedButtonDragState = null;
        this.previewDragState = null;
        this.previewResizeState = null;
        this.collapsedButtonEl.style.cursor = "grab";
        this.endPreviewPointerInteraction();
    }

    private beginPreviewPointerInteraction(): void {
        document.body.style.userSelect = "none";
    }

    private endPreviewPointerInteraction(): void {
        document.body.style.userSelect = "";
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

    private startBiblePreviewDrag(event: PointerEvent): void {
        if (!this.canStartExpandedPreviewPointerInteraction(event)) {
            return;
        }
        const start = this.getCurrentExpandedPreviewInteractionStart();
        this.previewDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: start.position.left,
            startTop: start.position.top,
        };
        this.beginPreviewPointerInteraction();
        this.preventPreviewPointerDefault(event);
    }

    private startBiblePreviewResize(event: PointerEvent, edge: PreviewResizeEdge): void {
        if (!this.canStartExpandedPreviewPointerInteraction(event)) {
            return;
        }
        const start = this.getCurrentExpandedPreviewInteractionStart();
        this.previewResizeState = {
            pointerId: event.pointerId,
            edge,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: start.position.left,
            startTop: start.position.top,
            startWidth: start.rect.width,
            startHeight: start.rect.height,
        };
        this.beginPreviewPointerInteraction();
        this.stopPreviewPointerEvent(event);
    }

    private getCurrentExpandedPreviewInteractionStart(): {
        rect: DOMRect;
        position: PreviewPosition;
    } {
        const rect = this.previewPanelEl.getBoundingClientRect();
        const position = this.clampBiblePreviewPosition(rect.left, rect.top, rect.width, rect.height);
        this.customPreviewPosition = position;
        return { rect, position };
    }

    private startCollapsedButtonDrag(event: PointerEvent): void {
        if (!this.canStartCollapsedButtonPointerInteraction(event)) {
            return;
        }
        const rect = this.collapsedButtonEl.getBoundingClientRect();
        this.collapsedButtonDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            moved: false,
        };
        this.suppressCollapsedButtonClick = false;
        this.collapsedButtonEl.style.cursor = "grabbing";
        this.beginPreviewPointerInteraction();
        this.stopPreviewPointerEvent(event);
    }

    private canStartExpandedPreviewPointerInteraction(event: PointerEvent): boolean {
        return event.button === 0
            && this.previewText.length > 0
            && !this.isPreviewCollapsed;
    }

    private canStartCollapsedButtonPointerInteraction(event: PointerEvent): boolean {
        return event.button === 0
            && this.previewText.length > 0
            && this.isPreviewCollapsed;
    }

    private preventPreviewPointerDefault(event: PointerEvent): void {
        event.preventDefault();
    }

    private stopPreviewPointerEvent(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
    }

    private handlePointerMove(event: PointerEvent): void {
        if (this.previewResizeState !== null) {
            this.resizeBiblePreview(event);
            return;
        }
        this.dragBiblePreview(event);
    }

    private dragBiblePreview(event: PointerEvent): void {
        if (this.collapsedButtonDragState !== null) {
            this.dragCollapsedButton(event);
            return;
        }
        if (this.previewDragState === null || event.pointerId !== this.previewDragState.pointerId) {
            return;
        }
        const position = this.getDraggedPreviewPosition(event, this.previewDragState);
        this.applyPreviewDragPosition(position);
        this.preventPreviewPointerDefault(event);
    }

    private getDraggedPreviewPosition(event: PointerEvent, state: PreviewDragState): PreviewPosition {
        return this.clampBiblePreviewPosition(
            state.startLeft + event.clientX - state.startClientX,
            state.startTop + event.clientY - state.startClientY,
            this.previewPanelEl.offsetWidth,
            this.previewPanelEl.offsetHeight,
        );
    }

    private applyPreviewDragPosition(position: PreviewPosition): void {
        this.customPreviewPosition = position;
        this.applyPreviewPosition(position);
    }

    private resizeBiblePreview(event: PointerEvent): void {
        if (this.previewResizeState === null || event.pointerId !== this.previewResizeState.pointerId) {
            return;
        }

        const state = this.previewResizeState;
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);
        const resizeResult = this.getPreviewResizeResult(event, state, viewport, safeMargins);
        this.applyPreviewResizeResult(resizeResult);
        this.stopPreviewPointerEvent(event);
    }

    private getPreviewResizeResult(
        event: PointerEvent,
        state: PreviewResizeState,
        viewport: PreviewViewport,
        safeMargins: PreviewSafeMargins,
    ): PreviewResizeResult {
        const bounds = this.getPreviewResizeBounds(viewport, safeMargins);
        const delta = this.getPreviewPointerDelta(event, state);
        const startEdges = this.getPreviewResizeStartEdges(state);
        let nextLeft = state.startLeft;
        let nextTop = state.startTop;
        let nextRight = startEdges.right;
        let nextBottom = startEdges.bottom;

        if (!this.isMobilePreviewLayout(viewport.width)) {
            if (this.resizesLeft(state.edge)) {
                nextLeft = this.clampNumber(state.startLeft + delta.x, bounds.left, startEdges.right - MIN_WIDTH);
            }
            if (this.resizesRight(state.edge)) {
                nextRight = this.clampNumber(startEdges.right + delta.x, state.startLeft + MIN_WIDTH, bounds.right);
            }
            if (this.resizesTop(state.edge)) {
                nextTop = this.clampNumber(state.startTop + delta.y, bounds.top, startEdges.bottom - MIN_HEIGHT);
            }
        }

        if (this.resizesBottom(state.edge) || this.isMobilePreviewLayout(viewport.width)) {
            nextBottom = this.clampNumber(startEdges.bottom + delta.y, state.startTop + MIN_HEIGHT, bounds.bottom);
        }

        if (this.isMobilePreviewLayout(viewport.width)) {
            const mobileWidth = this.getMobilePreviewWidth(viewport.width);
            nextLeft = this.clampBiblePreviewPosition(state.startLeft, state.startTop, mobileWidth, nextBottom - state.startTop).left;
            nextRight = nextLeft + mobileWidth;
            nextTop = state.startTop;
        }

        return {
            left: nextLeft,
            top: nextTop,
            width: Math.max(nextRight - nextLeft, MIN_WIDTH),
            height: Math.max(nextBottom - nextTop, MIN_HEIGHT),
        };
    }

    private applyPreviewResizeResult(result: PreviewResizeResult): void {
        this.customPreviewPosition = { left: result.left, top: result.top };
        this.customPreviewSize = { width: result.width, height: result.height };
        this.applyPreviewSize(result.width, result.height);
        this.applyPreviewPosition({ left: result.left, top: result.top });
    }

    private getPreviewResizeBounds(viewport: PreviewViewport, safeMargins: PreviewSafeMargins): PreviewBounds {
        return {
            left: viewport.left + safeMargins.left,
            top: viewport.top + safeMargins.top,
            right: viewport.left + viewport.width - safeMargins.right,
            bottom: viewport.top + viewport.height - safeMargins.bottom,
        };
    }

    private getPreviewPointerDelta(event: PointerEvent, state: PreviewResizeState): PreviewPointerDelta {
        return {
            x: event.clientX - state.startClientX,
            y: event.clientY - state.startClientY,
        };
    }

    private getPreviewResizeStartEdges(state: PreviewResizeState): PreviewResizeStartEdges {
        return {
            right: state.startLeft + state.startWidth,
            bottom: state.startTop + state.startHeight,
        };
    }

    private resizesLeft(edge: PreviewResizeEdge): boolean {
        return edge === "left" || edge === "top-left" || edge === "bottom-left";
    }

    private resizesRight(edge: PreviewResizeEdge): boolean {
        return edge === "right" || edge === "top-right" || edge === "bottom-right";
    }

    private resizesTop(edge: PreviewResizeEdge): boolean {
        return edge === "top" || edge === "top-left" || edge === "top-right";
    }

    private resizesBottom(edge: PreviewResizeEdge): boolean {
        return edge === "bottom" || edge === "bottom-left" || edge === "bottom-right";
    }

    private dragCollapsedButton(event: PointerEvent): void {
        if (this.collapsedButtonDragState === null || event.pointerId !== this.collapsedButtonDragState.pointerId) {
            return;
        }
        const delta = this.getCollapsedButtonDragDelta(event, this.collapsedButtonDragState);
        if (this.hasCollapsedButtonDragMoved(delta)) {
            this.collapsedButtonDragState.moved = true;
        }
        const position = this.getDraggedCollapsedButtonPosition(delta, this.collapsedButtonDragState);
        this.applyCollapsedButtonDragPosition(position);
        this.stopPreviewPointerEvent(event);
    }

    private getCollapsedButtonDragDelta(event: PointerEvent, state: CollapsedButtonDragState): PreviewPointerDelta {
        return {
            x: event.clientX - state.startClientX,
            y: event.clientY - state.startClientY,
        };
    }

    private hasCollapsedButtonDragMoved(delta: PreviewPointerDelta): boolean {
        return Math.abs(delta.x) > 3 || Math.abs(delta.y) > 3;
    }

    private getDraggedCollapsedButtonPosition(delta: PreviewPointerDelta, state: CollapsedButtonDragState): PreviewPosition {
        return this.clampBiblePreviewPosition(
            state.startLeft + delta.x,
            state.startTop + delta.y,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
    }

    private applyCollapsedButtonDragPosition(position: PreviewPosition): void {
        this.collapsedButtonPosition = position;
        this.applyCollapsedButtonPosition(position);
    }

    private handlePointerUp(event: PointerEvent): void {
        if (this.finishBiblePreviewResize(event)) {
            return;
        }
        this.finishBiblePreviewDrag(event);
    }

    private finishBiblePreviewResize(event: PointerEvent): boolean {
        if (!this.isActivePreviewResizePointer(event)) {
            return false;
        }
        this.clearPreviewResizeInteraction();
        this.stopPreviewPointerEvent(event);
        return true;
    }

    private isActivePreviewResizePointer(event: PointerEvent): boolean {
        return this.previewResizeState !== null && event.pointerId === this.previewResizeState.pointerId;
    }

    private clearPreviewResizeInteraction(): void {
        this.previewResizeState = null;
        this.endPreviewPointerInteraction();
    }

    private finishBiblePreviewDrag(event: PointerEvent): void {
        if (this.finishCollapsedButtonDrag(event)) {
            return;
        }
        if (!this.isActivePreviewDragPointer(event)) {
            return;
        }
        this.clearPreviewDragInteraction();
        this.preventPreviewPointerDefault(event);
    }

    private isActivePreviewDragPointer(event: PointerEvent): boolean {
        return this.previewDragState !== null && event.pointerId === this.previewDragState.pointerId;
    }

    private clearPreviewDragInteraction(): void {
        this.previewDragState = null;
        this.endPreviewPointerInteraction();
    }

    private finishCollapsedButtonDrag(event: PointerEvent): boolean {
        if (!this.isActiveCollapsedButtonDragPointer(event)) {
            return false;
        }
        this.clearCollapsedButtonDragInteraction();
        this.stopPreviewPointerEvent(event);
        return true;
    }

    private isActiveCollapsedButtonDragPointer(event: PointerEvent): boolean {
        return this.collapsedButtonDragState !== null && event.pointerId === this.collapsedButtonDragState.pointerId;
    }

    private clearCollapsedButtonDragInteraction(): void {
        if (this.collapsedButtonDragState !== null) {
            this.suppressCollapsedButtonClick = this.collapsedButtonDragState.moved;
        }
        this.collapsedButtonDragState = null;
        this.collapsedButtonEl.style.cursor = "grab";
        this.endPreviewPointerInteraction();
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
            left: this.clampNumber(left, bounds.minLeft, bounds.maxLeft),
            top: this.clampNumber(top, bounds.minTop, bounds.maxTop),
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

    private clampNumber(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), Math.max(min, max));
    }

    private getBiblePreviewViewport(): PreviewViewport {
        return this.getWorkspacePreviewViewport() ?? this.getWindowPreviewViewport();
    }

    private getWorkspacePreviewViewport(): PreviewViewport | null {
        const rootWorkspaceEl = document.querySelector(".workspace-split.mod-root");
        if (!(rootWorkspaceEl instanceof HTMLElement)) {
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
        const viewport = window.visualViewport;
        return {
            left: viewport?.offsetLeft ?? 0,
            top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? window.innerWidth,
            height: viewport?.height ?? window.innerHeight,
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

    private isMobilePreviewLayout(viewportWidth: number): boolean {
        return viewportWidth < 700;
    }

    private async copyBiblePreviewText(): Promise<void> {
        if (this.previewText.length === 0) {
            return;
        }
        try {
            if (navigator.clipboard !== undefined) {
                await navigator.clipboard.writeText(this.previewText);
            } else {
                this.copyBiblePreviewTextFallback();
            }
            new Notice(this.labels.getCopyNoticeText(), 2500);
        } catch {
            this.copyBiblePreviewTextFallback();
            new Notice(this.labels.getCopyNoticeText(), 2500);
        }
    }

    private copyBiblePreviewTextFallback(): void {
        const textareaEl = document.createElement("textarea");
        textareaEl.value = this.previewText;
        textareaEl.style.position = "fixed";
        textareaEl.style.left = "-9999px";
        textareaEl.style.top = "0";
        document.body.appendChild(textareaEl);
        textareaEl.focus();
        textareaEl.select();
        document.execCommand("copy");
        textareaEl.remove();
    }

    private setStyles(element: HTMLElement, styles: Record<string, string>): void {
        for (const [property, value] of Object.entries(styles)) {
            element.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value);
        }
    }
}
