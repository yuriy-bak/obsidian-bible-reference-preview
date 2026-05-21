import { Notice, Platform } from "obsidian";
import { BiblePreviewContent, renderBiblePreviewContent } from "../application/formatBibleTexts";

export type FloatingBiblePreviewAnchor =
    | { type: "default" }
    | { type: "element"; element: HTMLElement };

export type FloatingBiblePreviewWindowInput = {
    getTitle(): string;
    getCopyNoticeText(): string;
    getCopyAria(): string;
    getCollapseAria(): string;
    getExpandAria(): string;
};

export class FloatingBiblePreviewWindow {
    private readonly previewPanelEl: HTMLDivElement;
    private readonly previewContentEl: HTMLDivElement;
    private readonly collapsedButtonEl: HTMLButtonElement;
    private previewTitleEl: HTMLDivElement | null = null;
    private copyPreviewButtonEl: HTMLButtonElement | null = null;
    private collapsePreviewButtonEl: HTMLButtonElement | null = null;
    private previewText = "";
    private previewContent: BiblePreviewContent | null = null;
    private isPreviewCollapsed = false;
    private customPreviewPosition: { left: number; top: number } | null = null;
    private collapsedButtonPosition: { left: number; top: number } | null = null;
    private collapsedButtonDragState: {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startLeft: number;
        startTop: number;
        moved: boolean;
    } | null = null;
    private suppressCollapsedButtonClick = false;
    private previewDragState: {
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startLeft: number;
        startTop: number;
    } | null = null;

    private readonly viewportChangeHandler = () => this.updateBiblePreviewPosition();
    private readonly pointerMoveHandler = (event: PointerEvent) => this.dragBiblePreview(event);
    private readonly pointerUpHandler = (event: PointerEvent) => this.finishBiblePreviewDrag(event);

    constructor(private labels: FloatingBiblePreviewWindowInput) {
        this.previewPanelEl = this.createPreviewPanelElement();
        this.previewContentEl = this.previewPanelEl.createDiv();
        this.collapsedButtonEl = this.createCollapsedButtonElement();
        document.body.appendChild(this.previewPanelEl);
        document.body.appendChild(this.collapsedButtonEl);
        this.configurePreviewContentElement();
        this.registerListeners();
    }

    public show(content: BiblePreviewContent, anchor: FloatingBiblePreviewAnchor = { type: "default" }): void {
        this.previewContent = content;
        this.previewText = content.plainText;
        renderBiblePreviewContent(this.previewContentEl, content);
        this.updateBiblePreviewTitle();

        if (this.isPreviewCollapsed) {
            this.isPreviewCollapsed = false;
            this.setExpandedPreviewPositionFromCollapsedButton();
        } else if (anchor.type === "element" && this.customPreviewPosition === null) {
            this.customPreviewPosition = this.getExpandedPreviewPositionForAnchor(anchor.element);
        }

        this.renderBiblePreview();
    }

    public hide(resetPosition = false): void {
        this.previewContent = null;
        this.previewText = "";
        this.previewPanelEl.style.display = "none";
        this.collapsedButtonEl.style.display = "none";

        if (resetPosition) {
            this.customPreviewPosition = null;
            this.collapsedButtonPosition = null;
            this.isPreviewCollapsed = false;
            return;
        }

        if (this.customPreviewPosition === null) {
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
        this.setPreviewButtonLabel(this.copyPreviewButtonEl, this.labels.getCopyAria());
        this.setPreviewButtonLabel(this.collapsePreviewButtonEl, this.labels.getCollapseAria());
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

    private createPreviewPanelElement(): HTMLDivElement {
        const panelEl = document.createElement("div");
        panelEl.style.position = "fixed";
        panelEl.style.display = "none";
        panelEl.style.flexDirection = "column";
        panelEl.style.boxSizing = "border-box";
        panelEl.style.zIndex = "1000";
        panelEl.style.border = "1px solid var(--color-accent)";
        panelEl.style.borderRadius = "10px";
        panelEl.style.background = "var(--background-secondary)";
        panelEl.style.color = "var(--text-normal)";
        panelEl.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.28)";
        panelEl.style.overflow = "hidden";
        panelEl.style.maxWidth = "720px";
        panelEl.style.minWidth = "240px";
        panelEl.style.pointerEvents = "auto";

        const headerEl = panelEl.createDiv();
        headerEl.style.display = "flex";
        headerEl.style.alignItems = "center";
        headerEl.style.gap = "6px";
        headerEl.style.padding = "6px 8px";
        headerEl.style.borderBottom = "1px solid var(--background-modifier-border)";
        headerEl.style.background = "var(--background-secondary-alt)";
        headerEl.style.cursor = "move";
        headerEl.style.touchAction = "none";
        headerEl.addEventListener("pointerdown", (event) => this.startBiblePreviewDrag(event));

        const titleEl = headerEl.createDiv({ text: this.labels.getTitle() });
        this.previewTitleEl = titleEl;
        titleEl.style.flex = "1";
        titleEl.style.minWidth = "0";
        titleEl.style.fontWeight = "600";
        titleEl.style.whiteSpace = "nowrap";
        titleEl.style.overflow = "hidden";
        titleEl.style.textOverflow = "ellipsis";

        const copyButton = this.createPreviewIconButton("📋", this.labels.getCopyAria());
        this.copyPreviewButtonEl = copyButton;
        copyButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        copyButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void this.copyBiblePreviewText();
        });
        headerEl.appendChild(copyButton);

