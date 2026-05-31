import { Notice } from "obsidian";
import type { BibleLinkOpenShortcut } from "../settings/PluginSettings";
import type { EditorRuntimeState } from "./EditorRuntimeState";
import { findFocusedEditorPreviewController } from "./EditorViewFocus";

export type EditorLinkOpenShortcutFlowInput = {
    editorRuntimeState: EditorRuntimeState;
    isPluginActive(): boolean;
    shouldInterceptLinkOpenShortcut(): boolean;
    getBibleLinkOpenShortcut(): BibleLinkOpenShortcut;
    translate(key: "notice.pluginInactive" | "notice.activeEditorNotFound"): string;
};

export function handleLinkOpenShortcutKeydown(input: EditorLinkOpenShortcutFlowInput, event: KeyboardEvent): void {
    if (!input.isPluginActive()) {
        return;
    }
    if (!input.shouldInterceptLinkOpenShortcut() || !isConfiguredBibleLinkOpenShortcut(input, event)) {
        return;
    }

    if (!openBibleReferenceUnderCursorFromActiveEditor(input, false)) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
}

export function isConfiguredBibleLinkOpenShortcut(input: EditorLinkOpenShortcutFlowInput, event: KeyboardEvent): boolean {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey) {
        return false;
    }

    switch (input.getBibleLinkOpenShortcut()) {
        case "alt-enter":
            return event.altKey && !event.ctrlKey;
        case "ctrl-enter":
            return event.ctrlKey && !event.altKey;
        case "ctrl-alt-enter":
            return event.ctrlKey && event.altKey;
    }
}

export function openBibleReferenceUnderCursorFromActiveEditor(input: EditorLinkOpenShortcutFlowInput, showNotice: boolean): boolean {
    if (!input.isPluginActive()) {
        if (showNotice) {
            new Notice(input.translate("notice.pluginInactive"), 2500);
        }
        return false;
    }

    const controller = findFocusedEditorPreviewController(input.editorRuntimeState.previewControllers.entries());
    if (controller !== null) {
        return controller.openBibleReferenceUnderCursor(showNotice);
    }

    if (showNotice) {
        new Notice(input.translate("notice.activeEditorNotFound"), 2500);
    }

    return false;
}
