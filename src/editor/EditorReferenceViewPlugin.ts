import type { EditorView, PluginValue, ViewUpdate } from "@codemirror/view";
import { Notice, Platform } from "obsidian";
import type { BiblePreviewTriggerMode } from "../settings/PluginSettings";
import { clearBibleReferenceLinkDecorations, dispatchBibleReferenceLinkDecorations } from "./BibleReferenceLinkDecorations";
import { remapClickedReferenceAfterDocumentChange, type EditorClickedReference } from "./EditorClickedReference";
import type { EditorService } from "./EditorService";
import { getCurrentParagraph, getParagraphReferencesKey } from "./EditorTextAnalysis";

/** One per editor: highlights references and opens the preview on cursor movement or click. */
export class EditorReferenceViewPlugin implements PluginValue {
    private lastParagraphReferencesKey = "";
    private requestId = 0;
    private referenceLinkUpdateTimeout: number | null = null;
    private lastActiveTranslationId: string | null;
    private lastPluginRuntimeEnabled: boolean;
    private lastPreviewTriggerMode: BiblePreviewTriggerMode;
    private clickedReference: EditorClickedReference | null = null;
    private readonly editorClickHandler = (event: MouseEvent) => this.handleEditorClick(event);

    constructor(
        private readonly view: EditorView,
        private readonly service: EditorService,
    ) {
        this.lastActiveTranslationId = service.context.activeTranslationId;
        this.lastPreviewTriggerMode = service.settings.getBiblePreviewTriggerMode();
        service.register(view, this);
        this.lastPluginRuntimeEnabled = service.isActiveFor(view);
        this.view.dom.addEventListener("click", this.editorClickHandler);
        this.scheduleReferenceLinkUpdate();
    }

    update(update: ViewUpdate): void {
        const pluginRuntimeEnabled = this.service.isActiveFor(this.view);
        const activeTranslationId = this.service.context.activeTranslationId;
        const previewTriggerMode = this.service.settings.getBiblePreviewTriggerMode();

        if (this.lastPluginRuntimeEnabled !== pluginRuntimeEnabled) {
            this.lastPluginRuntimeEnabled = pluginRuntimeEnabled;
            this.resetPreviewRequest();
            this.clearReferenceLinkUpdateTimeout();
            if (!pluginRuntimeEnabled) {
                this.hideBiblePreview(true);
                clearBibleReferenceLinkDecorations(this.view);
            } else {
                this.scheduleReferenceLinkUpdate();
            }
        }
        if (!pluginRuntimeEnabled) {
            return;
        }

        if (this.lastActiveTranslationId !== activeTranslationId) {
            this.lastActiveTranslationId = activeTranslationId;
            this.resetPreviewRequest();
            this.service.refreshFloatingPreviewLabels();
            this.scheduleReferenceLinkUpdate();
        }

        if (this.lastPreviewTriggerMode !== previewTriggerMode) {
            this.lastPreviewTriggerMode = previewTriggerMode;
            this.clickedReference = null;
            this.hideBiblePreview(true);
        }

        if (update.docChanged || update.viewportChanged) {
            this.scheduleReferenceLinkUpdate();
        }

        if (!update.selectionSet && !update.docChanged) {
            return;
        }

        if (!this.service.context.hasImportedTranslations()) {
            this.resetPreviewRequest();
            this.hideBiblePreview();
            return;
        }

        if (previewTriggerMode === "clicked-reference") {
            if (update.docChanged) {
                this.remapClickedReference(update);
            }
            return;
        }

        this.openCurrentParagraphPreview(getCurrentParagraph(update));
    }

    destroy(): void {
        this.clearReferenceLinkUpdateTimeout();
        this.view.dom.removeEventListener("click", this.editorClickHandler);
        this.service.unregister(this.view);
    }

    refreshLocalizedLabels(): void {
        this.service.refreshFloatingPreviewLabels();
    }

