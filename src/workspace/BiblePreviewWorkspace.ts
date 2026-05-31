import { App, type WorkspaceLeaf } from "obsidian";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";

export type BiblePreviewSideDock = {
    collapsed?: boolean;
    collapse?(): void;
    expand?(): void;
    activeLeaf?: WorkspaceLeaf;
    activeTab?: { leaf?: WorkspaceLeaf };
    setActiveLeaf?(leaf: WorkspaceLeaf): void;
};

type BiblePreviewWorkspaceReveal = {
    revealLeaf?(leaf: WorkspaceLeaf): Promise<void> | void;
};

type BiblePreviewWorkspaceFocus = {
    setActiveLeaf?(leaf: WorkspaceLeaf, params?: { focus?: boolean }): void;
};

type BiblePreviewWorkspaceLeafIterator = {
    iterateAllLeaves?(callback: (leaf: WorkspaceLeaf) => void): void;
};

export type RevealLeafWithoutStealingEditorFocusInput = {
    app: App;
    leaf: WorkspaceLeaf;
    previewViewType: string;
    previewPanelSide: BiblePreviewPanelSide;
    restoreActiveLeaf?: WorkspaceLeaf | null;
    focus?: boolean;
    isMobile: boolean;
    setSuppressPreviewActiveLeafChange(value: boolean): void;
};

export function getWorkspaceLeavesOfType(app: App, viewType: string): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [...app.workspace.getLeavesOfType(viewType)];
    const workspaceWithIterator = app.workspace as typeof app.workspace & BiblePreviewWorkspaceLeafIterator;

    if (typeof workspaceWithIterator.iterateAllLeaves === "function") {
        workspaceWithIterator.iterateAllLeaves((leaf) => {
            if (leaf.view.getViewType() === viewType && !leaves.includes(leaf)) {
                leaves.push(leaf);
            }
        });
    }

    return leaves;
}

export function getFirstWorkspaceLeafOfType(app: App, viewType: string): WorkspaceLeaf | null {
    return getWorkspaceLeavesOfType(app, viewType)[0] ?? null;
}

export async function detachDuplicateWorkspaceLeavesOfType(app: App, viewType: string, keepLeaf: WorkspaceLeaf): Promise<void> {
    const duplicateLeaves = getWorkspaceLeavesOfType(app, viewType).filter((leaf) => leaf !== keepLeaf);
    if (duplicateLeaves.length === 0) {
        return;
    }
    await Promise.all(duplicateLeaves.map((leaf) => leaf.detach()));
}

export async function revealLeafWithoutStealingEditorFocus(input: RevealLeafWithoutStealingEditorFocusInput): Promise<void> {
    const workspace = input.app.workspace as typeof input.app.workspace & BiblePreviewWorkspaceFocus & BiblePreviewWorkspaceReveal;
    const shouldSuppressPreviewLeafChange = input.leaf.view.getViewType() === input.previewViewType;
    const restoreActiveLeaf = input.restoreActiveLeaf ?? null;
    const focus = input.focus === true;

    if (shouldSuppressPreviewLeafChange) {
        input.setSuppressPreviewActiveLeafChange(true);
    }

    try {
        expandSideDockForLeaf(input.app, input.leaf, input.previewPanelSide, input.previewViewType);
        activateLeafInSideDock(input.app, input.leaf, input.previewPanelSide, input.previewViewType);

        if (typeof workspace.revealLeaf === "function") {
            await workspace.revealLeaf(input.leaf);
        }

        expandSideDockForLeaf(input.app, input.leaf, input.previewPanelSide, input.previewViewType);
        activateLeafInSideDock(input.app, input.leaf, input.previewPanelSide, input.previewViewType);

        if (typeof workspace.setActiveLeaf === "function") {
            workspace.setActiveLeaf(input.leaf, { focus });
        }

        expandSideDockForLeaf(input.app, input.leaf, input.previewPanelSide, input.previewViewType);
        activateLeafInSideDock(input.app, input.leaf, input.previewPanelSide, input.previewViewType);
    } finally {
        if (restoreActiveLeaf !== null && !focus && !input.isMobile) {
            window.setTimeout(() => restoreActiveLeafAfterPreviewOpen(input.app, restoreActiveLeaf, input.previewViewType), 0);
            window.setTimeout(() => restoreActiveLeafAfterPreviewOpen(input.app, restoreActiveLeaf, input.previewViewType), 50);
        }
        if (shouldSuppressPreviewLeafChange) {
            window.setTimeout(() => {
                input.setSuppressPreviewActiveLeafChange(false);
            }, 100);
        }
    }
}

