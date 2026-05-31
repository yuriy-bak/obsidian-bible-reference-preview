import type { App, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewController } from "../editor/BiblePreviewController";
import { refreshEditorPreviewControllerLocalizedLabels } from "../editor/EditorPreviewControllerRegistration";
import { getWorkspaceLeavesOfType } from "../workspace/BiblePreviewWorkspace";
import { refreshBiblePreviewPaneViewInputs } from "./BiblePreviewPaneFlow";
import type { BiblePreviewPaneViewInput } from "./BiblePreviewPaneView";
import type { BibleReadingModePreviewController } from "./BibleReadingModePreviewController";

export type BiblePreviewLocalizedRefreshFlowInput = {
    app: App;
    previewControllers: Iterable<BiblePreviewController>;
    readingModePreviewController: BibleReadingModePreviewController | null;
    refreshFloatingPreviewLabels(): void;
    createBiblePreviewPaneViewInput(): BiblePreviewPaneViewInput;
};

export function refreshBiblePreviewLocalizedLabels(input: BiblePreviewLocalizedRefreshFlowInput): void {
    input.refreshFloatingPreviewLabels();
    refreshEditorPreviewControllerLocalizedLabels(input.previewControllers);
    input.readingModePreviewController?.refreshLocalizedLabels();
    refreshBiblePreviewPaneViewInputs({
        getWorkspaceLeavesOfType: (viewType: string): WorkspaceLeaf[] => getWorkspaceLeavesOfType(input.app, viewType),
        createBiblePreviewPaneViewInput: input.createBiblePreviewPaneViewInput,
    });
}