        const collapseButton = this.createPreviewIconButton("🔽", this.labels.getCollapseAria());
        this.collapsePreviewButtonEl = collapseButton;
        collapseButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        collapseButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.rememberCollapsedButtonPosition(collapseButton);
            this.isPreviewCollapsed = true;
            this.renderBiblePreview();
        });
        headerEl.appendChild(collapseButton);

        return panelEl;
    }

    private configurePreviewContentElement(): void {
        this.previewContentEl.style.padding = "8px";
        this.previewContentEl.style.whiteSpace = "pre-wrap";
        this.previewContentEl.style.overflow = "auto";
        this.previewContentEl.style.userSelect = "text";
        this.previewContentEl.style.lineHeight = "1.45";
        this.previewContentEl.style.fontSize = "var(--font-text-size)";
        this.previewContentEl.style.maxHeight = "calc(40vh - 42px)";
    }

    private createCollapsedButtonElement(): HTMLButtonElement {
        const buttonEl = document.createElement("button");
        buttonEl.type = "button";
        buttonEl.textContent = "📖";
        buttonEl.setAttribute("aria-label", this.labels.getExpandAria());
        buttonEl.title = this.labels.getExpandAria();
        buttonEl.style.position = "fixed";
        buttonEl.style.display = "none";
        buttonEl.style.zIndex = "1000";
        buttonEl.style.width = "42px";
        buttonEl.style.height = "42px";
        buttonEl.style.borderRadius = "999px";
        buttonEl.style.border = "1px solid var(--color-accent)";
        buttonEl.style.background = "var(--background-secondary)";
        buttonEl.style.color = "var(--text-normal)";
        buttonEl.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.28)";
        buttonEl.style.cursor = "grab";
        buttonEl.style.touchAction = "none";
        buttonEl.style.userSelect = "none";
        buttonEl.style.fontSize = "20px";
        buttonEl.style.lineHeight = "1";
        buttonEl.style.padding = "0";
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
        buttonEl.style.width = "30px";
        buttonEl.style.height = "30px";
        buttonEl.style.display = "inline-flex";
        buttonEl.style.alignItems = "center";
        buttonEl.style.justifyContent = "center";
        buttonEl.style.borderRadius = "6px";
        buttonEl.style.border = "1px solid var(--background-modifier-border)";
        buttonEl.style.background = "var(--background-primary)";
        buttonEl.style.color = "var(--text-normal)";
        buttonEl.style.cursor = "pointer";
        buttonEl.style.fontSize = "16px";
        buttonEl.style.padding = "0";
        return buttonEl;
    }

    private updateBiblePreviewTitle(): void {
        if (this.previewTitleEl === null) {
            return;
        }
        this.previewTitleEl.textContent = this.labels.getTitle();
    }

    private setPreviewButtonLabel(buttonEl: HTMLButtonElement | null, label: string): void {
        if (buttonEl === null) {
            return;
        }
        buttonEl.setAttribute("aria-label", label);
        buttonEl.title = label;
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
    }

    private unregisterListeners(): void {
        window.removeEventListener("resize", this.viewportChangeHandler);
        window.visualViewport?.removeEventListener("resize", this.viewportChangeHandler);
        window.visualViewport?.removeEventListener("scroll", this.viewportChangeHandler);
        window.removeEventListener("pointermove", this.pointerMoveHandler);
        window.removeEventListener("pointerup", this.pointerUpHandler);
        window.removeEventListener("pointercancel", this.pointerUpHandler);
        this.collapsedButtonDragState = null;
        this.previewDragState = null;
        this.collapsedButtonEl.style.cursor = "grab";
        document.body.style.userSelect = "";
    }

    private startBiblePreviewDrag(event: PointerEvent): void {
        if (event.button !== 0 || this.previewText.length === 0 || this.isPreviewCollapsed) {
            return;
        }
        const rect = this.previewPanelEl.getBoundingClientRect();
        this.previewDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
        };
        document.body.style.userSelect = "none";
        event.preventDefault();
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

    private dragCollapsedButton(event: PointerEvent): void {
        if (this.collapsedButtonDragState === null || event.pointerId !== this.collapsedButtonDragState.pointerId) {
            return;
        }
        const deltaX = event.clientX - this.collapsedButtonDragState.startClientX;
        const deltaY = event.clientY - this.collapsedButtonDragState.startClientY;
        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            this.collapsedButtonDragState.moved = true;
        }
        const buttonSize = 42;
        const clamped = this.clampBiblePreviewPosition(
            this.collapsedButtonDragState.startLeft + deltaX,
            this.collapsedButtonDragState.startTop + deltaY,
            buttonSize,
            buttonSize,
        );
        this.collapsedButtonPosition = clamped;
        this.collapsedButtonEl.style.left = `${clamped.left}px`;
        this.collapsedButtonEl.style.top = `${clamped.top}px`;
        event.preventDefault();
        event.stopPropagation();
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

    private expandBiblePreviewFromCollapsedButton(): void {
        this.isPreviewCollapsed = false;
        this.setExpandedPreviewPositionFromCollapsedButton();
        this.renderBiblePreview();
    }

    private setExpandedPreviewPositionFromCollapsedButton(): void {
        const collapsedButtonCenter = this.getCollapsedButtonCenter();
        const viewport = this.getBiblePreviewViewport();

        const panelWidth = this.isMobilePreviewLayout(viewport.width)
            ? Math.max(240, viewport.width - 16)
            : Math.min(720, Math.max(320, viewport.width * 0.42));

        const panelHeight = Math.max(120, this.previewPanelEl.offsetHeight || 220);

        const expandedCollapseButtonCenterX = panelWidth - 23;
        const expandedCollapseButtonCenterY = 21;

        const preferredLeft = collapsedButtonCenter.x - expandedCollapseButtonCenterX;
        const preferredTop = collapsedButtonCenter.y - expandedCollapseButtonCenterY;

        this.customPreviewPosition = this.clampBiblePreviewPosition(
            preferredLeft,
            preferredTop,
            panelWidth,
            panelHeight,
        );

        this.collapsedButtonPosition = null;
    }

    private getCollapsedButtonCenter(): { x: number; y: number } {
        const rect = this.collapsedButtonEl.getBoundingClientRect();

        if (
            this.collapsedButtonEl.style.display !== "none"
            && rect.width > 0
            && rect.height > 0
        ) {
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };
        }

        if (this.collapsedButtonPosition !== null) {
            return {
                x: this.collapsedButtonPosition.left + 21,
                y: this.collapsedButtonPosition.top + 21,
            };
        }

        const panelWidth = this.getCurrentPreviewPanelWidth();

        return {
            x: (this.customPreviewPosition?.left ?? 0) + Math.max(21, panelWidth - 21),
            y: (this.customPreviewPosition?.top ?? 0) + 21,
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

        this.updateExpandedPreviewSize(viewport.width, viewport.height);

        if (this.customPreviewPosition !== null) {
            const clamped = this.clampBiblePreviewPosition(
                this.customPreviewPosition.left,
                this.customPreviewPosition.top,
                this.previewPanelEl.offsetWidth,
                this.previewPanelEl.offsetHeight,
            );
            this.customPreviewPosition = clamped;
            this.previewPanelEl.style.left = `${clamped.left}px`;
            this.previewPanelEl.style.top = `${clamped.top}px`;
            return;
        }

        if (this.isMobilePreviewLayout(viewport.width)) {
            const preferredLeft = viewport.left + safeMargins.left;
            const preferredTop = viewport.top + safeMargins.top;
            const clamped = this.clampBiblePreviewPosition(
                preferredLeft,
                preferredTop,
                this.previewPanelEl.offsetWidth,
                this.previewPanelEl.offsetHeight,
            );
            this.previewPanelEl.style.left = `${clamped.left}px`;
            this.previewPanelEl.style.top = `${clamped.top}px`;
            return;
        }

        const panelWidth = this.previewPanelEl.offsetWidth;
        const panelHeight = this.previewPanelEl.offsetHeight;
        const preferredLeft = viewport.left + viewport.width - panelWidth - safeMargins.right;
        const preferredTop = viewport.top + viewport.height - panelHeight - safeMargins.bottom;
        const clamped = this.clampBiblePreviewPosition(preferredLeft, preferredTop, panelWidth, panelHeight);
        this.previewPanelEl.style.left = `${clamped.left}px`;
        this.previewPanelEl.style.top = `${clamped.top}px`;
    }

    private rememberCollapsedButtonPosition(anchorEl: HTMLElement): void {
        const anchorRect = anchorEl.getBoundingClientRect();
        const buttonSize = 42;
        const preferredLeft = anchorRect.left + anchorRect.width / 2 - buttonSize / 2;
        const preferredTop = anchorRect.top + anchorRect.height / 2 - buttonSize / 2;
        this.collapsedButtonPosition = this.clampBiblePreviewPosition(
            preferredLeft,
            preferredTop,
            buttonSize,
            buttonSize,
        );
    }

    private updateCollapsedButtonPosition(
        viewport: { left: number; top: number; width: number; height: number },
        safeMargins: { top: number; right: number; bottom: number; left: number },
    ): void {
        const buttonSize = 42;
        if (this.collapsedButtonPosition !== null) {
            const clamped = this.clampBiblePreviewPosition(
                this.collapsedButtonPosition.left,
                this.collapsedButtonPosition.top,
                buttonSize,
                buttonSize,
            );
            this.collapsedButtonPosition = clamped;
            this.collapsedButtonEl.style.left = `${clamped.left}px`;
            this.collapsedButtonEl.style.top = `${clamped.top}px`;
            return;
        }
        if (this.customPreviewPosition !== null) {
            const panelWidth = this.getCurrentPreviewPanelWidth();
            const collapsedLeft = this.customPreviewPosition.left + Math.max(0, panelWidth - buttonSize);
            const clamped = this.clampBiblePreviewPosition(
                collapsedLeft,
                this.customPreviewPosition.top,
                buttonSize,
                buttonSize,
            );
            this.collapsedButtonEl.style.left = `${clamped.left}px`;
            this.collapsedButtonEl.style.top = `${clamped.top}px`;
            return;
        }
        const preferredLeft = viewport.left + viewport.width - buttonSize - safeMargins.right;
        const preferredTop = this.isMobilePreviewLayout(viewport.width)
            ? viewport.top + safeMargins.top
            : viewport.top + viewport.height - buttonSize - safeMargins.bottom;
        const clamped = this.clampBiblePreviewPosition(preferredLeft, preferredTop, buttonSize, buttonSize);
        this.collapsedButtonEl.style.left = `${clamped.left}px`;
        this.collapsedButtonEl.style.top = `${clamped.top}px`;
    }

    private getCurrentPreviewPanelWidth(): number {
        const parsedWidth = Number.parseFloat(this.previewPanelEl.style.width);
        return Number.isFinite(parsedWidth) && parsedWidth > 0
            ? parsedWidth
            : Math.max(240, this.previewPanelEl.offsetWidth);
    }

    private updateExpandedPreviewSize(viewportWidth: number, viewportHeight: number): void {
        if (this.isMobilePreviewLayout(viewportWidth)) {
            const width = Math.max(240, viewportWidth - 16);
            const maxPanelHeight = Math.max(120, Math.floor(viewportHeight * 0.27));
            this.previewPanelEl.style.width = `${width}px`;
            this.previewPanelEl.style.maxHeight = `${maxPanelHeight}px`;
            this.previewContentEl.style.maxHeight = `${Math.max(78, maxPanelHeight - 42)}px`;
            return;
        }
        const width = Math.min(720, Math.max(320, viewportWidth * 0.42));
        const maxPanelHeight = Math.max(220, Math.floor(viewportHeight * 0.4));
        this.previewPanelEl.style.width = `${width}px`;
        this.previewPanelEl.style.maxHeight = `${maxPanelHeight}px`;
        this.previewContentEl.style.maxHeight = `${Math.max(160, maxPanelHeight - 42)}px`;
    }

    private getExpandedPreviewPositionForAnchor(anchorEl: HTMLElement): { left: number; top: number } {
        const viewport = this.getBiblePreviewViewport();
        const rect = anchorEl.getBoundingClientRect();
        const width = this.isMobilePreviewLayout(viewport.width)
            ? Math.max(240, viewport.width - 16)
            : Math.min(720, Math.max(320, viewport.width * 0.42));
        const height = Math.max(120, this.previewPanelEl.offsetHeight || 220);
        return this.clampBiblePreviewPosition(rect.left, rect.bottom + 6, width, height);
    }

    private clampBiblePreviewPosition(left: number, top: number, width: number, height: number): { left: number; top: number } {
        const viewport = this.getBiblePreviewViewport();
        const safeMargins = this.getBiblePreviewSafeMargins(viewport.width);
        const minLeft = viewport.left + safeMargins.left;
        const maxLeft = Math.max(minLeft, viewport.left + viewport.width - width - safeMargins.right);
        const minTop = viewport.top + safeMargins.top;
        const maxTop = Math.max(minTop, viewport.top + viewport.height - height - safeMargins.bottom);
        return {
            left: Math.min(Math.max(left, minLeft), maxLeft),
            top: Math.min(Math.max(top, minTop), maxTop),
        };
    }

    private getBiblePreviewViewport(): { left: number; top: number; width: number; height: number } {
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
            top: 12,
            right: 12,
            bottom: 46,
            left: 12,
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
}
