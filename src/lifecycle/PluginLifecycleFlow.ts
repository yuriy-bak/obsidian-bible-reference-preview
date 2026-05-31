import type { MarkdownPostProcessorContext, Plugin, WorkspaceLeaf } from "obsidian";
import type { BiblePreviewContent } from "../application/formatBibleTexts";
import type { I18nKey } from "../i18n/I18n";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow, FloatingBiblePreviewWindowInput } from "../ui/FloatingBiblePreviewWindow";
import type { BibleReadingModePreviewController } from "../ui/BibleReadingModePreviewController";
import type { BiblePreviewPaneViewInput } from "../ui/BiblePreviewPaneView";
import type { ReferenceUsagePaneViewInput } from "../ui/ReferenceUsagePaneView";
import type { BiblePluginSettingTab } from "../ui/BiblePluginSettingTab";
import { registerContentProcessingExtensions } from "./PluginContentRegistration";
import { registerPluginActiveRibbonIcon, registerPluginCommands } from "./PluginCommandRegistration";
import { initializeFloatingPreviewWindow, initializeReadingModePreviewController } from "./PluginPreviewInitialization";
import { initializeSettingsTab, registerWorkspaceAndKeyboardHandlers, type SettingsTabInitializationInput } from "./PluginUiInitialization";
import { registerPluginViews } from "./PluginViewRegistration";

type PluginCommand = Parameters<Plugin["addCommand"]>[0];
type RegisterView = Plugin["registerView"];
type RegisterMarkdownPostProcessor = Plugin["registerMarkdownPostProcessor"];
type RegisterEditorExtension = Plugin["registerEditorExtension"];
type EditorExtension = Parameters<RegisterEditorExtension>[0];
type BiblePreviewScrollCommand = "page-down" | "page-up" | "top" | "bottom";

export type PluginLifecycleFlowInput = {
    addCommand(command: PluginCommand): void;
    addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement;
    addSettingTab(tab: BiblePluginSettingTab): void;
    analyzeReferenceText(referenceText: string): Promise<BiblePreviewContent | null>;
    buildReferenceUsageIndex(): Promise<void>;
    clearReferenceUsageIndex(): Promise<void>;
    createBiblePreviewPaneViewInput(): BiblePreviewPaneViewInput;
    createCursorExtension(): EditorExtension;
    createFloatingPreviewWindowInput(): FloatingBiblePreviewWindowInput;
    createReferenceUsagePaneViewInput(): ReferenceUsagePaneViewInput;
    findReferenceUsagesUnderCursor(): Promise<void>;
    getLastPanePreviewContent(): BiblePreviewContent | null;
    getPluginActiveRibbonTitle(): string;
    hasImportedTranslations(): boolean;
    hideFloatingBiblePreview(): void;
    isFloatingPreviewTarget(target: Node): boolean;
    onActiveLeafChange(activeLeaf: WorkspaceLeaf | null): void;
    openBibleIndexFolder(): Promise<void>;
    openBibleReferenceUnderCursorFromActiveEditor(showNotice: boolean): boolean;
    openEpubFilePicker(): void;
    openReferenceUsagesPanelUnderCursor(): Promise<void>;
    panelEscapeKeydownHandler(event: KeyboardEvent): void;
    plugin: SettingsTabInitializationInput["plugin"];
    processReadingModeBibleReferences(element: HTMLElement, context: MarkdownPostProcessorContext): void;
    refreshFloatingPreviewLabels(): void;
    rebuildReferenceUsageIndex(): Promise<void>;
    registerDisposer(disposer: () => void): void;
    registerEditorExtension: RegisterEditorExtension;
    registerEvent(eventRef: ReturnType<SettingsTabInitializationInput["app"]["workspace"]["on"]>): void;
    registerGlobalLinkOpenShortcutHandler(): void;
    registerMarkdownPostProcessor: RegisterMarkdownPostProcessor;
    registerReferenceUsageIndexEvents(): void;
    registerView: RegisterView;
    reloadBibleIndex(): Promise<void>;
    scrollBiblePreview(command: BiblePreviewScrollCommand): Promise<void>;
    setFloatingPreviewWindow(floatingPreviewWindow: FloatingBiblePreviewWindow): void;
    setPluginActiveRibbonIcon(pluginActiveRibbonIconEl: HTMLElement): void;
    setReadingModePreviewController(readingModePreviewController: BibleReadingModePreviewController): void;
    setSettingsTab(settingsTab: BiblePluginSettingTab): void;
    shouldAutoOpenPreviewOnVerseChange(): boolean;
    showBibleIndexStats(): Promise<void>;
    showBiblePreviewContent(content: BiblePreviewContent, anchor: FloatingBiblePreviewAnchor, options: { reveal?: boolean }): void;
    showNoImportedTranslationsNotice(): void;
    showReferenceUsageIndexStats(): Promise<void>;
    togglePluginActive(): Promise<void>;
    translate(key: I18nKey): string;
    updatePluginActiveRibbonIcon(): void;
};

