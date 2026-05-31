import type { Extension } from "@codemirror/state";
import { ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { BiblePreviewDisplayMode, BiblePreviewTriggerMode } from "../settings/PluginSettings";
import type { BiblePreviewController } from "./BiblePreviewController";
import { createBibleReferenceLinkEditorExtensions, type BibleReferenceLinkDecorationCacheEntry } from "./BibleReferenceLinkDecorations";
import type { EditorClickedReference } from "./EditorClickedReference";
import { handleEditorReferenceClick } from "./EditorClickHandling";
import { openBibleReferenceUnderCursor as openEditorBibleReferenceUnderCursor } from "./EditorReferenceOpening";
import { openBibleReferenceMatchPreview as openEditorBibleReferenceMatchPreview } from "./EditorReferencePreviewOpening";
import { scheduleEditorReferenceLinkUpdate } from "./EditorReferenceLinkUpdateScheduling";
import { clearEditorReferenceLinkUpdateTimeout } from "./EditorReferenceLinkUpdateTimeout";
import { hideEditorBiblePreview } from "./EditorPreviewState";
import { handleEditorPreviewUpdate } from "./EditorPreviewUpdateHandling";
import { registerEditorPreviewController, unregisterEditorPreviewController } from "./EditorPreviewControllerRegistration";

export type EditorCursorExtensionInput = {
    getActiveTranslationId(): string | null;
    editorViews: Set<EditorView>;
    previewControllers: Map<EditorView, BiblePreviewController>;
    bibleReferenceLinkDecorationCache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    getBiblePreviewTriggerMode(): BiblePreviewTriggerMode;
    getBiblePreviewDisplayMode(): BiblePreviewDisplayMode;
    hasImportedTranslations(): boolean;
    hasBiblePreviewPane(): boolean;
    findBibleReferenceMatchAtPosition(view: EditorView, position: number): EditorClickedReference | null;
    getCurrentParagraph(update: ViewUpdate): string;
    analyzeParagraph(paragraph: string): Promise<BiblePreviewContent | null>;
    analyzeReferenceText(text: string): Promise<BiblePreviewContent | null>;
    showBiblePreviewContent(content: BiblePreviewContent): void;
    refreshFloatingPreviewLabels(): void;
    hideFloatingBiblePreview(): void;
    createBibleReferenceLinkDecorations(view: EditorView): DecorationSet;
    translate(key: "notice.pluginInactive" | "notice.noImportedTranslations" | "notice.referenceUnderCursorNotFound"): string;
};

export function createEditorCursorExtension(input: EditorCursorExtensionInput): Extension[] {
    const cursorPlugin = ViewPlugin.fromClass(class implements BiblePreviewController {
        lastParagraph = "";
        requestId = 0;
        referenceLinkUpdateTimeout: number | null = null;
        lastActiveTranslationId = input.getActiveTranslationId();
        lastPluginRuntimeEnabled = false;
        private clickedReference: EditorClickedReference | null = null;
        private lastPreviewTriggerMode = input.getBiblePreviewTriggerMode();
        private readonly editorClickHandler = (event: MouseEvent) => this.handleEditorClick(event);

        constructor(private readonly view: EditorView) {
            registerEditorPreviewController(view, this, input.editorViews, input.previewControllers);
            this.lastPluginRuntimeEnabled = input.shouldRunBiblePreviewForEditor(view);
            this.view.dom.addEventListener("click", this.editorClickHandler);
            this.scheduleReferenceLinkUpdate();
        }

        update(update: ViewUpdate) {
            const pluginRuntimeEnabled = input.shouldRunBiblePreviewForEditor(this.view);
            const previewTriggerMode = input.getBiblePreviewTriggerMode();
            handleEditorPreviewUpdate({
                update,
                view: this.view,
                pluginRuntimeEnabled,
                lastPluginRuntimeEnabled: this.lastPluginRuntimeEnabled,
                referenceLinkUpdateTimeout: this.referenceLinkUpdateTimeout,
                activeTranslationId: input.getActiveTranslationId(),
                lastActiveTranslationId: this.lastActiveTranslationId,
                previewTriggerMode,
                lastPreviewTriggerMode: this.lastPreviewTriggerMode,
                clickedReference: this.clickedReference,
                getLastParagraph: () => this.lastParagraph,
                setLastPluginRuntimeEnabled: (enabled) => { this.lastPluginRuntimeEnabled = enabled; },
                setLastActiveTranslationId: (activeTranslationId) => { this.lastActiveTranslationId = activeTranslationId; },
                setLastPreviewTriggerMode: (nextPreviewTriggerMode) => { this.lastPreviewTriggerMode = nextPreviewTriggerMode; },
                setLastParagraph: (paragraph) => { this.lastParagraph = paragraph; },
                setClickedReference: (reference) => { this.clickedReference = reference; },
                incrementRequestId: () => ++this.requestId,
                getRequestId: () => this.requestId,
                setReferenceLinkUpdateTimeout: (timeout) => { this.referenceLinkUpdateTimeout = timeout; },
                hideBiblePreview: (resetParagraphCache) => this.hideBiblePreview(resetParagraphCache),
                scheduleReferenceLinkUpdate: () => this.scheduleReferenceLinkUpdate(),
                refreshFloatingPreviewLabels: input.refreshFloatingPreviewLabels,
                hasImportedTranslations: input.hasImportedTranslations,
                getCurrentParagraph: input.getCurrentParagraph,
                analyzeParagraph: input.analyzeParagraph,
                showBiblePreviewContent: input.showBiblePreviewContent,
                findReferenceMatchAtPosition: (position) => input.findBibleReferenceMatchAtPosition(this.view, position),
            });
        }

        destroy() {
            clearEditorReferenceLinkUpdateTimeout(
                this.referenceLinkUpdateTimeout,
                (timeout) => { this.referenceLinkUpdateTimeout = timeout; },
            );
            this.view.dom.removeEventListener("click", this.editorClickHandler);
            unregisterEditorPreviewController(this.view, input.editorViews, input.previewControllers, input.bibleReferenceLinkDecorationCache);
        }

        public refreshLocalizedLabels(): void {
            input.refreshFloatingPreviewLabels();
        }

        public openBibleReferenceUnderCursor(showNotice = false): boolean {
            return openEditorBibleReferenceUnderCursor({
                view: this.view,
                showNotice,
                shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
                hasImportedTranslations: input.hasImportedTranslations,
                findBibleReferenceMatchAtPosition: input.findBibleReferenceMatchAtPosition,
                openBibleReferenceMatch: (match) => this.openBibleReferenceMatch(match),
                translate: input.translate,
            });
        }

        private handleEditorClick(event: MouseEvent): void {
            handleEditorReferenceClick({
                event,
                view: this.view,
                clickedReference: this.clickedReference,
                shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
                getBiblePreviewTriggerMode: input.getBiblePreviewTriggerMode,
                getBiblePreviewDisplayMode: input.getBiblePreviewDisplayMode,
                hasImportedTranslations: input.hasImportedTranslations,
                hasBiblePreviewPane: input.hasBiblePreviewPane,
                findBibleReferenceMatchAtPosition: input.findBibleReferenceMatchAtPosition,
                openBibleReferenceMatch: (match) => this.openBibleReferenceMatch(match),
            });
        }

        private openBibleReferenceMatch(match: EditorClickedReference): void {
            openEditorBibleReferenceMatchPreview({
                match,
                setClickedReference: (reference) => { this.clickedReference = reference; },
                resetLastParagraph: () => { this.lastParagraph = ""; },
                incrementRequestId: () => ++this.requestId,
                getRequestId: () => this.requestId,
                getClickedReferenceText: () => this.clickedReference?.text ?? null,
                analyzeReferenceText: input.analyzeReferenceText,
                hideBiblePreview: (resetParagraphCache) => this.hideBiblePreview(resetParagraphCache),
                showBiblePreviewContent: input.showBiblePreviewContent,
            });
        }

        private hideBiblePreview(resetParagraphCache = false): void {
            hideEditorBiblePreview({
                resetParagraphCache,
                hideFloatingPreview: input.hideFloatingBiblePreview,
                setLastParagraph: (paragraph) => { this.lastParagraph = paragraph; },
                clearClickedReference: () => { this.clickedReference = null; },
                incrementRequestId: () => { this.requestId += 1; },
            });
        }

        private scheduleReferenceLinkUpdate(): void {
            scheduleEditorReferenceLinkUpdate({
                view: this.view,
                currentTimeout: this.referenceLinkUpdateTimeout,
                shouldRunBiblePreviewForEditor: input.shouldRunBiblePreviewForEditor,
                createBibleReferenceLinkDecorations: input.createBibleReferenceLinkDecorations,
                setReferenceLinkUpdateTimeout: (timeout) => { this.referenceLinkUpdateTimeout = timeout; },
            });
        }
    });

    return createBibleReferenceLinkEditorExtensions(cursorPlugin);
}
