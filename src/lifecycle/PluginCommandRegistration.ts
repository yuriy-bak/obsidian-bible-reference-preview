import type { Plugin } from "obsidian";
import type { I18nKey } from "../i18n/I18n";

type PluginCommand = Parameters<Plugin["addCommand"]>[0];
type PluginCommandTranslate = (key: I18nKey) => string;
type BiblePreviewScrollCommand = "page-down" | "page-up" | "top" | "bottom";

export type PluginCommandRegistrationInput = {
    addCommand(command: PluginCommand): void;
    translate: PluginCommandTranslate;
    openEpubFilePicker(): void;
    reloadBibleIndex(): Promise<void>;
    openBibleIndexFolder(): Promise<void>;
    showBibleIndexStats(): Promise<void>;
    buildReferenceUsageIndex(): Promise<void>;
    rebuildReferenceUsageIndex(): Promise<void>;
    clearReferenceUsageIndex(): Promise<void>;
    showReferenceUsageIndexStats(): Promise<void>;
    findReferenceUsagesUnderCursor(): Promise<void>;
    openReferenceUsagesPanelUnderCursor(): Promise<void>;
    scrollBiblePreview(command: BiblePreviewScrollCommand): Promise<void>;
    togglePluginActive(): Promise<void>;
    openBibleReferenceUnderCursorFromActiveEditor(showNotice: boolean): boolean;
};

export type PluginActiveRibbonRegistrationInput = {
    addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement;
    title: string;
    togglePluginActive(): Promise<void>;
};

export function registerPluginCommands(input: PluginCommandRegistrationInput): void {
    input.addCommand({ id: "import-epub-bible", name: input.translate("command.importEpubBible"), callback: () => input.openEpubFilePicker() });
    input.addCommand({ id: "reload-bible-index", name: input.translate("command.reloadBibleIndex"), callback: () => void input.reloadBibleIndex() });
    input.addCommand({ id: "open-bible-index-folder", name: input.translate("command.openBibleIndexFolder"), callback: () => void input.openBibleIndexFolder() });
    input.addCommand({ id: "show-bible-index-stats", name: input.translate("command.showBibleIndexStats"), callback: () => void input.showBibleIndexStats() });
    input.addCommand({ id: "build-reference-usage-index", name: input.translate("command.buildReferenceUsageIndex"), callback: () => void input.buildReferenceUsageIndex() });
    input.addCommand({ id: "rebuild-reference-usage-index", name: input.translate("command.rebuildReferenceUsageIndex"), callback: () => void input.rebuildReferenceUsageIndex() });
    input.addCommand({ id: "clear-reference-usage-index", name: input.translate("command.clearReferenceUsageIndex"), callback: () => void input.clearReferenceUsageIndex() });
    input.addCommand({ id: "show-reference-usage-index-stats", name: input.translate("command.showReferenceUsageIndexStats"), callback: () => void input.showReferenceUsageIndexStats() });
    input.addCommand({ id: "find-reference-usages-under-cursor", name: input.translate("command.findReferenceUsagesUnderCursor"), callback: () => void input.findReferenceUsagesUnderCursor() });
    input.addCommand({ id: "open-reference-usages-panel-under-cursor", name: input.translate("command.openReferenceUsagesPanelUnderCursor"), callback: () => void input.openReferenceUsagesPanelUnderCursor() });
    input.addCommand({
        id: "scroll-bible-preview-panel-page-down",
        name: input.translate("command.scrollBiblePreviewPanelPageDown"),
        hotkeys: [{ modifiers: ["Alt"], key: "PageDown" }],
        callback: () => void input.scrollBiblePreview("page-down"),
    });
    input.addCommand({
        id: "scroll-bible-preview-panel-page-up",
        name: input.translate("command.scrollBiblePreviewPanelPageUp"),
        hotkeys: [{ modifiers: ["Alt"], key: "PageUp" }],
        callback: () => void input.scrollBiblePreview("page-up"),
    });
    input.addCommand({
        id: "scroll-bible-preview-panel-top",
        name: input.translate("command.scrollBiblePreviewPanelTop"),
        hotkeys: [{ modifiers: ["Alt"], key: "Home" }],
        callback: () => void input.scrollBiblePreview("top"),
    });
    input.addCommand({
        id: "scroll-bible-preview-panel-bottom",
        name: input.translate("command.scrollBiblePreviewPanelBottom"),
        hotkeys: [{ modifiers: ["Alt"], key: "End" }],
        callback: () => void input.scrollBiblePreview("bottom"),
    });
    input.addCommand({
        id: "toggle-bible-preview-active",
        name: input.translate("command.togglePluginActive"),
        callback: () => void input.togglePluginActive(),
    });
    input.addCommand({
        id: "open-bible-reference-under-cursor",
        name: input.translate("command.openBibleReferenceUnderCursor"),
        callback: () => input.openBibleReferenceUnderCursorFromActiveEditor(true),
    });
}

export function registerPluginActiveRibbonIcon(input: PluginActiveRibbonRegistrationInput): HTMLElement {
    return input.addRibbonIcon(
        "book-open",
        input.title,
        () => void input.togglePluginActive(),
    );
}
