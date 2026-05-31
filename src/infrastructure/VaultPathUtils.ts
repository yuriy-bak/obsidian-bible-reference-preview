import type { DataAdapter } from "obsidian";

export async function ensureVaultDirectoryExists(adapter: DataAdapter, path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (normalizedPath.length === 0 || await adapter.exists(normalizedPath)) {
        return;
    }

    const parentPath = getDirectoryPath(normalizedPath);
    if (parentPath.length > 0 && parentPath !== normalizedPath) {
        await ensureVaultDirectoryExists(adapter, parentPath);
    }

    if (!(await adapter.exists(normalizedPath))) {
        await adapter.mkdir(normalizedPath);
    }
}

export function normalizePath(path: string): string {
    return path.split("\\").join("/").replace(/\/+/g, "/");
}

export function getDirectoryPath(path: string): string {
    const normalizedPath = normalizePath(path);
    const slashIndex = normalizedPath.lastIndexOf("/");
    return slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex);
}
