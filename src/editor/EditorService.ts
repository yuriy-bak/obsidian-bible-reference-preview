import type { Extension } from "@codemirror/state";
import { ViewPlugin, type DecorationSet, type EditorView } from "@codemirror/view";
import { Notice } from "obsidian";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import type { BibleReference } from "../domain/BibleReference";
import type { SettingsService } from "../settings/SettingsService";
import { BIBLE_PREVIEW_VIEW_TYPE } from "../ui/BiblePreviewPaneView";
import type { BiblePreviewService } from "../ui/BiblePreviewService";
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
    ) {}

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
            linkColor: this.settings.getBibleReferenceLinkColor(),
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

        for (const [view, plugin] of this.viewPlugins) {
            if (isFocusedEditorView(view)) {
                return plugin.openReferenceUnderCursor(showNotice);
            }
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

        const focusedView = [...this.viewPlugins.keys()].find(isFocusedEditorView) ?? null;
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
