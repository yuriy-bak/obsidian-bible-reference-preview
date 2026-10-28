import type { View, WorkspaceLeaf } from "obsidian";

export type EnsureLeafViewLoadedInput<TView extends View> = {
    leaf: WorkspaceLeaf;
    viewType: string;
    active: boolean;
    isExpectedView: (view: View) => view is TView;
};

// After a restart Obsidian restores side panel tabs as deferred views: the leaf exists,
// but its view is a placeholder until the tab is shown. Load it before checking the view type
// so an existing tab is reused instead of being replaced (and the replacement then detached).
export async function ensureLeafViewLoaded<TView extends View>(input: EnsureLeafViewLoadedInput<TView>): Promise<TView | null> {
    await input.leaf.loadIfDeferred();
    if (!input.isExpectedView(input.leaf.view)) {
        await input.leaf.setViewState({ type: input.viewType, active: input.active });
    }
    return input.isExpectedView(input.leaf.view) ? input.leaf.view : null;
}
