import type { Plugin, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, type BiblePreviewPaneViewInput } from "../ui/BiblePreviewPaneView";
import { REFERENCE_USAGE_VIEW_TYPE, ReferenceUsagePaneView, type ReferenceUsagePaneViewInput } from "../ui/ReferenceUsagePaneView";

type RegisterView = Plugin["registerView"];

export type PluginViewRegistrationInput = {
    registerView: RegisterView;
    createBiblePreviewPaneViewInput(): BiblePreviewPaneViewInput;
    createReferenceUsagePaneViewInput(): ReferenceUsagePaneViewInput;
    getLastPanePreviewContent(): BiblePreviewContent | null;
};

export function registerPluginViews(input: PluginViewRegistrationInput): void {
    input.registerView(BIBLE_PREVIEW_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
        const view = new BiblePreviewPaneView(leaf, input.createBiblePreviewPaneViewInput());
        const lastPanePreviewContent = input.getLastPanePreviewContent();
        if (lastPanePreviewContent !== null) {
            window.setTimeout(() => view.setContent(lastPanePreviewContent), 0);
        }
        return view;
    });

    input.registerView(
        REFERENCE_USAGE_VIEW_TYPE,
        (leaf: WorkspaceLeaf) => new ReferenceUsagePaneView(leaf, input.createReferenceUsagePaneViewInput()),
    );
}