export function initializePluginLifecycle(input: PluginLifecycleFlowInput): void {
    input.setFloatingPreviewWindow(initializeFloatingPreviewWindow({
        createInput: input.createFloatingPreviewWindowInput,
        registerDisposer: input.registerDisposer,
    }));

    registerPluginViews({
        registerView: input.registerView,
        createBiblePreviewPaneViewInput: input.createBiblePreviewPaneViewInput,
        createReferenceUsagePaneViewInput: input.createReferenceUsagePaneViewInput,
        getLastPanePreviewContent: input.getLastPanePreviewContent,
    });

    registerPluginCommands({
        addCommand: input.addCommand,
        translate: input.translate,
        openEpubFilePicker: input.openEpubFilePicker,
        reloadBibleIndex: input.reloadBibleIndex,
        openBibleIndexFolder: input.openBibleIndexFolder,
        showBibleIndexStats: input.showBibleIndexStats,
        buildReferenceUsageIndex: input.buildReferenceUsageIndex,
        rebuildReferenceUsageIndex: input.rebuildReferenceUsageIndex,
        clearReferenceUsageIndex: input.clearReferenceUsageIndex,
        showReferenceUsageIndexStats: input.showReferenceUsageIndexStats,
        findReferenceUsagesUnderCursor: input.findReferenceUsagesUnderCursor,
        openReferenceUsagesPanelUnderCursor: input.openReferenceUsagesPanelUnderCursor,
        scrollBiblePreview: input.scrollBiblePreview,
        togglePluginActive: input.togglePluginActive,
        openBibleReferenceUnderCursorFromActiveEditor: input.openBibleReferenceUnderCursorFromActiveEditor,
    });

    input.setPluginActiveRibbonIcon(registerPluginActiveRibbonIcon({
        addRibbonIcon: input.addRibbonIcon,
        title: input.getPluginActiveRibbonTitle(),
        togglePluginActive: input.togglePluginActive,
    }));
    input.updatePluginActiveRibbonIcon();

    input.setReadingModePreviewController(initializeReadingModePreviewController({
        showBiblePreviewContent: input.showBiblePreviewContent,
        shouldAutoOpenPreviewOnVerseChange: input.shouldAutoOpenPreviewOnVerseChange,
        hasImportedTranslations: input.hasImportedTranslations,
        analyzeReferenceText: input.analyzeReferenceText,
        showNoImportedTranslationsNotice: input.showNoImportedTranslationsNotice,
        refreshFloatingPreviewLabels: input.refreshFloatingPreviewLabels,
        isFloatingPreviewTarget: input.isFloatingPreviewTarget,
        hideFloatingBiblePreview: input.hideFloatingBiblePreview,
    }, input.registerDisposer));

    input.setSettingsTab(initializeSettingsTab({
        app: input.plugin.app,
        plugin: input.plugin,
        addSettingTab: input.addSettingTab,
    }));

    registerWorkspaceAndKeyboardHandlers({
        app: input.plugin.app,
        registerEvent: input.registerEvent,
        registerDisposer: input.registerDisposer,
        onActiveLeafChange: input.onActiveLeafChange,
        panelEscapeKeydownHandler: input.panelEscapeKeydownHandler,
        registerGlobalLinkOpenShortcutHandler: input.registerGlobalLinkOpenShortcutHandler,
    });

    registerContentProcessingExtensions({
        registerMarkdownPostProcessor: input.registerMarkdownPostProcessor,
        registerEditorExtension: input.registerEditorExtension,
        createCursorExtension: input.createCursorExtension,
        processReadingModeBibleReferences: input.processReadingModeBibleReferences,
        registerReferenceUsageIndexEvents: input.registerReferenceUsageIndexEvents,
    });
}
