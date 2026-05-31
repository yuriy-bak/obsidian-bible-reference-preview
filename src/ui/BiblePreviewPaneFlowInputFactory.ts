import type { App, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";
import {
    detachDuplicateWorkspaceLeavesOfType,
    expandBiblePreviewSideDock,
    getFirstWorkspaceLeafOfType,
    revealLeafWithoutStealingEditorFocus,
} from "../workspace/BiblePreviewWorkspace";
import type { BiblePreviewPaneFlowInput } from "./BiblePreviewPaneFlow";
import { BIBLE_PREVIEW_VIEW_TYPE, type BiblePreviewPaneViewInput, type BiblePreviewScrollCommand } from "./BiblePreviewPaneView";

export type BiblePreviewPaneFlowInputFactoryInput = {
    app: App;
    isMobile: boolean;
    getPreviewPanelSide(): BiblePreviewPanelSide;
    createBiblePreviewPaneViewInput(): BiblePreviewPaneViewInput;
    waitForNextFrame(): Promise<void>;
    setLastPanePreviewContent(content: BiblePreviewContent): void;
    setSuppressPreviewActiveLeafChange(value: boolean): void;
    setBiblePreviewPaneIsActiveInSideDock(value: boolean): void;
};

type ScrollBiblePreviewPaneFlowInput = Omit<BiblePreviewPaneFlowInput, "content" | "setLastPanePreviewContent"> & {
    command: BiblePreviewScrollCommand;
};

function createCommonBiblePreviewPaneFlowInput(input: BiblePreviewPaneFlowInputFactoryInput): Omit<BiblePreviewPaneFlowInput, "content" | "reveal" | "setLastPanePreviewContent"> {
    return {
        app: input.app,
        isMobile: input.isMobile,
        getPreviewPanelSide: input.getPreviewPanelSide,
        createBiblePreviewPaneViewInput: input.createBiblePreviewPaneViewInput,
        getFirstWorkspaceLeafOfType: (viewType) => getFirstWorkspaceLeafOfType(input.app, viewType),
        detachDuplicateWorkspaceLeavesOfType: (viewType: string, keepLeaf: WorkspaceLeaf) => detachDuplicateWorkspaceLeavesOfType(input.app, viewType, keepLeaf),
        revealLeafWithoutStealingEditorFocus: (leaf, revealOptions) => revealLeafWithoutStealingEditorFocus({
            app: input.app,
            leaf,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: input.getPreviewPanelSide(),
            restoreActiveLeaf: revealOptions?.restoreActiveLeaf ?? null,
            focus: revealOptions?.focus === true,
            isMobile: input.isMobile,
            setSuppressPreviewActiveLeafChange: input.setSuppressPreviewActiveLeafChange,
        }),
        waitForNextFrame: input.waitForNextFrame,
        expandBiblePreviewSideDock: () => expandBiblePreviewSideDock(input.app, input.getPreviewPanelSide()),
        setSuppressPreviewActiveLeafChange: input.setSuppressPreviewActiveLeafChange,
        setBiblePreviewPaneIsActiveInSideDock: input.setBiblePreviewPaneIsActiveInSideDock,
    };
}

export function createShowBiblePreviewInPanelFlowInput(
    input: BiblePreviewPaneFlowInputFactoryInput,
    content: BiblePreviewContent,
    reveal?: boolean,
): BiblePreviewPaneFlowInput {
    return {
        ...createCommonBiblePreviewPaneFlowInput(input),
        content,
        reveal,
        setLastPanePreviewContent: input.setLastPanePreviewContent,
    };
}

export function createScrollBiblePreviewPaneFlowInput(
    input: BiblePreviewPaneFlowInputFactoryInput,
    command: BiblePreviewScrollCommand,
): ScrollBiblePreviewPaneFlowInput {
    return {
        ...createCommonBiblePreviewPaneFlowInput(input),
        command,
        reveal: true,
    };
}
