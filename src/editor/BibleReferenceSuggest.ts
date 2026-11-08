import { type App, type Editor, type EditorPosition, EditorSuggest, type EditorSuggestContext, type EditorSuggestTriggerInfo } from "obsidian";
import { findSuggestTrigger } from "../insertion/EditorInsertion";
import type { ReferenceSuggestion } from "../insertion/ReferenceSuggestions";

export type BibleReferenceSuggestInput = {
    getTrigger: () => string;
    isActive: () => boolean;
    getSuggestions: (query: string) => ReferenceSuggestion[];
    renderSuggestion: (suggestion: ReferenceSuggestion, el: HTMLElement) => void;
    /** Replaces the trigger and the typed text with the reference, or with the reference and its text. */
    insert: (editor: Editor, suggestion: Exclude<ReferenceSuggestion, { kind: "book" }>, range: { start: EditorPosition; end: EditorPosition }) => void;
};

/** "--Ин 3:16": the trigger, then a book name and the chapter and verse, with suggestions along the way. */
export class BibleReferenceSuggest extends EditorSuggest<ReferenceSuggestion> {
    constructor(app: App, private readonly input: BibleReferenceSuggestInput) {
        super(app);
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        if (!this.input.isActive()) return null;
        const trigger = this.input.getTrigger();
        const found = findSuggestTrigger(editor.getLine(cursor.line).slice(0, cursor.ch), trigger);
        if (found === null) return null;
        return { start: { line: cursor.line, ch: found.start }, end: cursor, query: found.query };
    }

    getSuggestions(context: EditorSuggestContext): ReferenceSuggestion[] {
        return this.input.getSuggestions(context.query);
    }

    renderSuggestion(suggestion: ReferenceSuggestion, el: HTMLElement): void {
        this.input.renderSuggestion(suggestion, el);
    }

    selectSuggestion(suggestion: ReferenceSuggestion): void {
        const context = this.context;
        if (context === null) return;
        const { editor, start, end } = context;
        if (suggestion.kind === "book") {
            // The trigger stays, so the suggestions go on with the chapter and verse.
            const nameStart = { line: start.line, ch: start.ch + this.input.getTrigger().length };
            editor.replaceRange(`${suggestion.book.shortName} `, nameStart, end);
            editor.setCursor({ line: start.line, ch: nameStart.ch + suggestion.book.shortName.length + 1 });
            return;
        }
        this.close();
        this.input.insert(editor, suggestion, { start, end });
    }
}