export function activateLeafInSideDock(
    app: App,
    leaf: WorkspaceLeaf,
    previewPanelSide: BiblePreviewPanelSide,
    previewViewType: string,
): void {
    activateLeafInSplit(leaf);
    const sideDock = getSideDockForLeaf(app, leaf, previewPanelSide, previewViewType);
    if (sideDock === undefined) {
        return;
    }
    if (typeof sideDock.setActiveLeaf === "function") {
        sideDock.setActiveLeaf(leaf);
    }
    sideDock.activeLeaf = leaf;
    if (sideDock.activeTab !== undefined) {
        sideDock.activeTab.leaf = leaf;
    }
}

export function activateLeafInSplit(leaf: WorkspaceLeaf): void {
    let parent: unknown = leaf;
    const visitedParents = new Set<unknown>();

    while (typeof parent === "object" && parent !== null && !Array.isArray(parent) && !visitedParents.has(parent)) {
        visitedParents.add(parent);
        const parentRecord = parent as Record<string, unknown>;
        const setActiveLeaf = parentRecord["setActiveLeaf"];
        if (typeof setActiveLeaf === "function") {
            setActiveLeaf.call(parent, leaf);
        }
        parent = parentRecord["parent"];
    }
}

export function expandSideDockForLeaf(
    app: App,
    leaf: WorkspaceLeaf,
    previewPanelSide: BiblePreviewPanelSide,
    previewViewType: string,
): void {
    const sideDock = getSideDockForLeaf(app, leaf, previewPanelSide, previewViewType);
    if (sideDock !== undefined && sideDock.collapsed === true && typeof sideDock.expand === "function") {
        sideDock.expand();
    }
}

export function getSideDockForLeaf(
    app: App,
    leaf: WorkspaceLeaf,
    previewPanelSide: BiblePreviewPanelSide,
    previewViewType: string,
): BiblePreviewSideDock | undefined {
    const workspaceWithSideDocks = app.workspace as typeof app.workspace & {
        leftSplit?: BiblePreviewSideDock;
        rightSplit?: BiblePreviewSideDock;
    };
    const leftSplit = workspaceWithSideDocks.leftSplit;
    const rightSplit = workspaceWithSideDocks.rightSplit;
    const leafContainer = (leaf.view as typeof leaf.view & { containerEl?: HTMLElement }).containerEl;

    if (getSideDockActiveLeaf(leftSplit) === leaf || (leafContainer?.closest(".workspace-sidedock.mod-left-split") ?? null) !== null) {
        return leftSplit;
    }
    if (getSideDockActiveLeaf(rightSplit) === leaf || (leafContainer?.closest(".workspace-sidedock.mod-right-split") ?? null) !== null) {
        return rightSplit;
    }

    if (leaf.view.getViewType() === previewViewType) {
        return getBiblePreviewSideDock(app, previewPanelSide);
    }
    return rightSplit ?? leftSplit;
}

export function restoreActiveLeafAfterPreviewOpen(app: App, activeLeaf: WorkspaceLeaf | null, previewViewType: string): void {
    if (activeLeaf === null || activeLeaf.view.getViewType() === previewViewType) {
        return;
    }
    const workspaceWithFocus = app.workspace as typeof app.workspace & BiblePreviewWorkspaceFocus;
    if (typeof workspaceWithFocus.setActiveLeaf !== "function") {
        return;
    }
    workspaceWithFocus.setActiveLeaf(activeLeaf, { focus: true });
}

