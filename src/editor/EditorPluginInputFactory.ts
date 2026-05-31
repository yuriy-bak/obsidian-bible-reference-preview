import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { App } from "obsidian";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import { getFirstWorkspaceLeafOfType } from "../workspace/BiblePreviewWorkspace";
import { createEditorReferenceLinkDecorations, type EditorReferenceLinkDecorationFlowInput } from "./EditorReferenceLinkDecorationFlow";
import type { EditorRuntimeState } from "./EditorRuntimeState";
import type { EditorCursorExtensionInput } from "./EditorCursorExtension";
import type { EditorClickedReference } from "./EditorClickedReference";
import type { BiblePreviewDisplayMode, BiblePreviewTriggerMode } from "../settings/PluginSettings";

export type EditorPluginInputFactoryInput = {
    app: App;
    previewViewType: string;
    editorRuntimeState: EditorRuntimeState;
    getActiveTranslationId(): string | null;
    getBibleReferenceLinkColor(): string;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    getBiblePreviewTriggerMode(): BiblePreviewTriggerMode;
    getBiblePreviewDisplayMode(): BiblePreviewDisplayMode;
    hasImportedTranslations(): boolean;
    parseMatches(text: string): Array<{ from: number; to: number }>;
    findBibleReferenceMatchAtPosition(view: EditorView, position: number): EditorClickedReference | null;
    getCurrentParagraph(update: ViewUpdate): string;
    analyzeParagraph(paragraph: string): Promise<BiblePreviewContent | null>;
    analyzeReferenceText(text: string): Promise<BiblePreviewContent | null>;
    showBiblePreviewContent(content: BiblePreviewContent): void;
    refreshFloatingPreviewLabels(): void;
    hideFloatingBiblePreview(): void;
    translate(key: "notice.pluginInactive" | "notice.noImportedTranslations" | "notice.referenceUnderCursorNotFound"): string;
};

export function createEditorReferenceLinkDecorationFlowInput(input: EditorPluginInputFactoryInput): EditorReferenceLinkDecorationFlowInput {
    return {
        editorRuntimeState: input.editorRuntimeState,
        activeTranslationId: input.getActiveTranslationId(),
        linkColor: input.getBibleReferenceLinkColor(),
        shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
        hasImportedTranslations: input.hasImportedTranslations,
        parseMatches: input.parseMatches,
    };
}

export function createEditorCursorExtensionInput(input: EditorPluginInputFactoryInput): EditorCursorExtensionInput {
    return {
        getActiveTranslationId: input.getActiveTranslationId,
        editorViews: input.editorRuntimeState.editorViews,
        previewControllers: input.editorRuntimeState.previewControllers,
        bibleReferenceLinkDecorationCache: input.editorRuntimeState.bibleReferenceLinkDecorationCache,
        shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
        getBiblePreviewTriggerMode: input.getBiblePreviewTriggerMode,
        getBiblePreviewDisplayMode: input.getBiblePreviewDisplayMode,
        hasImportedTranslations: input.hasImportedTranslations,
        hasBiblePreviewPane: () => getFirstWorkspaceLeafOfType(input.app, input.previewViewType) !== null,
        findBibleReferenceMatchAtPosition: input.findBibleReferenceMatchAtPosition,
        getCurrentParagraph: input.getCurrentParagraph,
        analyzeParagraph: input.analyzeParagraph,
        analyzeReferenceText: input.analyzeReferenceText,
        showBiblePreviewContent: input.showBiblePreviewContent,
        refreshFloatingPreviewLabels: input.refreshFloatingPreviewLabels,
        hideFloatingBiblePreview: input.hideFloatingBiblePreview,
        createBibleReferenceLinkDecorations: (view) => createEditorReferenceLinkDecorations(createEditorReferenceLinkDecorationFlowInput(input), view),
        translate: input.translate,
    };
}
