import type { App, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";
import {
    closeBiblePreviewPane,
    getFirstWorkspaceLeafOfType,
    isBiblePreviewPaneActiveInSideDock,
    isSideDockUtilityLeaf,
} from "../workspace/BiblePreviewWorkspace";

export type BiblePreviewPaneStateFlowInput = {
    app: App;
    previewViewType: string;
    previewPanelSide: BiblePreviewPanelSide;
    getBiblePreviewPaneIsActiveInSideDock(): boolean;
    setBiblePreviewPaneIsActiveInSideDock(value: boolean): void;
    getLastPanelEscapeTime(): number;
    setLastPanelEscapeTime(value: number): void;
    isFloatingPreviewVisible(): boolean;
    isClosePreviewOnActiveLeafChangeEnabled(): boolean;
    hideFloatingBiblePreview(): void;
    closeActiveBiblePreviewPane(): void;
};

export type CloseBiblePreviewPaneStateFlowOptions = {
    collapseSideDock?: boolean;
    requireActivePreview?: boolean;
};

export async function closeBiblePreviewPaneFromState(
    input: BiblePreviewPaneStateFlowInput,
    options: CloseBiblePreviewPaneStateFlowOptions = {},
): Promise<void> {
    await closeBiblePreviewPane({
        app: input.app,
        previewViewType: input.previewViewType,
        previewPanelSide: input.previewPanelSide,
        biblePreviewPaneIsActiveInSideDock: input.getBiblePreviewPaneIsActiveInSideDock(),
        collapseSideDock: options.collapseSideDock,
        requireActivePreview: options.requireActivePreview,
        setBiblePreviewPaneIsActiveInSideDock: input.setBiblePreviewPaneIsActiveInSideDock,
        resetLastPanelEscapeTime: () => input.setLastPanelEscapeTime(0),
    });
}

export function handleBiblePreviewPanelEscapeKeydown(
    input: BiblePreviewPaneStateFlowInput,
    event: KeyboardEvent,
): void {
    if (event.key !== "Escape") {
        return;
    }
    if (input.isFloatingPreviewVisible()) {
        input.setLastPanelEscapeTime(0);
        return;
    }
    const panelLeaf = getFirstWorkspaceLeafOfType(input.app, input.previewViewType) ?? undefined;
    if (panelLeaf === undefined || !isBiblePreviewPaneActive(input)) {
        input.setLastPanelEscapeTime(0);
        return;
    }
    const now = Date.now();
    const isSecondEscape = now - input.getLastPanelEscapeTime() <= 1200;
    input.setLastPanelEscapeTime(now);
    event.preventDefault();
    event.stopPropagation();
    if (!isSecondEscape) {
        return;
    }
    input.closeActiveBiblePreviewPane();
}

export function handleBiblePreviewActiveLeafChange(
    input: BiblePreviewPaneStateFlowInput,
    activeLeaf: WorkspaceLeaf | null,
): void {
    if (activeLeaf?.view.getViewType() === input.previewViewType) {
        input.setBiblePreviewPaneIsActiveInSideDock(true);
        return;
    }
    if (isSideDockUtilityLeaf(activeLeaf, input.previewViewType)) {
        input.setBiblePreviewPaneIsActiveInSideDock(false);
        return;
    }
    if (!input.isClosePreviewOnActiveLeafChangeEnabled()) {
        return;
    }
    input.hideFloatingBiblePreview();
    input.closeActiveBiblePreviewPane();
}

function isBiblePreviewPaneActive(input: BiblePreviewPaneStateFlowInput): boolean {
    return isBiblePreviewPaneActiveInSideDock({
        app: input.app,
        previewViewType: input.previewViewType,
        previewPanelSide: input.previewPanelSide,
        biblePreviewPaneIsActiveInSideDock: input.getBiblePreviewPaneIsActiveInSideDock(),
    });
}