export function getBiblePreviewSideDock(app: App, previewPanelSide: BiblePreviewPanelSide): BiblePreviewSideDock | undefined {
    const workspaceWithSideDocks = app.workspace as typeof app.workspace & {
        leftSplit?: BiblePreviewSideDock;
        rightSplit?: BiblePreviewSideDock;
    };
    return previewPanelSide === "left"
        ? workspaceWithSideDocks.leftSplit
        : workspaceWithSideDocks.rightSplit;
}

export function getSideDockActiveLeaf(sideDock: BiblePreviewSideDock | undefined): WorkspaceLeaf | undefined {
    return sideDock?.activeLeaf ?? sideDock?.activeTab?.leaf;
}

export function isSideDockUtilityLeaf(activeLeaf: WorkspaceLeaf | null, previewViewType: string): boolean {
    if (activeLeaf === null) {
        return false;
    }
    const viewType = activeLeaf.view.getViewType();
    return viewType !== "markdown" && viewType !== previewViewType;
}

export function expandBiblePreviewSideDock(app: App, previewPanelSide: BiblePreviewPanelSide): void {
    const sideDock = getBiblePreviewSideDock(app, previewPanelSide);
    if (sideDock === undefined || sideDock.collapsed !== true || typeof sideDock.expand !== "function") {
        return;
    }
    sideDock.expand();
}

export type IsBiblePreviewPaneActiveInSideDockInput = {
    app: App;
    previewViewType: string;
    previewPanelSide: BiblePreviewPanelSide;
    biblePreviewPaneIsActiveInSideDock: boolean;
};

export type CloseBiblePreviewPaneInput = IsBiblePreviewPaneActiveInSideDockInput & {
    collapseSideDock?: boolean;
    requireActivePreview?: boolean;
    setBiblePreviewPaneIsActiveInSideDock(value: boolean): void;
    resetLastPanelEscapeTime(): void;
};

export function collapseBiblePreviewSideDock(app: App, previewPanelSide: BiblePreviewPanelSide): void {
    const sideDock = getBiblePreviewSideDock(app, previewPanelSide);
    if (sideDock === undefined || sideDock.collapsed === true || typeof sideDock.collapse !== "function") {
        return;
    }
    sideDock.collapse();
}

export function isBiblePreviewPaneActiveInSideDock(input: IsBiblePreviewPaneActiveInSideDockInput): boolean {
    const activeSideDockLeaf = getSideDockActiveLeaf(getBiblePreviewSideDock(input.app, input.previewPanelSide));
    if (activeSideDockLeaf !== undefined) {
        return activeSideDockLeaf.view.getViewType() === input.previewViewType;
    }
    if (input.biblePreviewPaneIsActiveInSideDock) {
        return getWorkspaceLeavesOfType(input.app, input.previewViewType).length > 0;
    }
    return getWorkspaceLeavesOfType(input.app, input.previewViewType).some((leaf) => {
        const viewWithContainer = leaf.view as typeof leaf.view & { containerEl?: HTMLElement };
        return viewWithContainer.containerEl?.closest(".workspace-leaf.mod-active") !== null;
    });
}

export async function closeBiblePreviewPane(input: CloseBiblePreviewPaneInput): Promise<void> {
    const shouldCloseActivePreview = isBiblePreviewPaneActiveInSideDock(input);
    if (input.requireActivePreview === true && !shouldCloseActivePreview) {
        return;
    }
    const shouldCollapseSideDock = input.collapseSideDock === true && shouldCloseActivePreview;
    const previewLeaves = getWorkspaceLeavesOfType(input.app, input.previewViewType);
    if (previewLeaves.length === 0) {
        input.resetLastPanelEscapeTime();
        return;
    }
    await Promise.all(previewLeaves.map((leaf) => leaf.detach()));
    input.resetLastPanelEscapeTime();
    input.setBiblePreviewPaneIsActiveInSideDock(false);
    if (shouldCollapseSideDock) {
        collapseBiblePreviewSideDock(input.app, input.previewPanelSide);
        window.setTimeout(() => collapseBiblePreviewSideDock(input.app, input.previewPanelSide), 0);
    }
}
