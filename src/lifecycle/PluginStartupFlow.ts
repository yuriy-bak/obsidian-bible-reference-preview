export type PluginStartupFlowInput = {
    loadPluginSettings(): Promise<void>;
    loadBibleIndex(): Promise<void>;
    loadReferenceUsageIndex(): Promise<void>;
    initializePluginLifecycle(): void;
};

export async function initializePluginStartup(input: PluginStartupFlowInput): Promise<void> {
    await input.loadPluginSettings();
    await input.loadBibleIndex();
    await input.loadReferenceUsageIndex();
    input.initializePluginLifecycle();
}
