import { Platform, type Plugin } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { EditorService } from "../editor/EditorService";
import type { BibleLibraryService } from "../import/BibleLibraryService";
import type { BibleReaderService } from "../reader/BibleReaderService";
import type { ReferenceUsageService } from "../reference-usage/ReferenceUsageService";
import type { SettingsService } from "../settings/SettingsService";
import type { BiblePreviewService } from "../ui/BiblePreviewService";
import type { BiblePreviewScrollCommand } from "../ui/BiblePreviewHeader";

export type PluginCommandServices = {
    context: PluginContext;
    settings: SettingsService;
    library: BibleLibraryService;
    preview: BiblePreviewService;
    reader: BibleReaderService;
    referenceUsage: ReferenceUsageService;
    editor: EditorService;
};

export function registerPluginCommands(plugin: Plugin, services: PluginCommandServices): void {
    const { context, settings, library, preview, reader, referenceUsage, editor } = services;
    const t = (key: Parameters<PluginContext["t"]>[0]) => context.t(key);
    // Listed only while there is something to scroll: the reader first, then the preview.
    const scrollCommand = (command: BiblePreviewScrollCommand, checking: boolean): boolean => {
        if (!reader.canScroll() && !preview.canScroll()) return false;
        if (!checking) void (reader.scrollActive(command) || preview.scroll(command));
        return true;
    };
    plugin.addCommand({ id: "import-epub-bible", name: t("command.importBible"), callback: () => library.openBibleFilePicker() });
    plugin.addCommand({ id: "reload-bible-index", name: t("command.reloadBibleIndex"), callback: () => void library.reloadBibleIndex() });
    plugin.addCommand({ id: "open-bible-index-folder", name: t("command.openBibleIndexFolder"), callback: () => void library.openBibleIndexFolder() });
    plugin.addCommand({ id: "show-bible-index-stats", name: t("command.showBibleIndexStats"), callback: () => void library.showBibleIndexStats() });
    plugin.addCommand({ id: "build-reference-usage-index", name: t("command.buildReferenceUsageIndex"), callback: () => void referenceUsage.buildReferenceUsageIndex() });
    plugin.addCommand({ id: "rebuild-reference-usage-index", name: t("command.rebuildReferenceUsageIndex"), callback: () => void referenceUsage.rebuildReferenceUsageIndex() });
    plugin.addCommand({ id: "clear-reference-usage-index", name: t("command.clearReferenceUsageIndex"), callback: () => void referenceUsage.clearReferenceUsageIndex() });
    plugin.addCommand({ id: "show-reference-usage-index-stats", name: t("command.showReferenceUsageIndexStats"), callback: () => void referenceUsage.showReferenceUsageIndexStats() });
    plugin.addCommand({ id: "find-reference-usages-under-cursor", name: t("command.findReferenceUsagesUnderCursor"), editorCallback: () => void referenceUsage.findUsagesUnderCursor() });
    plugin.addCommand({ id: "open-reference-usages-panel-under-cursor", name: t("command.openReferenceUsagesPanelUnderCursor"), editorCallback: () => void referenceUsage.openUsagesPanelUnderCursor() });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-page-down",
        name: t("command.scrollBiblePreviewPanelPageDown"),
        checkCallback: (checking) => scrollCommand("page-down", checking),
    });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-page-up",
        name: t("command.scrollBiblePreviewPanelPageUp"),
        checkCallback: (checking) => scrollCommand("page-up", checking),
    });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-top",
        name: t("command.scrollBiblePreviewPanelTop"),
        checkCallback: (checking) => scrollCommand("top", checking),
    });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-bottom",
        name: t("command.scrollBiblePreviewPanelBottom"),
        checkCallback: (checking) => scrollCommand("bottom", checking),
    });
    plugin.addCommand({
        id: "toggle-bible-preview-active",
        name: t("command.togglePluginActive"),
        callback: () => void settings.togglePluginActive(),
    });
    plugin.addCommand({ id: "open-bible-reader", name: t("command.openBibleReader"), callback: () => void reader.openReader() });
    plugin.addCommand({ id: "open-bible-reader-new-tab", name: t("command.openBibleReaderNewTab"), callback: () => void reader.openReader({ newTab: true }) });
    plugin.addCommand({ id: "go-to-bible-chapter", name: t("command.goToBibleChapter"), callback: () => void reader.openNavigator() });
    // On a phone only: elsewhere Obsidian splits tabs itself.
    plugin.addCommand({
        id: "toggle-bible-reader-below",
        name: t("command.toggleBibleReaderBelow"),
        checkCallback: (checking) => {
            if (!Platform.isPhone) return false;
            if (!checking) void reader.toggleSplit();
            return true;
        },
    });
    plugin.addCommand({
        id: "open-bible-reference-under-cursor",
        name: t("command.openBibleReferenceUnderCursor"),
        editorCallback: () => editor.openReferenceUnderCursor(true),
    });
}