    openReferenceUnderCursor(showNotice = false): boolean {
        const fail = (key: "notice.pluginInactive" | "notice.noImportedTranslations" | "notice.referenceUnderCursorNotFound") => {
            if (showNotice) {
                new Notice(this.service.context.t(key), 2500);
            }
            return false;
        };
        if (!this.service.isActiveFor(this.view)) {
            return fail("notice.pluginInactive");
        }
        if (!this.service.context.hasImportedTranslations()) {
            return fail("notice.noImportedTranslations");
        }

        const match = this.service.findMatchAt(this.view, this.view.state.selection.main.head);
        if (match === null) {
            return fail("notice.referenceUnderCursorNotFound");
        }

        this.openReferenceMatch(match);
        return true;
    }

    private resetPreviewRequest(): void {
        this.lastParagraphReferencesKey = "";
        this.clickedReference = null;
        this.requestId += 1;
    }

    private remapClickedReference(update: ViewUpdate): void {
        if (this.clickedReference === null) {
            return;
        }

        const nextClickedReference = remapClickedReferenceAfterDocumentChange(
            update,
            this.clickedReference,
            (position) => this.service.findMatchAt(this.view, position),
        );
        if (nextClickedReference === null) {
            this.clickedReference = null;
            this.hideBiblePreview(true);
            return;
        }

        this.clickedReference = nextClickedReference;
    }

    private openCurrentParagraphPreview(paragraph: string): void {
        const referencesKey = paragraph ? getParagraphReferencesKey(this.service.context.parseMatches(paragraph)) : "";
        if (referencesKey === this.lastParagraphReferencesKey) {
            return;
        }

        this.lastParagraphReferencesKey = referencesKey;
        const currentRequestId = ++this.requestId;
        if (!referencesKey) {
            this.hideBiblePreview();
            return;
        }

        void this.service.analyze(paragraph).then((content) => {
            if (currentRequestId !== this.requestId || referencesKey !== this.lastParagraphReferencesKey) {
                return;
            }
            if (content === null || content.plainText.length === 0) {
                this.hideBiblePreview();
                return;
            }
            this.service.showAutomaticPreview(content);
        });
    }

    private handleEditorClick(event: MouseEvent): void {
        if (!this.service.isActiveFor(this.view)) {
            return;
        }
        if (this.service.settings.getBiblePreviewTriggerMode() !== "clicked-reference" || !this.service.context.hasImportedTranslations()) {
            return;
        }

        const position = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null) {
            return;
        }

        const match = this.service.findMatchAt(this.view, position);
        if (match === null) {
            return;
        }

        if (
            Platform.isMobileApp
            && this.service.settings.getBiblePreviewDisplayMode() === "side-panel"
            && this.service.hasPreviewPane()
            && this.clickedReference?.from === match.from
            && this.clickedReference.to === match.to
            && this.clickedReference.text === match.text
        ) {
            return;
        }

        event.preventDefault();
        this.openReferenceMatch(match);
    }

    private openReferenceMatch(match: EditorClickedReference): void {
        this.clickedReference = match;
        this.lastParagraphReferencesKey = "";
        const currentRequestId = ++this.requestId;

        void this.service.analyze(match.text).then((content) => {
            if (currentRequestId !== this.requestId || this.clickedReference?.text !== match.text) {
                return;
            }
            if (content === null || content.plainText.length === 0) {
                this.clickedReference = null;
                this.hideBiblePreview(true);
                return;
            }
            this.service.showClickedPreview(content);
        });
    }

    private hideBiblePreview(resetParagraphCache = false): void {
        this.service.hideAutomaticPreview();
        if (resetParagraphCache) {
            this.resetPreviewRequest();
        }
    }

    private scheduleReferenceLinkUpdate(): void {
        if (!this.service.isActiveFor(this.view)) {
            return;
        }
        if (this.referenceLinkUpdateTimeout !== null) {
            window.clearTimeout(this.referenceLinkUpdateTimeout);
        }

        this.referenceLinkUpdateTimeout = window.setTimeout(() => {
            this.referenceLinkUpdateTimeout = null;
            dispatchBibleReferenceLinkDecorations(this.view, this.service.createLinkDecorations(this.view));
        }, 75);
    }

    private clearReferenceLinkUpdateTimeout(): void {
        if (this.referenceLinkUpdateTimeout !== null) {
            window.clearTimeout(this.referenceLinkUpdateTimeout);
            this.referenceLinkUpdateTimeout = null;
        }
    }
}
