import { App, MarkdownView, type WorkspaceLeaf } from "obsidian";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, type BiblePreviewPaneViewInput } from "./BiblePreviewPaneView";

export type BiblePreviewPaneRevealOptions = {
    restoreActiveLeaf?: WorkspaceLeaf | null;
    focus?: boolean;
};

export type BiblePreviewPaneFlowInput = {
    app: App;
    content: BiblePreviewContent;
    reveal?: boolean;
    isMobile: boolean;
    getPreviewPanelSide(): BiblePreviewPanelSide;
    createBiblePreviewPaneViewInput(): BiblePreviewPaneViewInput;
    getFirstWorkspaceLeafOfType(viewType: string): WorkspaceLeaf | null;
    detachDuplicateWorkspaceLeavesOfType(viewType: string, keepLeaf: WorkspaceLeaf): Promise<void>;
    revealLeafWithoutStealingEditorFocus(leaf: WorkspaceLeaf, options?: BiblePreviewPaneRevealOptions): Promise<void>;
    waitForNextFrame(): Promise<void>;
    expandBiblePreviewSideDock(): void;
    setLastPanePreviewContent(content: BiblePreviewContent): void;
    setSuppressPreviewActiveLeafChange(value: boolean): void;
    setBiblePreviewPaneIsActiveInSideDock(value: boolean): void;
};

export async function showBiblePreviewInPanel(input: BiblePreviewPaneFlowInput): Promise<void> {
    input.setLastPanePreviewContent(input.content);
    const reveal = input.reveal !== false;
    const activeLeafBeforeOpen = input.app.workspace.activeLeaf;
    const restoreActiveLeaf = reveal && !input.isMobile && activeLeafBeforeOpen?.view instanceof MarkdownView ? activeLeafBeforeOpen : null;
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
    if (leaf === null || !(leaf.view instanceof BiblePreviewPaneView)) {
        return;
    }

    const activeLeafBeforeScroll = input.app.workspace.activeLeaf;
    await input.revealLeafWithoutStealingEditorFocus(leaf, {
        restoreActiveLeaf: !input.isMobile && activeLeafBeforeScroll?.view instanceof MarkdownView ? activeLeafBeforeScroll : null,
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
        const existingView = existingLeaf.view;
        if (existingView instanceof BiblePreviewPaneView) {
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
        const createdLeaf = input.getFirstWorkspaceLeafOfType(BIBLE_PREVIEW_VIEW_TYPE) ?? leaf;
        await input.detachDuplicateWorkspaceLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE, createdLeaf);
        const view = createdLeaf.view;
        if (view instanceof BiblePreviewPaneView) {
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
