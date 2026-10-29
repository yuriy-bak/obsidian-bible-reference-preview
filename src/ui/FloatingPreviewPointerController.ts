import {
    clampNumber,
    COLLAPSED_BUTTON_SIZE,
    MIN_HEIGHT,
    MIN_WIDTH,
    type PreviewPosition,
    type PreviewResizeResult,
    type PreviewSafeMargins,
    type PreviewViewport,
} from "./FloatingPreviewGeometry";

type PreviewResizeEdge =
    | "top"
    | "right"
    | "bottom"
    | "left"
    | "top-left"
    | "top-right"
    | "bottom-right"
    | "bottom-left";

type PreviewBounds = { left: number; top: number; right: number; bottom: number };
type PreviewPointerDelta = { x: number; y: number };
type PreviewResizeStartEdges = { right: number; bottom: number };
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

/** What the pointer controller needs from the floating window; positions and sizes stay stored there. */
export type FloatingPreviewPointerHost = {
    panelEl: HTMLElement;
    collapsedButtonEl: HTMLElement;
    canStartExpandedInteraction: () => boolean;
    canStartCollapsedInteraction: () => boolean;
    /** Current panel rect and clamped position; the window keeps that position as its custom one. */
    getExpandedInteractionStart: () => { rect: DOMRect; position: PreviewPosition };
    clampPosition: (left: number, top: number, width: number, height: number) => PreviewPosition;
    getViewport: () => PreviewViewport;
    getSafeMargins: (viewportWidth: number) => PreviewSafeMargins;
    isMobileLayout: (viewportWidth: number) => boolean;
    getMobileWidth: (viewportWidth: number) => number;
    onPreviewDragged: (position: PreviewPosition) => void;
    onPreviewResized: (result: PreviewResizeResult) => void;
    onCollapsedButtonDragged: (position: PreviewPosition) => void;
    setUserSelectDisabled: (disabled: boolean) => void;
};

/**
 * Dragging the floating preview by its header, resizing it by its edges and corners,
 * and dragging the collapsed button. The window forwards window-level pointer events here.
 */
export class FloatingPreviewPointerController {
    private collapsedButtonDragState: CollapsedButtonDragState | null = null;
    private previewDragState: PreviewDragState | null = null;
    private previewResizeState: PreviewResizeState | null = null;
    private suppressCollapsedButtonClick = false;

    constructor(private readonly host: FloatingPreviewPointerHost) {}

    public createResizeHandleElements(): HTMLDivElement[] {
        return this.getResizeHandleEdges().map((edge) => this.createResizeHandleElement(edge));
    }

    /** True once after a collapsed button drag that moved, so its click does not expand the preview. */
    public consumeCollapsedButtonClickSuppression(): boolean {
        const suppressed = this.suppressCollapsedButtonClick;
        this.suppressCollapsedButtonClick = false;
        return suppressed;
    }

    /** Drops an interaction in progress, e.g. when the window listeners are removed. */
    public reset(): void {
        this.collapsedButtonDragState = null;
        this.previewDragState = null;
        this.previewResizeState = null;
        this.host.collapsedButtonEl.removeClass("is-dragging");
        this.host.setUserSelectDisabled(false);
    }

