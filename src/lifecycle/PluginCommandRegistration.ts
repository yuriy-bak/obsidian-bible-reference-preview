import type { Plugin } from "obsidian";
import type { PluginContext } from "../core/PluginContext";
import type { EditorService } from "../editor/EditorService";
import type { BibleLibraryService } from "../import/BibleLibraryService";
import type { BibleReaderService } from "../reader/BibleReaderService";
import type { ReferenceUsageService } from "../reference-usage/ReferenceUsageService";
import type { SettingsService } from "../settings/SettingsService";
import type { BiblePreviewService } from "../ui/BiblePreviewService";

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
    plugin.addCommand({ id: "import-epub-bible", name: t("command.importBible"), callback: () => library.openBibleFilePicker() });
    plugin.addCommand({ id: "reload-bible-index", name: t("command.reloadBibleIndex"), callback: () => void library.reloadBibleIndex() });
    plugin.addCommand({ id: "open-bible-index-folder", name: t("command.openBibleIndexFolder"), callback: () => void library.openBibleIndexFolder() });
    plugin.addCommand({ id: "show-bible-index-stats", name: t("command.showBibleIndexStats"), callback: () => void library.showBibleIndexStats() });
    plugin.addCommand({ id: "build-reference-usage-index", name: t("command.buildReferenceUsageIndex"), callback: () => void referenceUsage.buildReferenceUsageIndex() });
    plugin.addCommand({ id: "rebuild-reference-usage-index", name: t("command.rebuildReferenceUsageIndex"), callback: () => void referenceUsage.rebuildReferenceUsageIndex() });
    plugin.addCommand({ id: "clear-reference-usage-index", name: t("command.clearReferenceUsageIndex"), callback: () => void referenceUsage.clearReferenceUsageIndex() });
    plugin.addCommand({ id: "show-reference-usage-index-stats", name: t("command.showReferenceUsageIndexStats"), callback: () => void referenceUsage.showReferenceUsageIndexStats() });
    plugin.addCommand({ id: "find-reference-usages-under-cursor", name: t("command.findReferenceUsagesUnderCursor"), callback: () => void referenceUsage.findUsagesUnderCursor() });
    plugin.addCommand({ id: "open-reference-usages-panel-under-cursor", name: t("command.openReferenceUsagesPanelUnderCursor"), callback: () => void referenceUsage.openUsagesPanelUnderCursor() });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-page-down",
        name: t("command.scrollBiblePreviewPanelPageDown"),
        callback: () => void (reader.scrollActive("page-down") || preview.scroll("page-down")),
    });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-page-up",
        name: t("command.scrollBiblePreviewPanelPageUp"),
        callback: () => void (reader.scrollActive("page-up") || preview.scroll("page-up")),
    });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-top",
        name: t("command.scrollBiblePreviewPanelTop"),
        callback: () => void (reader.scrollActive("top") || preview.scroll("top")),
    });
    plugin.addCommand({
        id: "scroll-bible-preview-panel-bottom",
        name: t("command.scrollBiblePreviewPanelBottom"),
        callback: () => void (reader.scrollActive("bottom") || preview.scroll("bottom")),
    });
    plugin.addCommand({
        id: "toggle-bible-preview-active",
        name: t("command.togglePluginActive"),
        callback: () => void settings.togglePluginActive(),
    });
    plugin.addCommand({ id: "open-bible-reader", name: t("command.openBibleReader"), callback: () => void reader.openReader() });
    plugin.addCommand({ id: "go-to-bible-chapter", name: t("command.goToBibleChapter"), callback: () => void reader.openNavigator() });
    plugin.addCommand({
        id: "open-bible-reference-under-cursor",
        name: t("command.openBibleReferenceUnderCursor"),
        callback: () => editor.openReferenceUnderCursor(true),
    });
}
