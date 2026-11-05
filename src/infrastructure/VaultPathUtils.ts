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

export function getBackupPath(path: string): string {
    return `${path}.bak`;
}

/**
 * Writes a file that must never be left half written: the text goes to a temporary file first, the current
 * file becomes the backup (see getBackupPath), then the temporary file takes its place. A crash or a sync
 * conflict leaves either the new file, or the backup with the previous version.
 */
export async function writeFileWithBackup(adapter: DataAdapter, path: string, data: string): Promise<void> {
    const temporaryPath = `${path}.tmp`;
    const backupPath = getBackupPath(path);
    await adapter.write(temporaryPath, data);
    if (await adapter.exists(path)) {
        if (await adapter.exists(backupPath)) await adapter.remove(backupPath);
        await adapter.rename(path, backupPath);
    }
    await adapter.rename(temporaryPath, path);
}
