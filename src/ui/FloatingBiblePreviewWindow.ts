import { Notice, Platform } from "obsidian";
import { BiblePreviewContent, BiblePreviewReferenceBlock, renderBiblePreviewContent } from "../application/formatBibleTexts";

export type FloatingBiblePreviewAnchor =
    | { type: "default" }
    | { type: "element"; element: HTMLElement };

export type PreviewComparisonTranslationOption = {
    id: string;
    name: string;
    isSelected: boolean;
    isDisabled: boolean;
};

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
    private customPreviewSize: { width: number; height: number } | null = null;
    private customPreviewPosition: { left: number; top: number } | null = null;
    private collapsedButtonPosition: { left: number; top: number } | null = null;
    private collapsedExpandAnchorOffset: { right: number; top: number } | null = null;
    private collapsedButtonDragState: {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startLeft: number;
        startTop: number;
        moved: boolean;
    } | null = null;
    private previewDragState: {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startLeft: number;
        startTop: number;
    } | null = null;
    private previewResizeState: {
        pointerId: number;
        edge: PreviewResizeEdge;
        startClientX: number;
        startClientY: number;
        startLeft: number;
        startTop: number;
        startWidth: number;
        startHeight: number;
    } | null = null;
    private suppressCollapsedButtonClick = false;

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
        this.collapsedButtonEl.setAttribute("aria-label", this.labels.getExpandAria());
        this.collapsedButtonEl.title = this.labels.getExpandAria();
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

        const headerEl = panelEl.createDiv();
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
        headerEl.addEventListener("pointerdown", (event) => this.startBiblePreviewDrag(event));

        const titleEl = headerEl.createDiv({ text: this.labels.getTitle() });
        this.previewTitleEl = titleEl;
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

        const comparisonSelectorEl = headerEl.createDiv();
        this.comparisonSelectorEl = comparisonSelectorEl;
        this.setStyles(comparisonSelectorEl, {
            flex: "1 1 auto",
            minWidth: "0",
        });
        comparisonSelectorEl.addEventListener("pointerdown", (event) => event.stopPropagation());
        comparisonSelectorEl.addEventListener("click", (event) => event.stopPropagation());

        const copyButton = this.createPreviewIconButton("📋", this.labels.getCopyAria());
        this.copyPreviewButtonEl = copyButton;
        copyButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        copyButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.copyBiblePreviewText();
        });
        headerEl.appendChild(copyButton);

        const comparisonButton = this.createPreviewIconButton("⇄", this.getComparisonAriaLabel());
        this.comparisonPreviewButtonEl = comparisonButton;
        this.updateComparisonButtonText();
        comparisonButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        comparisonButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.previewContent !== null && this.labels.onToggleComparison !== undefined) {
                this.labels.onToggleComparison(this.previewContent);
            }
        });
        headerEl.appendChild(comparisonButton);

        const openInPanelButton = this.createPreviewIconButton("◨", this.getOpenInPanelAriaLabel());
        this.openInPanelButtonEl = openInPanelButton;
        this.updateOpenInPanelButtonText();
        openInPanelButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        openInPanelButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.previewContent !== null && this.labels.onOpenInPanel !== undefined) {
                this.labels.onOpenInPanel(this.previewContent);
                this.hide();
            }
        });
        headerEl.appendChild(openInPanelButton);

        const collapseButton = this.createPreviewIconButton("▾", this.labels.getCollapseAria());
        this.collapsePreviewButtonEl = collapseButton;
        collapseButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        collapseButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.collapseBiblePreview(collapseButton);
        });
        headerEl.appendChild(collapseButton);

        const closeButton = this.createPreviewIconButton("×", this.getCloseAriaLabel());
        this.closePreviewButtonEl = closeButton;
        closeButton.style.fontSize = "18px";
        closeButton.style.fontWeight = "700";
        closeButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        closeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.hide();
        });
        headerEl.appendChild(closeButton);

        return panelEl;
    }

    private configurePreviewContentElement(): void {
        this.setStyles(this.previewContentEl, {
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
        buttonEl.setAttribute("aria-label", this.labels.getExpandAria());
        buttonEl.title = this.labels.getExpandAria();
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
        buttonEl.addEventListener("pointerdown", (event) => this.startCollapsedButtonDrag(event));
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (this.suppressCollapsedButtonClick) {
                this.suppressCollapsedButtonClick = false;
                return;
            }
            this.expandBiblePreviewFromCollapsedButton();
        });
        return buttonEl;
    }

    private createPreviewIconButton(text: string, label: string): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.textContent = text;
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
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
        return buttonEl;
    }

    private createResizeHandleElements(): HTMLDivElement[] {
        const edges: PreviewResizeEdge[] = [
            "top",
            "right",
            "bottom",
            "left",
            "top-left",
            "top-right",
            "bottom-right",
            "bottom-left",
        ];
        return edges.map((edge) => this.createResizeHandleElement(edge));
    }

    private createResizeHandleElement(edge: PreviewResizeEdge): HTMLDivElement {
        const handleEl = document.createElement("div");
        handleEl.dataset.resizeEdge = edge;
        handleEl.setAttribute("aria-hidden", "true");
        this.setStyles(handleEl, {
            position: "absolute",
            boxSizing: "border-box",
            zIndex: this.isCornerResizeEdge(edge) ? "3" : "2",
            touchAction: "none",
            background: "transparent",
        });
        this.applyDesktopResizeHandleStyle(handleEl, edge);
        handleEl.addEventListener("pointerdown", (event) => this.startBiblePreviewResize(event, edge));
        return handleEl;
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
        const selectedCount = options.filter((option) => option.isSelected).length;
        const selectorEl = document.createElement("details");
        selectorEl.className = "bible-preview-comparison-selector";
        selectorEl.style.position = "relative";

        const summaryEl = document.createElement("summary");
        summaryEl.textContent = `${this.labels.getComparisonTranslationsTitle?.() ?? "Compare:"} ${selectedCount}/${Math.min(options.length, 4)}`;
        summaryEl.style.cursor = "pointer";
        summaryEl.style.fontWeight = "600";
        summaryEl.style.fontSize = "12px";
        summaryEl.style.whiteSpace = "nowrap";
        summaryEl.style.overflow = "hidden";
        summaryEl.style.textOverflow = "ellipsis";
        summaryEl.style.userSelect = "none";
        selectorEl.appendChild(summaryEl);

        const optionsEl = document.createElement("div");
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

        for (const option of options) {
            const labelEl = document.createElement("label");
            labelEl.style.display = "inline-flex";
            labelEl.style.alignItems = "center";
            labelEl.style.gap = "8px";
            labelEl.style.fontSize = "14px";
            labelEl.style.lineHeight = "1.35";
            labelEl.style.whiteSpace = "normal";
            labelEl.style.minHeight = "28px";

            const checkboxEl = document.createElement("input");
            checkboxEl.type = "checkbox";
            checkboxEl.style.flex = "0 0 auto";
            checkboxEl.style.width = "16px";
            checkboxEl.style.height = "16px";
            checkboxEl.checked = option.isSelected;
            checkboxEl.disabled = option.isDisabled;
            checkboxEl.addEventListener("change", () => {
                this.labels.onToggleComparisonTranslation?.(option.id, checkboxEl.checked);
            });

            labelEl.appendChild(checkboxEl);
            labelEl.appendChild(document.createTextNode(option.name));
            optionsEl.appendChild(labelEl);
        }

        selectorEl.appendChild(optionsEl);
        hostEl.appendChild(selectorEl);
    }

    private updateOpenInPanelButtonText(): void {
        if (this.openInPanelButtonEl === null) {
            return;
        }
        this.openInPanelButtonEl.textContent = this.getOpenInPanelButtonIcon();
        this.openInPanelButtonEl.style.display = this.labels.onOpenInPanel === undefined ? "none" : "inline-flex";
    }

    private renderBiblePreview(): void {
        if (this.previewText.length === 0) {
            this.hide();
            return;
        }

        if (this.isPreviewCollapsed) {
            this.previewPanelEl.style.display = "none";
            this.collapsedButtonEl.style.display = "block";
        } else {
            this.collapsedButtonEl.style.display = "none";
            this.previewPanelEl.style.display = "flex";
        }

        window.requestAnimationFrame(() => this.updateBiblePreviewPosition());
    }

    private registerListeners(): void {
        window.addEventListener("resize", this.viewportChangeHandler);
        window.visualViewport?.addEventListener("resize", this.viewportChangeHandler);
        window.visualViewport?.addEventListener("scroll", this.viewportChangeHandler);
        window.addEventListener("pointermove", this.pointerMoveHandler);
        window.addEventListener("pointerup", this.pointerUpHandler);
        window.addEventListener("pointercancel", this.pointerUpHandler);
        document.addEventListener("keydown", this.keydownHandler, true);
    }

    private unregisterListeners(): void {
        window.removeEventListener("resize", this.viewportChangeHandler);
        window.visualViewport?.removeEventListener("resize", this.viewportChangeHandler);
        window.visualViewport?.removeEventListener("scroll", this.viewportChangeHandler);
        window.removeEventListener("pointermove", this.pointerMoveHandler);
        window.removeEventListener("pointerup", this.pointerUpHandler);
        window.removeEventListener("pointercancel", this.pointerUpHandler);
        document.removeEventListener("keydown", this.keydownHandler, true);
        this.collapsedButtonDragState = null;
        this.previewDragState = null;
        this.previewResizeState = null;
        this.collapsedButtonEl.style.cursor = "grab";
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
        if (event.button !== 0 || this.previewText.length === 0 || this.isPreviewCollapsed) {
            return;
        }
        const rect = this.previewPanelEl.getBoundingClientRect();
        this.customPreviewPosition = this.clampBiblePreviewPosition(rect.left, rect.top, rect.width, rect.height);
        this.previewDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: this.customPreviewPosition.left,
            startTop: this.customPreviewPosition.top,
        };
        document.body.style.userSelect = "none";
        event.preventDefault();
    }

    private startBiblePreviewResize(event: PointerEvent, edge: PreviewResizeEdge): void {
        if (event.button !== 0 || this.previewText.length === 0 || this.isPreviewCollapsed) {
            return;
        }
        const rect = this.previewPanelEl.getBoundingClientRect();
        this.customPreviewPosition = this.clampBiblePreviewPosition(rect.left, rect.top, rect.width, rect.height);
        this.previewResizeState = {
            pointerId: event.pointerId,
            edge,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: this.customPreviewPosition.left,
            startTop: this.customPreviewPosition.top,
            startWidth: rect.width,
            startHeight: rect.height,
        };
        document.body.style.userSelect = "none";
        event.preventDefault();
        event.stopPropagation();
    }

    private startCollapsedButtonDrag(event: PointerEvent): void {
        if (event.button !== 0 || this.previewText.length === 0 || !this.isPreviewCollapsed) {
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
        document.body.style.userSelect = "none";
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
        const nextLeft = this.previewDragState.startLeft + event.clientX - this.previewDragState.startClientX;
        const nextTop = this.previewDragState.startTop + event.clientY - this.previewDragState.startClientY;
        const clamped = this.clampBiblePreviewPosition(
            nextLeft,
            nextTop,
            this.previewPanelEl.offsetWidth,
            this.previewPanelEl.offsetHeight,
        );
        this.customPreviewPosition = clamped;
        this.previewPanelEl.style.left = `${clamped.left}px`;
        this.previewPanelEl.style.top = `${clamped.top}px`;
        event.preventDefault();
    }

    private resizeBiblePreview(event: PointerEvent): void {
        if (this.previewResizeState === null || event.pointerId !== this.previewResizeState.pointerId) {
            return;
        }

        const state = this.previewResizeState;
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);
        const bounds = {
            left: viewport.left + safeMargins.left,
            top: viewport.top + safeMargins.top,
            right: viewport.left + viewport.width - safeMargins.right,
            bottom: viewport.top + viewport.height - safeMargins.bottom,
        };
        const deltaX = event.clientX - state.startClientX;
        const deltaY = event.clientY - state.startClientY;
        const startRight = state.startLeft + state.startWidth;
        const startBottom = state.startTop + state.startHeight;
        let nextLeft = state.startLeft;
        let nextTop = state.startTop;
        let nextRight = startRight;
        let nextBottom = startBottom;

        if (!this.isMobilePreviewLayout(viewport.width)) {
            if (this.resizesLeft(state.edge)) {
                nextLeft = this.clampNumber(state.startLeft + deltaX, bounds.left, startRight - MIN_WIDTH);
            }
            if (this.resizesRight(state.edge)) {
                nextRight = this.clampNumber(startRight + deltaX, state.startLeft + MIN_WIDTH, bounds.right);
            }
            if (this.resizesTop(state.edge)) {
                nextTop = this.clampNumber(state.startTop + deltaY, bounds.top, startBottom - MIN_HEIGHT);
            }
        }

        if (this.resizesBottom(state.edge) || this.isMobilePreviewLayout(viewport.width)) {
            nextBottom = this.clampNumber(startBottom + deltaY, state.startTop + MIN_HEIGHT, bounds.bottom);
        }

        if (this.isMobilePreviewLayout(viewport.width)) {
            const mobileWidth = this.getMobilePreviewWidth(viewport.width);
            nextLeft = this.clampBiblePreviewPosition(state.startLeft, state.startTop, mobileWidth, nextBottom - state.startTop).left;
            nextRight = nextLeft + mobileWidth;
            nextTop = state.startTop;
        }

        const width = Math.max(nextRight - nextLeft, MIN_WIDTH);
        const height = Math.max(nextBottom - nextTop, MIN_HEIGHT);
        this.customPreviewPosition = { left: nextLeft, top: nextTop };
        this.customPreviewSize = { width, height };
        this.applyPreviewSize(width, height);
        this.previewPanelEl.style.left = `${nextLeft}px`;
        this.previewPanelEl.style.top = `${nextTop}px`;
        event.preventDefault();
        event.stopPropagation();
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
        const deltaX = event.clientX - this.collapsedButtonDragState.startClientX;
        const deltaY = event.clientY - this.collapsedButtonDragState.startClientY;
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            this.collapsedButtonDragState.moved = true;
        }
        const clamped = this.clampBiblePreviewPosition(
            this.collapsedButtonDragState.startLeft + deltaX,
            this.collapsedButtonDragState.startTop + deltaY,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
        this.collapsedButtonPosition = clamped;
        this.collapsedButtonEl.style.left = `${clamped.left}px`;
        this.collapsedButtonEl.style.top = `${clamped.top}px`;
        event.preventDefault();
        event.stopPropagation();
    }

    private handlePointerUp(event: PointerEvent): void {
        if (this.finishBiblePreviewResize(event)) {
            return;
        }
        this.finishBiblePreviewDrag(event);
    }

    private finishBiblePreviewResize(event: PointerEvent): boolean {
        if (this.previewResizeState === null || event.pointerId !== this.previewResizeState.pointerId) {
            return false;
        }
        this.previewResizeState = null;
        document.body.style.userSelect = "";
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    private finishBiblePreviewDrag(event: PointerEvent): void {
        if (this.finishCollapsedButtonDrag(event)) {
            return;
        }
        if (this.previewDragState === null || event.pointerId !== this.previewDragState.pointerId) {
            return;
        }
        this.previewDragState = null;
        document.body.style.userSelect = "";
        event.preventDefault();
    }

    private finishCollapsedButtonDrag(event: PointerEvent): boolean {
        if (this.collapsedButtonDragState === null || event.pointerId !== this.collapsedButtonDragState.pointerId) {
            return false;
        }
        this.suppressCollapsedButtonClick = this.collapsedButtonDragState.moved;
        this.collapsedButtonDragState = null;
        this.collapsedButtonEl.style.cursor = "grab";
        document.body.style.userSelect = "";
        event.preventDefault();
        event.stopPropagation();
        return true;
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
        if (this.previewText.length === 0 || visibleEl.style.display === "none") {
            return;
        }
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);

        if (this.isPreviewCollapsed) {
            this.updateCollapsedButtonPosition(viewport, safeMargins);
            return;
        }

        const panelSize = this.getPreviewPanelSize(viewport.width, viewport.height);
        this.applyPreviewSize(panelSize.width, panelSize.height);

        if (this.customPreviewPosition !== null) {
            const clamped = this.clampBiblePreviewPosition(
                this.customPreviewPosition.left,
                this.customPreviewPosition.top,
                panelSize.width,
                panelSize.height,
            );
            this.customPreviewPosition = clamped;
            this.previewPanelEl.style.left = `${clamped.left}px`;
            this.previewPanelEl.style.top = `${clamped.top}px`;
            return;
        }

        if (this.isMobilePreviewLayout(viewport.width)) {
            const clamped = this.clampBiblePreviewPosition(
                viewport.left + safeMargins.left,
                viewport.top + safeMargins.top,
                panelSize.width,
                panelSize.height,
            );
            this.previewPanelEl.style.left = `${clamped.left}px`;
            this.previewPanelEl.style.top = `${clamped.top}px`;
            return;
        }

        const clamped = this.clampBiblePreviewPosition(
            viewport.left + viewport.width - panelSize.width - safeMargins.right,
            viewport.top + viewport.height - panelSize.height - safeMargins.bottom,
            panelSize.width,
            panelSize.height,
        );
        this.previewPanelEl.style.left = `${clamped.left}px`;
        this.previewPanelEl.style.top = `${clamped.top}px`;
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
        viewport: { left: number; top: number; width: number; height: number },
        safeMargins: { top: number; right: number; bottom: number; left: number },
    ): void {
        if (this.collapsedButtonPosition !== null) {
            const clamped = this.clampBiblePreviewPosition(
                this.collapsedButtonPosition.left,
                this.collapsedButtonPosition.top,
                COLLAPSED_BUTTON_SIZE,
                COLLAPSED_BUTTON_SIZE,
            );
            this.collapsedButtonPosition = clamped;
            this.collapsedButtonEl.style.left = `${clamped.left}px`;
            this.collapsedButtonEl.style.top = `${clamped.top}px`;
            return;
        }
        if (this.customPreviewPosition !== null) {
            const panelWidth = this.getCurrentPreviewPanelWidth();
            const clamped = this.clampBiblePreviewPosition(
                this.customPreviewPosition.left + Math.max(0, panelWidth - COLLAPSED_BUTTON_SIZE),
                this.customPreviewPosition.top,
                COLLAPSED_BUTTON_SIZE,
                COLLAPSED_BUTTON_SIZE,
            );
            this.collapsedButtonEl.style.left = `${clamped.left}px`;
            this.collapsedButtonEl.style.top = `${clamped.top}px`;
            return;
        }
        const clamped = this.clampBiblePreviewPosition(
            viewport.left + viewport.width - COLLAPSED_BUTTON_SIZE - safeMargins.right,
            this.isMobilePreviewLayout(viewport.width)
                ? viewport.top + safeMargins.top
                : viewport.top + viewport.height - COLLAPSED_BUTTON_SIZE - safeMargins.bottom,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
        this.collapsedButtonEl.style.left = `${clamped.left}px`;
        this.collapsedButtonEl.style.top = `${clamped.top}px`;
    }

    private getPreviewPanelSize(viewportWidth: number, viewportHeight: number): { width: number; height: number } {
        if (this.isMobilePreviewLayout(viewportWidth)) {
            const height = this.customPreviewSize?.height ?? DEFAULT_MOBILE_HEIGHT;
            const size = this.clampPreviewSize(this.getMobilePreviewWidth(viewportWidth), height, viewportWidth, viewportHeight);
            this.customPreviewSize = size;
            return size;
        }

        if (this.customPreviewSize !== null) {
            const clampedSize = this.clampPreviewSize(this.customPreviewSize.width, this.customPreviewSize.height, viewportWidth, viewportHeight);
            this.customPreviewSize = clampedSize;
            return clampedSize;
        }

        const defaultSize = this.clampPreviewSize(
            Math.min(720, Math.max(320, Math.min(DEFAULT_DESKTOP_WIDTH, viewportWidth * 0.42))),
            DEFAULT_DESKTOP_HEIGHT,
            viewportWidth,
            viewportHeight,
        );
        this.customPreviewSize = defaultSize;
        return defaultSize;
    }

    private applyPreviewSize(width: number, height: number): void {
        const viewport = this.getBiblePreviewViewport();
        this.previewPanelEl.style.width = `${width}px`;
        this.previewPanelEl.style.height = `${height}px`;
        this.previewPanelEl.style.maxHeight = `${height}px`;
        this.previewContentEl.style.maxHeight = `${Math.max(78, height - HEADER_HEIGHT)}px`;
        this.updateResizeHandleStyles(viewport.width);
    }

    private getExpandedPreviewPositionForAnchor(anchorEl: HTMLElement): { left: number; top: number } {
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

    private clampPreviewSize(width: number, height: number, viewportWidth: number, viewportHeight: number): { width: number; height: number } {
        const safeMargins = this.getBiblePreviewSafeMargins(viewportWidth);
        const maxWidth = Math.max(MIN_WIDTH, viewportWidth - safeMargins.left - safeMargins.right);
        const maxHeight = Math.max(MIN_HEIGHT, viewportHeight - safeMargins.top - safeMargins.bottom);
        return {
            width: Math.min(Math.max(width, MIN_WIDTH), maxWidth),
            height: Math.min(Math.max(height, MIN_HEIGHT), maxHeight),
        };
    }

    private clampBiblePreviewPosition(left: number, top: number, width: number, height: number): { left: number; top: number } {
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);
        const minLeft = viewport.left + safeMargins.left;
        const maxLeft = Math.max(minLeft, viewport.left + viewport.width - width - safeMargins.right);
        const minTop = viewport.top + safeMargins.top;
        const maxTop = Math.max(minTop, viewport.top + viewport.height - height - safeMargins.bottom);
        return {
            left: this.clampNumber(left, minLeft, maxLeft),
            top: this.clampNumber(top, minTop, maxTop),
        };
    }

    private clampNumber(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), Math.max(min, max));
    }

    private getBiblePreviewViewport(): { left: number; top: number; width: number; height: number } {
        const rootWorkspaceEl = document.querySelector(".workspace-split.mod-root");
        if (rootWorkspaceEl instanceof HTMLElement) {
            const rect = rootWorkspaceEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                };
            }
        }

        const viewport = window.visualViewport;
        return {
            left: viewport?.offsetLeft ?? 0,
            top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? window.innerWidth,
            height: viewport?.height ?? window.innerHeight,
        };
    }

    private getBiblePreviewSafeMargins(viewportWidth: number): { top: number; right: number; bottom: number; left: number } {
        if (this.isMobilePreviewLayout(viewportWidth)) {
            return {
                top: Platform.isAndroidApp ? 72 : 56,
                right: 8,
                bottom: 12,
                left: 8,
            };
        }
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
