import type { App, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewPanelSide } from "../settings/PluginSettings";
import {
    detachDuplicateWorkspaceLeavesOfType,
    getFirstWorkspaceLeafOfType,
    revealLeafWithoutStealingEditorFocus,
} from "../workspace/BiblePreviewWorkspace";
import type { ReferenceUsagePaneFlowInput } from "./ReferenceUsagePaneFlow";
import { createReferenceUsagePaneViewInput } from "./ReferenceUsagePaneViewInputFactory";
import type { BiblePluginLocale } from "../i18n/I18n";

export type ReferenceUsagePaneFlowInputFactoryInput = {
    app: App;
    interfaceLanguage: BiblePluginLocale;
    previewViewType: string;
    previewPanelSide: BiblePreviewPanelSide;
    isMobile: boolean;
    waitForNextAnimationFrame(): Promise<void>;
    setSuppressPreviewActiveLeafChange(value: boolean): void;
};

export function createReferenceUsagePaneFlowInput(input: ReferenceUsagePaneFlowInputFactoryInput): ReferenceUsagePaneFlowInput {
    return {
        app: input.app,
        createReferenceUsagePaneViewInput: () => createReferenceUsagePaneViewInput({
            app: input.app,
            interfaceLanguage: input.interfaceLanguage,
            waitForNextAnimationFrame: input.waitForNextAnimationFrame,
        }),
        getFirstWorkspaceLeafOfType: (viewType) => getFirstWorkspaceLeafOfType(input.app, viewType),
        detachDuplicateWorkspaceLeavesOfType: (viewType: string, keepLeaf: WorkspaceLeaf) => detachDuplicateWorkspaceLeavesOfType(input.app, viewType, keepLeaf),
        revealLeafWithoutStealingEditorFocus: (leaf, options) => revealLeafWithoutStealingEditorFocus({
            app: input.app,
            leaf,
            previewViewType: input.previewViewType,
            previewPanelSide: input.previewPanelSide,
            restoreActiveLeaf: null,
            focus: options?.focus === true,
            isMobile: input.isMobile,
            setSuppressPreviewActiveLeafChange: input.setSuppressPreviewActiveLeafChange,
        }),
    };
}
