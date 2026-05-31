import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { EditorClickedReference } from "./EditorClickedReference";
import { updateClickedReferenceAfterDocumentChange } from "./EditorClickedReferenceUpdate";
import { handleMissingImportedTranslations } from "./EditorImportedTranslationsState";
import { openCurrentParagraphPreview } from "./EditorParagraphPreviewOpening";
import { applyEditorPreviewTriggerModeChange } from "./EditorPreviewTriggerModeChange";
import { applyEditorRuntimeEnabledChange } from "./EditorRuntimeEnabledChange";
import { applyEditorTranslationChange } from "./EditorTranslationChange";

export type EditorPreviewUpdateHandlingInput = {
    update: ViewUpdate;
    view: EditorView;
    pluginRuntimeEnabled: boolean;
    lastPluginRuntimeEnabled: boolean;
    referenceLinkUpdateTimeout: number | null;
    activeTranslationId: string | null;
    lastActiveTranslationId: string | null;
    previewTriggerMode: BiblePreviewTriggerMode;
    lastPreviewTriggerMode: BiblePreviewTriggerMode;
    clickedReference: EditorClickedReference | null;
    getLastParagraph(): string;
    setLastPluginRuntimeEnabled(enabled: boolean): void;
    setLastActiveTranslationId(activeTranslationId: string | null): void;
    setLastPreviewTriggerMode(previewTriggerMode: BiblePreviewTriggerMode): void;
    setLastParagraph(paragraph: string): void;
    setClickedReference(reference: EditorClickedReference | null): void;
    incrementRequestId(): number;
    getRequestId(): number;
    setReferenceLinkUpdateTimeout(timeout: number | null): void;
    hideBiblePreview(resetParagraphCache?: boolean): void;
    scheduleReferenceLinkUpdate(): void;
    refreshFloatingPreviewLabels(): void;
    hasImportedTranslations(): boolean;
    getCurrentParagraph(update: ViewUpdate): string;
    analyzeParagraph(paragraph: string): Promise<BiblePreviewContent | null>;
    showBiblePreviewContent(content: BiblePreviewContent): void;
    findReferenceMatchAtPosition(position: number): EditorClickedReference | null;
};

export function handleEditorPreviewUpdate(input: EditorPreviewUpdateHandlingInput): void {
    applyEditorRuntimeEnabledChange({
        view: input.view,
        pluginRuntimeEnabled: input.pluginRuntimeEnabled,
        lastPluginRuntimeEnabled: input.lastPluginRuntimeEnabled,
        referenceLinkUpdateTimeout: input.referenceLinkUpdateTimeout,
        setLastPluginRuntimeEnabled: input.setLastPluginRuntimeEnabled,
        setLastParagraph: input.setLastParagraph,
        clearClickedReference: () => input.setClickedReference(null),
        incrementRequestId: () => { input.incrementRequestId(); },
        setReferenceLinkUpdateTimeout: input.setReferenceLinkUpdateTimeout,
        hideBiblePreview: input.hideBiblePreview,
        scheduleReferenceLinkUpdate: input.scheduleReferenceLinkUpdate,
    });
    if (!input.pluginRuntimeEnabled) {
        return;
    }

    applyEditorTranslationChange({
        activeTranslationId: input.activeTranslationId,
        lastActiveTranslationId: input.lastActiveTranslationId,
        setLastActiveTranslationId: input.setLastActiveTranslationId,
        setLastParagraph: input.setLastParagraph,
        clearClickedReference: () => input.setClickedReference(null),
        incrementRequestId: () => { input.incrementRequestId(); },
        refreshFloatingPreviewLabels: input.refreshFloatingPreviewLabels,
        scheduleReferenceLinkUpdate: input.scheduleReferenceLinkUpdate,
    });

    applyEditorPreviewTriggerModeChange({
        previewTriggerMode: input.previewTriggerMode,
        lastPreviewTriggerMode: input.lastPreviewTriggerMode,
        setLastPreviewTriggerMode: input.setLastPreviewTriggerMode,
        clearClickedReference: () => input.setClickedReference(null),
        hideBiblePreview: input.hideBiblePreview,
    });

    if (input.update.docChanged || input.update.viewportChanged) {
        input.scheduleReferenceLinkUpdate();
    }

    if (!input.update.selectionSet && !input.update.docChanged) {
        return;
    }

    if (handleMissingImportedTranslations({
        hasImportedTranslations: input.hasImportedTranslations(),
        setLastParagraph: input.setLastParagraph,
        clearClickedReference: () => input.setClickedReference(null),
        incrementRequestId: () => { input.incrementRequestId(); },
        hideBiblePreview: () => input.hideBiblePreview(),
    })) {
        return;
    }

    if (input.previewTriggerMode === "clicked-reference") {
        if (input.update.docChanged) {
            updateClickedReferenceAfterDocumentChange({
                update: input.update,
                clickedReference: input.clickedReference,
                findReferenceMatchAtPosition: input.findReferenceMatchAtPosition,
                setClickedReference: input.setClickedReference,
                hideBiblePreview: input.hideBiblePreview,
            });
        }
        return;
    }

    openCurrentParagraphPreview({
        paragraph: input.getCurrentParagraph(input.update),
        getLastParagraph: input.getLastParagraph,
        setLastParagraph: input.setLastParagraph,
        incrementRequestId: input.incrementRequestId,
        getRequestId: input.getRequestId,
        analyzeParagraph: input.analyzeParagraph,
        hideBiblePreview: () => input.hideBiblePreview(),
        showBiblePreviewContent: input.showBiblePreviewContent,
    });
}
