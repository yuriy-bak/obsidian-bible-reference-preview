import { type App, SuggestModal } from "obsidian";
import type { ReferenceSuggestion } from "../insertion/ReferenceSuggestions";

export type ReferenceInputModalInput = {
    placeholder: string;
    emptyText: string;
    getSuggestions: (query: string) => ReferenceSuggestion[];
    renderSuggestion: (suggestion: ReferenceSuggestion, el: HTMLElement) => void;
    onSubmit: (referenceText: string) => void;
};

/**
 * Asks for a reference to insert ("Ин 3:16"). A book from the list completes the typed name and keeps the
 * window open for the chapter and verse; a complete reference is inserted.
 */
export class ReferenceInputModal extends SuggestModal<ReferenceSuggestion> {
    constructor(app: App, private readonly input: ReferenceInputModalInput) {
        super(app);
        this.setPlaceholder(input.placeholder);
        this.emptyStateText = input.emptyText;
    }

    getSuggestions(query: string): ReferenceSuggestion[] {
        return this.input.getSuggestions(query);
    }

    renderSuggestion(suggestion: ReferenceSuggestion, el: HTMLElement): void {
        this.input.renderSuggestion(suggestion, el);
    }

    selectSuggestion(suggestion: ReferenceSuggestion, evt: MouseEvent | KeyboardEvent): void {
        if (suggestion.kind === "book") {
            this.inputEl.value = `${suggestion.book.shortName} `;
            this.inputEl.dispatchEvent(new Event("input"));
            this.inputEl.focus();
            return;
        }
        super.selectSuggestion(suggestion, evt);
    }

    onChooseSuggestion(suggestion: ReferenceSuggestion): void {
        if (suggestion.kind !== "book") this.input.onSubmit(suggestion.text);
    }
}
