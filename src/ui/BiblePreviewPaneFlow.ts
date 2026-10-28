import { App, MarkdownView, type View, type WorkspaceLeaf } from "obsidian";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, type BiblePreviewPaneViewInput } from "./BiblePreviewPaneView";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";

export type BiblePreviewPaneRevealOptions = {
    restoreActiveLeaf?: WorkspaceLeaf | null;
    focus?: boolean;
};

export type BiblePreviewPaneFlowInput = {
    app: App;
    content: BiblePreviewContent;
    reveal?: boolean;
    isMobile: boolean;
    getPreviewPanelSide: () => BiblePreviewPanelSide;
    createBiblePreviewPaneViewInput: () => BiblePreviewPaneViewInput;
    getFirstWorkspaceLeafOfType: (viewType: string) => WorkspaceLeaf | null;
    detachDuplicateWorkspaceLeavesOfType: (viewType: string, keepLeaf: WorkspaceLeaf) => Promise<void>;
    revealLeafWithoutStealingEditorFocus: (leaf: WorkspaceLeaf, options?: BiblePreviewPaneRevealOptions) => Promise<void>;
    waitForNextFrame: () => Promise<void>;
    expandBiblePreviewSideDock: () => void;
    setLastPanePreviewContent: (content: BiblePreviewContent) => void;
    setSuppressPreviewActiveLeafChange: (value: boolean) => void;
    setBiblePreviewPaneIsActiveInSideDock: (value: boolean) => void;
};

export async function showBiblePreviewInPanel(input: BiblePreviewPaneFlowInput): Promise<void> {
    input.setLastPanePreviewContent(input.content);
    const reveal = input.reveal !== false;
    const activeMarkdownLeaf = input.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null;
    const restoreActiveLeaf = reveal && !input.isMobile ? activeMarkdownLeaf : null;
    const view = await getOrCreateBiblePreviewPaneView(input, { restoreActiveLeaf, reveal });
    if (view === null) {
        return;
    }
    view.setContent(input.content);
}

export async function scrollBiblePreviewPane(
    input: Omit<BiblePreviewPaneFlowInput, "content" | "setLastPanePreviewContent"> & {
        command: import("./BiblePreviewPaneView").BiblePreviewScrollCommand;
    },
): Promise<void> {
    const leaf = input.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE);
    await leaf?.loadIfDeferred();
    if (leaf === null || !(leaf.view instanceof BiblePreviewPaneView)) {
        return;
    }

    const activeMarkdownLeaf = input.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null;
    await input.revealLeafWithoutStealingEditorFocus(leaf, {
        restoreActiveLeaf: !input.isMobile ? activeMarkdownLeaf : null,
        focus: false,
    });
    leaf.view.scrollPreview(input.command);
}

export function refreshBiblePreviewPaneViewInputs(input: Pick<BiblePreviewPaneFlowInput, "createBiblePreviewPaneViewInput"> & {
    getWorkspaceLeavesOfType(viewType: string): WorkspaceLeaf[];
}): void {
    for (const leaf of input.getWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE)) {
        if (leaf.view instanceof BiblePreviewPaneView) {
            leaf.view.refreshInput(input.createBiblePreviewPaneViewInput());
        }
    }
}

async function getOrCreateBiblePreviewPaneView(
    input: BiblePreviewPaneFlowInput,
    options: { restoreActiveLeaf?: WorkspaceLeaf | null; reveal?: boolean } = {},
): Promise<BiblePreviewPaneView | null> {
    const reveal = options.reveal !== false;
    const existingLeaf = input.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE);
    if (existingLeaf !== null) {
        const existingView = await ensureLeafViewLoaded({
            leaf: existingLeaf,
            viewType: BIBLE_PREVIEW_VIEW_TYPE,
            active: reveal,
            isExpectedView: isBiblePreviewPaneView,
        });
        if (existingView !== null) {
            if (reveal) {
                input.setBiblePreviewPaneIsActiveInSideDock(true);
                input.expandBiblePreviewSideDock();
                await input.revealLeafWithoutStealingEditorFocus(existingLeaf, {
                    restoreActiveLeaf: options.restoreActiveLeaf ?? null,
                    focus: false,
                });
            }
            await input.detachDuplicateWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE, existingLeaf);
            existingView.refreshInput(input.createBiblePreviewPaneViewInput());
            return existingView;
        }
    }

    const leaf = input.getPreviewPanelSide() === "left"
        ? input.app.workspace.getLeftLeaf(false)
        : input.app.workspace.getRightLeaf(false);
    if (leaf === null) {
        return null;
    }

    input.setSuppressPreviewActiveLeafChange(true);
    try {
        if (reveal) {
            input.expandBiblePreviewSideDock();
        }
        await leaf.setViewState({ type: BIBLE_PREVIEW_VIEW_TYPE, active: reveal });
        if (reveal) {
            input.setBiblePreviewPaneIsActiveInSideDock(true);
            input.expandBiblePreviewSideDock();
            await input.revealLeafWithoutStealingEditorFocus(leaf, {
                restoreActiveLeaf: options.restoreActiveLeaf ?? null,
                focus: false,
            });
        }
        await input.waitForNextFrame();
        await input.waitForNextFrame();
        await input.detachDuplicateWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE, leaf);
        const view = leaf.view;
        if (isBiblePreviewPaneView(view)) {
            view.refreshInput(input.createBiblePreviewPaneViewInput());
            return view;
        }
        return null;
    } finally {
        window.setTimeout(() => {
            input.setSuppressPreviewActiveLeafChange(false);
        }, 100);
    }
}

function isBiblePreviewPaneView(view: View): view is BiblePreviewPaneView {
    return view instanceof BiblePreviewPaneView;
}
