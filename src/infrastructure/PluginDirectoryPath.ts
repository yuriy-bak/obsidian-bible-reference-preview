export type PluginManifestWithDirectory = {
    id: string;
    dir?: string;
};

export function getPluginDirectoryPath(manifest: PluginManifestWithDirectory): string {
    return manifest.dir ?? `.obsidian/plugins/${manifest.id}`;
}

export function getBibleIndexDataDirectoryPath(manifest: PluginManifestWithDirectory): string {
    return `${getPluginDirectoryPath(manifest)}/data`;
}
