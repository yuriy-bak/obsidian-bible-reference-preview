import type { App, WorkspaceLeaf } from "obsidian";
import { BiblePluginSettingTab } from "../ui/BiblePluginSettingTab";

export type SettingsTabInitializationInput = {
    app: App;
    plugin: ConstructorParameters<typeof BiblePluginSettingTab>[1];
    addSettingTab(tab: BiblePluginSettingTab): void;
};

export function initializeSettingsTab(input: SettingsTabInitializationInput): BiblePluginSettingTab {
    const settingsTab = new BiblePluginSettingTab(input.app, input.plugin);
    input.addSettingTab(settingsTab);
    return settingsTab;
}

export type WorkspaceAndKeyboardHandlersRegistrationInput = {
    app: App;
    registerEvent(eventRef: ReturnType<App["workspace"]["on"]>): void;
    registerDisposer(disposer: () => void): void;
    onActiveLeafChange(activeLeaf: WorkspaceLeaf | null): void;
    panelEscapeKeydownHandler(event: KeyboardEvent): void;
    registerGlobalLinkOpenShortcutHandler(): void;
};

export function registerWorkspaceAndKeyboardHandlers(input: WorkspaceAndKeyboardHandlersRegistrationInput): void {
    input.registerEvent(input.app.workspace.on("active-leaf-change", (activeLeaf) => input.onActiveLeafChange(activeLeaf)));
    document.addEventListener("keydown", input.panelEscapeKeydownHandler, true);
    input.registerDisposer(() => document.removeEventListener("keydown", input.panelEscapeKeydownHandler, true));
    input.registerGlobalLinkOpenShortcutHandler();
}
