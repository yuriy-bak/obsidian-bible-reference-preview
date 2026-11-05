import type { Extension } from "@codemirror/state";
import { ViewPlugin, type DecorationSet, type EditorView } from "@codemirror/view";
import { MarkdownView, Notice } from "obsidian";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import type { BibleReference } from "../domain/BibleReference";
import type { SettingsService } from "../settings/SettingsService";
import { BIBLE_PREVIEW_VIEW_TYPE } from "../ui/BiblePreviewPaneView";
import type { BiblePreviewService } from "../preview/BiblePreviewService";
import { getFirstWorkspaceLeafOfType } from "../workspace/BiblePreviewWorkspace";
import {
    clearBibleReferenceLinkDecorationsForViews,
    createBibleReferenceLinkDecorations,
    createBibleReferenceLinkEditorExtensions,
    refreshBibleReferenceLinkDecorationsForViews,
    type BibleReferenceLinkDecorationCacheEntry,
} from "./BibleReferenceLinkDecorations";
import type { EditorClickedReference } from "./EditorClickedReference";
import { EditorReferenceViewPlugin } from "./EditorReferenceViewPlugin";
import { findBibleReferenceMatchAtPosition } from "./EditorTextAnalysis";

export type EditorReferenceUnderCursor = {
    text: string;
    references: BibleReference[];
};

/** Bible reference links and the preview in Live Preview / source mode editors. */
export class EditorService {
    private readonly viewPlugins = new Map<EditorView, EditorReferenceViewPlugin>();
    private readonly decorationCache = new WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>();

    constructor(
        readonly context: PluginContext,
        readonly settings: SettingsService,
        private readonly contentBuilder: BiblePreviewContentBuilder,
        private readonly preview: BiblePreviewService,
    ) {
        context.onSettingsChanged((keys) => {
            if (keys.has("isPluginActive")) {
                if (settings.isPluginActive()) this.refreshLinks();
                else this.clearLinks();
            }
            if (keys.has("bibleReferenceLinkColor")) this.refreshLinks();
            if (keys.has("interfaceLanguage")) this.refreshLocalizedLabels();
            if (keys.has("previewTriggerMode")) this.dispatchNoopUpdate();
        });
    }

    createExtension(): Extension[] {
        return createBibleReferenceLinkEditorExtensions(ViewPlugin.define((view) => new EditorReferenceViewPlugin(view, this)));
    }

    register(view: EditorView, plugin: EditorReferenceViewPlugin): void {
        this.viewPlugins.set(view, plugin);
    }

    unregister(view: EditorView): void {
        this.viewPlugins.delete(view);
        this.decorationCache.delete(view);
    }

    // Central runtime gate. Future folder/file/frontmatter filters should be added here
    // so hot paths can keep a single early-exit check.
    isActiveFor(_view: EditorView): boolean {
        return this.settings.isPluginActive();
    }

    analyze(text: string): Promise<BiblePreviewContent | null> {
        return this.contentBuilder.analyze(text);
    }

    findMatchAt(view: EditorView, position: number): EditorClickedReference | null {
        return findBibleReferenceMatchAtPosition(view, position, (text) => this.context.parseMatches(text));
    }

