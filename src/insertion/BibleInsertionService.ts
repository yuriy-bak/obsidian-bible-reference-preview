import { type Editor, type EditorPosition, MarkdownView, Notice, type WorkspaceLeaf } from "obsidian";
import type { NavigatorBook } from "../application/BibleNavigatorModel";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import { formatBibleTextMarkdown } from "./BibleTextMarkdown";
import { findReferenceAtCursor, insertBlockAfterParagraph, insertBlockAtCursor } from "./EditorInsertion";
import { getReferenceSuggestions, type ReferenceSuggestion } from "./ReferenceSuggestions";
import { BibleReferenceSuggest } from "../editor/BibleReferenceSuggest";
import { ReferenceInputModal } from "../ui/ReferenceInputModal";

/** Bible text in notes: the insert command, "--" suggestions and "Insert into note" in the preview. */
export class BibleInsertionService {
    /** The note to insert into when the preview's side panel has the focus. */
    private lastMarkdownView: MarkdownView | null = null;

    constructor(
        private readonly context: PluginContext,
        private readonly contentBuilder: BiblePreviewContentBuilder,
    ) {}

    handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        if (leaf?.view instanceof MarkdownView) this.lastMarkdownView = leaf.view;
    }

    createSuggest(): BibleReferenceSuggest {
        return new BibleReferenceSuggest(this.context.app, {
            getTrigger: () => this.context.settings.referenceSuggestTrigger,
            isActive: () => this.context.settings.isPluginActive && this.context.hasImportedTranslations(),
            getSuggestions: (query) => this.getSuggestions(query, true),
            renderSuggestion: (suggestion, el) => this.renderSuggestion(suggestion, el),
            insert: (editor, suggestion, range) => void this.insertSuggestion(editor, suggestion, range),
        });
    }

    /** The command: the text of the reference under the cursor after its paragraph, or of a typed reference at the cursor. */
    async insertAtCursor(editor: Editor): Promise<void> {
        if (!this.context.hasImportedTranslations()) {
            this.context.showNoImportedTranslationsNotice();
            return;
        }
        const reference = findReferenceAtCursor(editor, (text) => this.context.parseMatches(text));
        if (reference !== null) {
            const markdown = await this.formatReference(reference.text);
            if (markdown.length > 0) insertBlockAfterParagraph(editor, reference.line, markdown);
            return;
        }
        const t = this.context.t.bind(this.context);
        new ReferenceInputModal(this.context.app, {
            placeholder: t("insert.modal.placeholder"),
            emptyText: t("insert.modal.empty"),
            getSuggestions: (query) => this.getSuggestions(query, false),
            renderSuggestion: (suggestion, el) => this.renderSuggestion(suggestion, el),
            onSubmit: (text) => void this.insertReferenceAtCursor(editor, text),
        }).open();
    }

    async insertReferenceAtCursor(editor: Editor, referenceText: string): Promise<void> {
        const markdown = await this.formatReference(referenceText);
        if (markdown.length === 0) {
            new Notice(this.context.t("insert.notFound", { reference: referenceText }), 3000);
            return;
        }
        insertBlockAtCursor(editor, markdown);
    }

    /** "Insert into note" in the preview: the shown passage at the cursor of the note last edited. */
    insertContentIntoNote(content: BiblePreviewContent): void {
        const view = this.findTargetNote();
        if (view === null) {
            new Notice(this.context.t("insert.noNote"), 3000);
            return;
        }
        const markdown = this.formatContent(content);
        if (markdown.length === 0) return;
        insertBlockAtCursor(view.editor, markdown);
        new Notice(this.context.t("insert.inserted", { note: view.file?.basename ?? "" }), 2500);
    }

    formatContent(content: BiblePreviewContent): string {
        const settings = this.context.settings;
        const codes = this.context.getTranslationCodes();
        return formatBibleTextMarkdown(content, {
            format: settings.insertFormat,
            verseNumbers: settings.insertVerseNumbers,
            footnotes: settings.insertFootnotes,
            activeTranslationId: this.context.activeTranslationId,
            getTranslationCode: (translationId) => codes.get(translationId),
        });
    }

    getSuggestions(query: string, withText: boolean): ReferenceSuggestion[] {
        return getReferenceSuggestions(query, this.getBooks(), (text) => this.context.parseMatches(text), { withText });
    }

    private async formatReference(referenceText: string): Promise<string> {
        const content = await this.contentBuilder.analyze(referenceText, { comparison: false });
        return content === null ? "" : this.formatContent(content);
    }

    private async insertSuggestion(
        editor: Editor,
        suggestion: Exclude<ReferenceSuggestion, { kind: "book" }>,
        range: { start: EditorPosition; end: EditorPosition },
    ): Promise<void> {
        const markdown = suggestion.kind === "reference-with-text" ? await this.formatReference(suggestion.text) : "";
        const line = editor.getLine(range.start.line);
        const restOfLine = line.slice(0, range.start.ch) + line.slice(range.end.ch);
        if (markdown.length === 0 || restOfLine.trim().length > 0) {
            // In a sentence the reference stays where it was typed; its text goes after the paragraph.
            editor.replaceRange(suggestion.text, range.start, range.end);
            editor.setCursor({ line: range.start.line, ch: range.start.ch + suggestion.text.length });
            if (markdown.length > 0) insertBlockAfterParagraph(editor, range.start.line, markdown);
            return;
        }
        // On a line of its own the block takes the line: a callout already names the reference.
        editor.replaceRange("", range.start, range.end);
        editor.setCursor(range.start);
        insertBlockAtCursor(editor, markdown);
    }

    private renderSuggestion(suggestion: ReferenceSuggestion, el: HTMLElement): void {
        const t = this.context.t.bind(this.context);
        el.addClass("bible-reference-suggestion");
        if (suggestion.kind === "book") {
            el.createSpan({ text: suggestion.book.name });
            if (suggestion.book.shortName !== suggestion.book.name) {
                el.createSpan({ cls: "bible-reference-suggestion-note", text: suggestion.book.shortName });
            }
            return;
        }
        el.createSpan({ text: suggestion.text });
        el.createSpan({
            cls: "bible-reference-suggestion-note",
            text: suggestion.kind === "reference" ? t("insert.suggest.reference") : t("insert.suggest.referenceWithText"),
        });
    }

    /** Books of every translation, the main one first, for the suggestions. */
    private getBooks(): NavigatorBook[] {
        const order = this.context.settings.translationOrder.filter((translationId) => this.contentBuilder.hasTranslation(translationId));
        return order.flatMap((translationId) => this.contentBuilder.getNavigatorBooks(translationId));
    }

    private findTargetNote(): MarkdownView | null {
        const active = this.context.app.workspace.getActiveViewOfType(MarkdownView);
        if (active !== null) return active;
        const last = this.lastMarkdownView;
        return last !== null && last.containerEl.isConnected ? last : null;
    }
}
