import type { App, View, WorkspaceLeaf } from "obsidian";
import { REFERENCE_USAGE_VIEW_TYPE, ReferenceUsagePaneView, type ReferenceUsagePaneViewInput } from "../ui/ReferenceUsagePaneView";
import type { ReferenceUsageResultGroup } from "./ReferenceUsageChapterGroups";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";

export type ReferenceUsagePaneFlowInput = {
    app: App;
    createReferenceUsagePaneViewInput: () => ReferenceUsagePaneViewInput;
    getFirstWorkspaceLeafOfType: (viewType: string) => WorkspaceLeaf | null;
    detachDuplicateWorkspaceLeavesOfType: (viewType: string, keepLeaf: WorkspaceLeaf) => Promise<void>;
    revealLeafWithoutStealingEditorFocus: (leaf: WorkspaceLeaf, options?: { focus?: boolean }) => Promise<void>;
};

export async function showReferenceUsageResultsInPanel(
    input: ReferenceUsagePaneFlowInput,
    titleText: string,
    results: ReferenceUsageSearchResult[],
    groups?: ReferenceUsageResultGroup[],
): Promise<void> {
    const view = await getOrCreateReferenceUsagePaneView(input);
    if (view === null) {
        return;
    }
    view.refreshInput(input.createReferenceUsagePaneViewInput());
    view.setResults(titleText, results, groups);
}

async function getOrCreateReferenceUsagePaneView(input: ReferenceUsagePaneFlowInput): Promise<ReferenceUsagePaneView | null> {
    const existingLeaf = input.getFirstWorkspaceLeafOfType(REFERENCE_USAGE_VIEW_TYPE);
    if (existingLeaf !== null) {
        const existingView = await ensureLeafViewLoaded({
            leaf: existingLeaf,
            viewType: REFERENCE_USAGE_VIEW_TYPE,
            active: true,
            isExpectedView: isReferenceUsagePaneView,
        });
        if (existingView !== null) {
            await input.revealLeafWithoutStealingEditorFocus(existingLeaf, { focus: true });
            await input.detachDuplicateWorkspaceLeavesOfType(REFERENCE_USAGE_VIEW_TYPE, existingLeaf);
            existingView.refreshInput(input.createReferenceUsagePaneViewInput());
            return existingView;
        }
    }

    const leaf = input.app.workspace.getRightLeaf(false);
    if (leaf === null) {
        return null;
    }
    await leaf.setViewState({ type: REFERENCE_USAGE_VIEW_TYPE, active: true });
    await input.revealLeafWithoutStealingEditorFocus(leaf, { focus: true });
    await input.detachDuplicateWorkspaceLeavesOfType(REFERENCE_USAGE_VIEW_TYPE, leaf);
    const view = leaf.view;
    return isReferenceUsagePaneView(view) ? view : null;
}

function isReferenceUsagePaneView(view: View): view is ReferenceUsagePaneView {
    return view instanceof ReferenceUsagePaneView;
}
