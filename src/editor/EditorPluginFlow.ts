import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { App } from "obsidian";
import {
    analyzeBiblePreviewParagraph as analyzeBiblePreviewParagraphFlow,
    rebuildBiblePreviewContent as rebuildBiblePreviewContentFlow,
    toggleBiblePreviewComparison as toggleBiblePreviewComparisonFlow,
    type BiblePreviewAnalyzerFlowInput,
} from "../application/BiblePreviewAnalyzerFlow";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { BibleIndex } from "../infrastructure/BibleIndex";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import type { BibleReferenceMatch } from "../parsing/BibleReferenceParser";
import type { BookMapping } from "../parsing/BookMapping";
import type { BiblePreviewDisplayMode, BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { TranslationControllerState } from "../translations/TranslationController";
import type { EditorClickedReference } from "./EditorClickedReference";
import { createEditorCursorExtension } from "./EditorCursorExtension";
import { clearEditorReferenceLinks as clearEditorReferenceLinksFlow, refreshEditorReferenceLinks as refreshEditorReferenceLinksFlow } from "./EditorReferenceLinkDecorationFlow";
import {
    createEditorCursorExtensionInput as createEditorCursorExtensionInputFromFactory,
    createEditorReferenceLinkDecorationFlowInput as createEditorReferenceLinkDecorationFlowInputFromFactory,
    type EditorPluginInputFactoryInput,
} from "./EditorPluginInputFactory";
import type { EditorRuntimeState } from "./EditorRuntimeState";

export type EditorPluginFlowInput = {
    app: App;
    previewViewType: string;
    editorRuntimeState: EditorRuntimeState;
    bibleIndex: BibleIndex;
    bookMapping: BookMapping;
    activeV2Data: BibleIndexV2Data | null;
    translationControllerState: TranslationControllerState;
    getActiveTranslationId(): string | null;
    getBibleReferenceLinkColor(): string;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    getBiblePreviewTriggerMode(): BiblePreviewTriggerMode;
    getBiblePreviewDisplayMode(): BiblePreviewDisplayMode;
    shouldAutoOpenPreviewOnVerseChange(): boolean;
    isPreviewComparisonEnabled(): boolean;
    hasImportedTranslations(): boolean;
    parseMatches(text: string): BibleReferenceMatch[];
    findBibleReferenceMatchAtPosition(view: EditorView, position: number): EditorClickedReference | null;
    getCurrentParagraph(update: ViewUpdate): string;
    setPreviewComparisonEnabled(enabled: boolean): Promise<void>;
    showBiblePreviewContent(content: BiblePreviewContent, options?: { reveal?: boolean }): void;
    refreshFloatingPreviewLabels(): void;
    hideFloatingBiblePreview(): void;
    getMissingVerseText(): string;
    translate(key: "notice.pluginInactive" | "notice.noImportedTranslations" | "notice.referenceUnderCursorNotFound"): string;
};

export function createEditorPluginInputFactoryInput(input: EditorPluginFlowInput): EditorPluginInputFactoryInput {
    return {
        app: input.app,
        previewViewType: input.previewViewType,
        editorRuntimeState: input.editorRuntimeState,
        getActiveTranslationId: input.getActiveTranslationId,
        getBibleReferenceLinkColor: input.getBibleReferenceLinkColor,
        shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
        getBiblePreviewTriggerMode: input.getBiblePreviewTriggerMode,
        getBiblePreviewDisplayMode: input.getBiblePreviewDisplayMode,
        hasImportedTranslations: input.hasImportedTranslations,
        parseMatches: input.parseMatches,
        findBibleReferenceMatchAtPosition: input.findBibleReferenceMatchAtPosition,
        getCurrentParagraph: input.getCurrentParagraph,
        analyzeParagraph: (paragraph) => analyzeParagraph(input, paragraph),
        analyzeReferenceText: (text) => analyzeReferenceText(input, text),
        showBiblePreviewContent: (content) => input.showBiblePreviewContent(content, { reveal: input.shouldAutoOpenPreviewOnVerseChange() }),
        refreshFloatingPreviewLabels: input.refreshFloatingPreviewLabels,
        hideFloatingBiblePreview: input.hideFloatingBiblePreview,
        translate: input.translate,
    };
}

export function createCursorExtension(input: EditorPluginFlowInput) {
    return createEditorCursorExtension(createEditorCursorExtensionInputFromFactory(createEditorPluginInputFactoryInput(input)));
}

export function refreshBibleReferenceLinks(input: EditorPluginFlowInput): void {
    refreshEditorReferenceLinksFlow(createEditorReferenceLinkDecorationFlowInputFromFactory(createEditorPluginInputFactoryInput(input)));
}

export function clearBibleReferenceLinks(input: EditorPluginFlowInput): void {
    clearEditorReferenceLinksFlow(createEditorReferenceLinkDecorationFlowInputFromFactory(createEditorPluginInputFactoryInput(input)));
}

export function createBiblePreviewAnalyzerFlowInput(input: EditorPluginFlowInput): BiblePreviewAnalyzerFlowInput {
    return {
        bibleIndex: input.bibleIndex,
        bookMapping: input.bookMapping,
        activeV2Data: input.activeV2Data,
        translationControllerState: input.translationControllerState,
        hasImportedTranslations: input.hasImportedTranslations,
        getActiveTranslationId: input.getActiveTranslationId,
        isPreviewComparisonEnabled: input.isPreviewComparisonEnabled,
        parseMatches: input.parseMatches,
        getMissingVerseText: input.getMissingVerseText,
    };
}

export function createBiblePreviewAnalyzerFlowInputWithComparison(input: EditorPluginFlowInput, isPreviewComparisonEnabled: () => boolean): BiblePreviewAnalyzerFlowInput {
    return {
        ...createBiblePreviewAnalyzerFlowInput(input),
        isPreviewComparisonEnabled,
    };
}

export async function analyzeParagraph(input: EditorPluginFlowInput, text: string): Promise<BiblePreviewContent | null> {
    return analyzeBiblePreviewParagraphFlow(createBiblePreviewAnalyzerFlowInput(input), text);
}

export async function analyzeReferenceText(input: EditorPluginFlowInput, text: string): Promise<BiblePreviewContent | null> {
    return analyzeParagraph(input, text);
}

export async function toggleBiblePreviewComparison(
    input: EditorPluginFlowInput,
    content: BiblePreviewContent,
    isPreviewComparisonEnabled: () => boolean,
): Promise<void> {
    await toggleBiblePreviewComparisonFlow({
        ...createBiblePreviewAnalyzerFlowInputWithComparison(input, isPreviewComparisonEnabled),
        setPreviewComparisonEnabled: input.setPreviewComparisonEnabled,
        showBiblePreviewContent: (nextContent) => input.showBiblePreviewContent(nextContent, { reveal: true }),
    }, content);
}

export async function rebuildBiblePreviewContent(
    input: EditorPluginFlowInput,
    content: BiblePreviewContent,
    isPreviewComparisonEnabled: () => boolean,
): Promise<BiblePreviewContent | null> {
    return rebuildBiblePreviewContentFlow(createBiblePreviewAnalyzerFlowInputWithComparison(input, isPreviewComparisonEnabled), content);
}