    public startPreviewDrag(event: PointerEvent): void {
        if (!this.canStartExpandedPreviewPointerInteraction(event)) {
            return;
        }
        const start = this.host.getExpandedInteractionStart();
        this.previewDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: start.position.left,
            startTop: start.position.top,
        };
        this.host.setUserSelectDisabled(true);
        this.preventPreviewPointerDefault(event);
    }

    public startCollapsedButtonDrag(event: PointerEvent): void {
        if (!this.canStartCollapsedButtonPointerInteraction(event)) {
            return;
        }
        const rect = this.host.collapsedButtonEl.getBoundingClientRect();
        this.collapsedButtonDragState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            moved: false,
        };
        this.suppressCollapsedButtonClick = false;
        this.host.collapsedButtonEl.addClass("is-dragging");
        this.host.setUserSelectDisabled(true);
        this.stopPreviewPointerEvent(event);
    }

    public handlePointerMove(event: PointerEvent): void {
        if (this.previewResizeState !== null) {
            this.resizeBiblePreview(event);
            return;
        }
        this.dragBiblePreview(event);
    }

    public handlePointerUp(event: PointerEvent): void {
        if (this.finishBiblePreviewResize(event)) {
            return;
        }
        this.finishBiblePreviewDrag(event);
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
        const handleEl = createDiv({ cls: "bible-preview-floating-resize-handle" });
        handleEl.dataset.resizeEdge = edge;
        handleEl.setAttribute("aria-hidden", "true");
        handleEl.addEventListener("pointerdown", (event) => this.startBiblePreviewResize(event, edge));
        return handleEl;
    }

    private startBiblePreviewResize(event: PointerEvent, edge: PreviewResizeEdge): void {
        if (!this.canStartExpandedPreviewPointerInteraction(event)) {
            return;
        }
        const start = this.host.getExpandedInteractionStart();
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
        this.host.setUserSelectDisabled(true);
        this.stopPreviewPointerEvent(event);
    }

    private canStartExpandedPreviewPointerInteraction(event: PointerEvent): boolean {
        return event.button === 0 && this.host.canStartExpandedInteraction();
    }

    private canStartCollapsedButtonPointerInteraction(event: PointerEvent): boolean {
        return event.button === 0 && this.host.canStartCollapsedInteraction();
    }

    private preventPreviewPointerDefault(event: PointerEvent): void {
        event.preventDefault();
    }

    private stopPreviewPointerEvent(event: PointerEvent): void {
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
        const position = this.getDraggedPreviewPosition(event, this.previewDragState);
        this.host.onPreviewDragged(position);
        this.preventPreviewPointerDefault(event);
    }

    private getDraggedPreviewPosition(event: PointerEvent, state: PreviewDragState): PreviewPosition {
        return this.host.clampPosition(
            state.startLeft + event.clientX - state.startClientX,
            state.startTop + event.clientY - state.startClientY,
            this.host.panelEl.offsetWidth,
            this.host.panelEl.offsetHeight,
        );
    }

    private resizeBiblePreview(event: PointerEvent): void {
        if (this.previewResizeState === null || event.pointerId !== this.previewResizeState.pointerId) {
            return;
        }

        const state = this.previewResizeState;
        const viewport = this.host.getViewport();
        const safeMargins = this.host.getSafeMargins(viewport.width);
        const resizeResult = this.getPreviewResizeResult(event, state, viewport, safeMargins);
        this.host.onPreviewResized(resizeResult);
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
        const isMobileLayout = this.host.isMobileLayout(viewport.width);
        let nextLeft = state.startLeft;
        let nextTop = state.startTop;
        let nextRight = startEdges.right;
        let nextBottom = startEdges.bottom;

        if (!isMobileLayout) {
            if (this.resizesLeft(state.edge)) {
                nextLeft = clampNumber(state.startLeft + delta.x, bounds.left, startEdges.right - MIN_WIDTH);
            }
            if (this.resizesRight(state.edge)) {
                nextRight = clampNumber(startEdges.right + delta.x, state.startLeft + MIN_WIDTH, bounds.right);
            }
            if (this.resizesTop(state.edge)) {
                nextTop = clampNumber(state.startTop + delta.y, bounds.top, startEdges.bottom - MIN_HEIGHT);
            }
        }

        if (this.resizesBottom(state.edge) || isMobileLayout) {
            nextBottom = clampNumber(startEdges.bottom + delta.y, state.startTop + MIN_HEIGHT, bounds.bottom);
        }

        if (isMobileLayout) {
            const mobileWidth = this.host.getMobileWidth(viewport.width);
            nextLeft = this.host.clampPosition(state.startLeft, state.startTop, mobileWidth, nextBottom - state.startTop).left;
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

    private getPreviewResizeBounds(viewport: PreviewViewport, safeMargins: PreviewSafeMargins): PreviewBounds {
        return {
            left: viewport.left + safeMargins.left,
            top: viewport.top + safeMargins.top,
            right: viewport.left + viewport.width - safeMargins.right,
            bottom: viewport.top + viewport.height - safeMargins.bottom,
        };
    }

    private getPreviewPointerDelta(event: PointerEvent, state: PreviewDragState | PreviewResizeState): PreviewPointerDelta {
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
        const delta = this.getPreviewPointerDelta(event, this.collapsedButtonDragState);
        if (this.hasCollapsedButtonDragMoved(delta)) {
            this.collapsedButtonDragState.moved = true;
        }
        const position = this.getDraggedCollapsedButtonPosition(delta, this.collapsedButtonDragState);
        this.host.onCollapsedButtonDragged(position);
        this.stopPreviewPointerEvent(event);
    }

    private hasCollapsedButtonDragMoved(delta: PreviewPointerDelta): boolean {
        return Math.abs(delta.x) > 3 || Math.abs(delta.y) > 3;
    }

    private getDraggedCollapsedButtonPosition(delta: PreviewPointerDelta, state: CollapsedButtonDragState): PreviewPosition {
        return this.host.clampPosition(
            state.startLeft + delta.x,
            state.startTop + delta.y,
            COLLAPSED_BUTTON_SIZE,
            COLLAPSED_BUTTON_SIZE,
        );
    }

    private finishBiblePreviewResize(event: PointerEvent): boolean {
        if (this.previewResizeState === null || event.pointerId !== this.previewResizeState.pointerId) {
            return false;
        }
        this.previewResizeState = null;
        this.host.setUserSelectDisabled(false);
        this.stopPreviewPointerEvent(event);
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
        this.host.setUserSelectDisabled(false);
        this.preventPreviewPointerDefault(event);
    }

    private finishCollapsedButtonDrag(event: PointerEvent): boolean {
        if (this.collapsedButtonDragState === null || event.pointerId !== this.collapsedButtonDragState.pointerId) {
            return false;
        }
        this.suppressCollapsedButtonClick = this.collapsedButtonDragState.moved;
        this.collapsedButtonDragState = null;
        this.host.collapsedButtonEl.removeClass("is-dragging");
        this.host.setUserSelectDisabled(false);
        this.stopPreviewPointerEvent(event);
        return true;
    }
}
