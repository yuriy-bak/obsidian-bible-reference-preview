export type PluginManifestWithDirectory = {
    id: string;
    dir?: string;
};

// configDir is app.vault.configDir: the vault configuration folder is not always ".obsidian".
export function getPluginDirectoryPath(manifest: PluginManifestWithDirectory, configDir: string): string {
    return manifest.dir ?? `${configDir}/plugins/${manifest.id}`;
}

export function getBibleIndexDataDirectoryPath(manifest: PluginManifestWithDirectory, configDir: string): string {
    return `${getPluginDirectoryPath(manifest, configDir)}/data`;
}
