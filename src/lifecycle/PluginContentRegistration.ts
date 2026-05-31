import type { MarkdownPostProcessorContext, Plugin } from "obsidian";

type RegisterMarkdownPostProcessor = Plugin["registerMarkdownPostProcessor"];
type RegisterEditorExtension = Plugin["registerEditorExtension"];
type EditorExtension = Parameters<RegisterEditorExtension>[0];

export type ContentProcessingRegistrationInput = {
    registerMarkdownPostProcessor: RegisterMarkdownPostProcessor;
    registerEditorExtension: RegisterEditorExtension;
    createCursorExtension(): EditorExtension;
    processReadingModeBibleReferences(element: HTMLElement, context: MarkdownPostProcessorContext): void;
    registerReferenceUsageIndexEvents(): void;
};

export function registerContentProcessingExtensions(input: ContentProcessingRegistrationInput): void {
    input.registerMarkdownPostProcessor((element, context) => input.processReadingModeBibleReferences(element, context));
    input.registerEditorExtension(input.createCursorExtension());
    input.registerReferenceUsageIndexEvents();
}
