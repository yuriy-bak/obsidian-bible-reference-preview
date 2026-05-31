import type { App } from "obsidian";
import type { BiblePreviewContent, BiblePreviewReferenceBlock } from "../application/formatBibleTexts";
import type { I18nKey } from "../i18n/I18n";
import type { BiblePreviewDisplayMode, BiblePreviewPanelSide } from "../settings/PluginSettings";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindowInput } from "./FloatingBiblePreviewWindow";
import {
    scrollBiblePreviewPane as scrollBiblePreviewPaneFlow,
    showBiblePreviewInPanel as showBiblePreviewInPanelFlow,
    type BiblePreviewPaneFlowInput,
} from "./BiblePreviewPaneFlow";
import {
    createScrollBiblePreviewPaneFlowInput as createScrollBiblePreviewPaneFlowInputFlow,
    createShowBiblePreviewInPanelFlowInput as createShowBiblePreviewInPanelFlowInputFlow,
    type BiblePreviewPaneFlowInputFactoryInput,
} from "./BiblePreviewPaneFlowInputFactory";
import {
    closeBiblePreviewPaneFromState as closeBiblePreviewPaneFromStateFlow,
    type BiblePreviewPaneStateFlowInput,
    type CloseBiblePreviewPaneStateFlowOptions,
} from "./BiblePreviewPaneStateFlow";
import { BIBLE_PREVIEW_VIEW_TYPE, type BiblePreviewPaneViewInput, type BiblePreviewScrollCommand } from "./BiblePreviewPaneView";
import {
    createBiblePreviewPaneViewInput as createBiblePreviewPaneViewInputFromFactory,
    createFloatingBiblePreviewWindowInput as createFloatingBiblePreviewWindowInputFromFactory,
    type BiblePreviewViewInputFactoryInput,
} from "./BiblePreviewViewInputFactory";

export type BiblePreviewPluginFlowInput = {
    app: App;
    isMobile: boolean;
    previewViewType: string;
    getPreviewPanelSide(): BiblePreviewPanelSide;
    getPreviewDisplayMode(): BiblePreviewDisplayMode;
    setPreviewDisplayMode(previewDisplayMode: BiblePreviewDisplayMode): void;
    saveSettings(): Promise<void>;
    refreshSettings(): void;
    getActiveTranslationPreviewTitle(): string;
    translate(key: I18nKey, params?: Record<string, string | number>): string;
    getFloatingPreviewBackgroundColor(): string;
    isPreviewComparisonEnabled(): boolean;
    getPreviewComparisonTranslationOptions(): PreviewComparisonTranslationOption[];
    showReferenceUsagesForPreviewBlock(block: BiblePreviewReferenceBlock): void;
    setComparisonTranslationEnabled(translationId: string, enabled: boolean): void;
    toggleBiblePreviewComparison(content: BiblePreviewContent): void;
    showFloatingBiblePreview(content: BiblePreviewContent, anchor: FloatingBiblePreviewAnchor, options: { reveal?: boolean }): void;
    scrollFloatingBiblePreview(command: BiblePreviewScrollCommand): void;
    waitForNextFrame(): Promise<void>;
    setLastPanePreviewContent(content: BiblePreviewContent): void;
    setSuppressPreviewActiveLeafChange(value: boolean): void;
    getBiblePreviewPaneIsActiveInSideDock(): boolean;
    setBiblePreviewPaneIsActiveInSideDock(value: boolean): void;
    getLastPanelEscapeTime(): number;
    setLastPanelEscapeTime(value: number): void;
    isFloatingPreviewVisible(): boolean;
    isClosePreviewOnActiveLeafChangeEnabled(): boolean;
    isPluginActive(): boolean;
    hideFloatingBiblePreview(resetPosition?: boolean): void;
    refreshFloatingPreviewLabels(input: FloatingBiblePreviewWindowInput): void;
    isFloatingPreviewTarget(target: Node): boolean;
};

export function createPreviewViewInputFactoryInput(input: BiblePreviewPluginFlowInput): BiblePreviewViewInputFactoryInput {
    return {
        getActiveTranslationPreviewTitle: input.getActiveTranslationPreviewTitle,
        translate: input.translate,
        getFloatingPreviewBackgroundColor: input.getFloatingPreviewBackgroundColor,
        isPreviewComparisonEnabled: input.isPreviewComparisonEnabled,
        getPreviewComparisonTranslationOptions: input.getPreviewComparisonTranslationOptions,
        showReferenceUsagesForPreviewBlock: input.showReferenceUsagesForPreviewBlock,
        setComparisonTranslationEnabled: input.setComparisonTranslationEnabled,
        toggleBiblePreviewComparison: input.toggleBiblePreviewComparison,
        switchBiblePreviewToPanel: (content) => void switchBiblePreviewToPanel(input, content),
        switchBiblePreviewToFloating: (content) => void switchBiblePreviewToFloating(input, content),
    };
}

export function createFloatingBiblePreviewWindowInput(input: BiblePreviewPluginFlowInput): FloatingBiblePreviewWindowInput {
    return createFloatingBiblePreviewWindowInputFromFactory(createPreviewViewInputFactoryInput(input));
}

export function createBiblePreviewPaneViewInput(input: BiblePreviewPluginFlowInput): BiblePreviewPaneViewInput {
    return createBiblePreviewPaneViewInputFromFactory(createPreviewViewInputFactoryInput(input));
}