    hasPreviewPane(): boolean {
        return getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE) !== null;
    }

    /** Preview from cursor movement. */
    showAutomaticPreview(content: BiblePreviewContent): void {
        this.showClickedPreview(content);
    }

    showClickedPreview(content: BiblePreviewContent): void {
        this.preview.show(content, { type: "default" }, { reveal: this.settings.shouldAutoOpenPreviewOnVerseChange() });
    }

    hideAutomaticPreview(): void {
        this.preview.hideFloating();
    }

    refreshFloatingPreviewLabels(): void {
        this.preview.refreshFloatingLabels();
    }

    createLinkDecorations(view: EditorView): DecorationSet {
        return createBibleReferenceLinkDecorations({
            view,
            activeTranslationId: this.context.activeTranslationId,
            cache: this.decorationCache,
            shouldRunBiblePreviewForEditor: (editorView) => this.isActiveFor(editorView),
            hasImportedTranslations: () => this.context.hasImportedTranslations(),
            parseMatches: (text) => this.context.parseMatches(text),
        });
    }

    refreshLinks(): void {
        refreshBibleReferenceLinkDecorationsForViews(this.viewPlugins.keys(), this.decorationCache, (view) => this.createLinkDecorations(view));
    }

    clearLinks(): void {
        clearBibleReferenceLinkDecorationsForViews(this.viewPlugins.keys(), this.decorationCache);
    }

    dispatchNoopUpdate(): void {
        for (const view of this.viewPlugins.keys()) {
            view.dispatch({});
        }
    }

    refreshLocalizedLabels(): void {
        for (const plugin of this.viewPlugins.values()) {
            plugin.refreshLocalizedLabels();
        }
    }

    handleLinkOpenShortcutKeydown(event: KeyboardEvent): void {
        if (!this.settings.isPluginActive()) {
            return;
        }
        if (!this.settings.shouldInterceptLinkOpenShortcut() || !this.isConfiguredLinkOpenShortcut(event)) {
            return;
        }

        if (!this.openReferenceUnderCursor(false)) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
    }

    openReferenceUnderCursor(showNotice: boolean): boolean {
        if (!this.settings.isPluginActive()) {
            if (showNotice) {
                new Notice(this.context.t("notice.pluginInactive"), 2500);
            }
            return false;
        }

        const focusedView = this.findCommandEditorView();
        const plugin = focusedView === null ? undefined : this.viewPlugins.get(focusedView);
        if (plugin !== undefined) {
            return plugin.openReferenceUnderCursor(showNotice);
        }

        if (showNotice) {
            new Notice(this.context.t("notice.activeEditorNotFound"), 2500);
        }

        return false;
    }

    getReferenceUnderCursor(showNotice: boolean): EditorReferenceUnderCursor | null {
        if (!this.settings.isPluginActive()) {
            if (showNotice) new Notice(this.context.t("notice.pluginInactive"), 2500);
            return null;
        }

        const focusedView = this.findCommandEditorView();
        if (focusedView === null) {
            if (showNotice) new Notice(this.context.t("notice.activeEditorNotFound"), 2500);
            return null;
        }

        const match = this.findMatchAt(focusedView, focusedView.state.selection.main.head);
        if (match === null) {
            if (showNotice) new Notice(this.context.t("notice.referenceUnderCursorNotFound"), 2500);
            return null;
        }

        const references = this.context.parseMatches(match.text).flatMap((parsedMatch) => parsedMatch.references);
        return references.length === 0 ? null : { text: match.text, references };
    }

    // The focused editor; from the command palette (which takes the focus) the editor of the active note.
    private findCommandEditorView(): EditorView | null {
        const editorViews = [...this.viewPlugins.keys()];
        const focusedView = editorViews.find(isFocusedEditorView);
        if (focusedView !== undefined) return focusedView;
        const activeView = this.context.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView === null) return null;
        return editorViews.find((view) => activeView.containerEl.contains(view.dom)) ?? null;
    }

    private isConfiguredLinkOpenShortcut(event: KeyboardEvent): boolean {
        if (event.key !== "Enter" || event.shiftKey || event.metaKey) {
            return false;
        }

        switch (this.settings.getBibleLinkOpenShortcut()) {
            case "alt-enter":
                return event.altKey && !event.ctrlKey;
            case "ctrl-enter":
                return event.ctrlKey && !event.altKey;
            case "ctrl-alt-enter":
                return event.ctrlKey && event.altKey;
        }
    }
}

function isFocusedEditorView(view: EditorView): boolean {
    return view.hasFocus || view.dom.contains(view.dom.ownerDocument.activeElement);
}