export function createBiblePreviewPaneFlowInputFactoryInput(input: BiblePreviewPluginFlowInput): BiblePreviewPaneFlowInputFactoryInput {
    return {
        app: input.app,
        isMobile: input.isMobile,
        getPreviewPanelSide: input.getPreviewPanelSide,
        createBiblePreviewPaneViewInput: () => createBiblePreviewPaneViewInput(input),
        waitForNextFrame: input.waitForNextFrame,
        setLastPanePreviewContent: input.setLastPanePreviewContent,
        setSuppressPreviewActiveLeafChange: input.setSuppressPreviewActiveLeafChange,
        setBiblePreviewPaneIsActiveInSideDock: input.setBiblePreviewPaneIsActiveInSideDock,
    };
}

export function createBiblePreviewPaneStateFlowInput(input: BiblePreviewPluginFlowInput): BiblePreviewPaneStateFlowInput {
    return {
        app: input.app,
        previewViewType: input.previewViewType,
        previewPanelSide: input.getPreviewPanelSide(),
        getBiblePreviewPaneIsActiveInSideDock: input.getBiblePreviewPaneIsActiveInSideDock,
        setBiblePreviewPaneIsActiveInSideDock: input.setBiblePreviewPaneIsActiveInSideDock,
        getLastPanelEscapeTime: input.getLastPanelEscapeTime,
        setLastPanelEscapeTime: input.setLastPanelEscapeTime,
        isFloatingPreviewVisible: input.isFloatingPreviewVisible,
        isClosePreviewOnActiveLeafChangeEnabled: input.isClosePreviewOnActiveLeafChangeEnabled,
        hideFloatingBiblePreview: () => input.hideFloatingBiblePreview(),
        closeActiveBiblePreviewPane: () => void closeBiblePreviewPane(input, { collapseSideDock: true, requireActivePreview: true }),
    };
}

export function showBiblePreviewContent(
    input: BiblePreviewPluginFlowInput,
    content: BiblePreviewContent,
    anchor: FloatingBiblePreviewAnchor = { type: "default" },
    options: { reveal?: boolean } = {},
): void {
    const reveal = options.reveal !== false;
    if (input.getPreviewDisplayMode() === "side-panel") {
        void showBiblePreviewInPanel(input, content, { reveal });
        input.hideFloatingBiblePreview();
        return;
    }

    showFloatingBiblePreview(input, content, anchor, { reveal });
}

export function showFloatingBiblePreview(
    input: BiblePreviewPluginFlowInput,
    content: BiblePreviewContent,
    anchor: FloatingBiblePreviewAnchor = { type: "default" },
    options: { reveal?: boolean } = {},
): void {
    input.showFloatingBiblePreview(content, anchor, { reveal: options.reveal !== false });
}

export async function switchBiblePreviewToPanel(input: BiblePreviewPluginFlowInput, content: BiblePreviewContent): Promise<void> {
    if (input.getPreviewDisplayMode() !== "side-panel") {
        input.setPreviewDisplayMode("side-panel");
        await input.saveSettings();
        input.refreshSettings();
    }
    await showBiblePreviewInPanel(input, content);
    input.hideFloatingBiblePreview();
}

export async function switchBiblePreviewToFloating(input: BiblePreviewPluginFlowInput, content: BiblePreviewContent): Promise<void> {
    if (input.getPreviewDisplayMode() !== "floating") {
        input.setPreviewDisplayMode("floating");
        await input.saveSettings();
        input.refreshSettings();
    }
    await closeBiblePreviewPane(input, { collapseSideDock: true, requireActivePreview: true });
    showFloatingBiblePreview(input, content, { type: "default" });
}

export async function showBiblePreviewInPanel(
    input: BiblePreviewPluginFlowInput,
    content: BiblePreviewContent,
    options: { reveal?: boolean } = {},
): Promise<void> {
    await showBiblePreviewInPanelFlow(createShowBiblePreviewInPanelFlowInputFlow(
        createBiblePreviewPaneFlowInputFactoryInput(input),
        content,
        options.reveal,
    ));
}

export async function scrollBiblePreview(input: BiblePreviewPluginFlowInput, command: BiblePreviewScrollCommand): Promise<void> {
    if (!input.isPluginActive()) {
        return;
    }

    input.scrollFloatingBiblePreview(command);

    if (input.getPreviewDisplayMode() !== "side-panel") {
        return;
    }

    await scrollBiblePreviewPaneFlow(createScrollBiblePreviewPaneFlowInputFlow(
        createBiblePreviewPaneFlowInputFactoryInput(input),
        command,
    ));
}

export async function closeBiblePreviewPane(
    input: BiblePreviewPluginFlowInput,
    options: CloseBiblePreviewPaneStateFlowOptions = {},
): Promise<void> {
    await closeBiblePreviewPaneFromStateFlow(createBiblePreviewPaneStateFlowInput(input), options);
}

export function hideFloatingBiblePreview(input: BiblePreviewPluginFlowInput, resetPosition = false): void {
    input.hideFloatingBiblePreview(resetPosition);
}

export function refreshFloatingPreviewLabels(input: BiblePreviewPluginFlowInput): void {
    input.refreshFloatingPreviewLabels(createFloatingBiblePreviewWindowInput(input));
}

export function isFloatingPreviewTarget(input: BiblePreviewPluginFlowInput, target: Node): boolean {
    return input.isFloatingPreviewTarget(target);
}
