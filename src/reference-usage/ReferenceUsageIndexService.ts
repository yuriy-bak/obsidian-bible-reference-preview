import type { App, TFile } from "obsidian";
import type { BibleReference } from "../domain/BibleReference";
import type { BibleReferenceMatch } from "../parsing/BibleReferenceParser";

export const REFERENCE_USAGE_INDEX_VERSION = 1;
export const REFERENCE_USAGE_INDEX_FILE_NAME = "reference-usage-index.json";
const REFERENCE_USAGE_INDEX_SAVE_DELAY_MS = 1000;

export type ReferenceUsageIndex = {
    version: number;
    updatedAt: number;
    files: Record<string, IndexedReferenceUsageFile>;
};

export type IndexedReferenceUsageFile = {
    path: string;
    mtime: number;
    size: number;
    references: IndexedReferenceUsage[];
};

export type IndexedReferenceUsage = {
    id: string;
    sourceText: string;
    book: number;
    chapterStart: number;
    verseStart: number;
    chapterEnd: number;
    verseEnd: number;
    line: number;
    chStart: number;
    chEnd: number;
    excerpt: string;
};

export type ReferenceUsageSearchResult = IndexedReferenceUsage & {
    filePath: string;
};

export type ReferenceUsageIndexStats = {
    fileCount: number;
    referenceCount: number;
    updatedAt: number;
    indexPath: string;
};

export type ReferenceUsageIndexBuildResult = ReferenceUsageIndexStats & {
    updatedFileCount: number;
};

export class ReferenceUsageIndexService {
    private index: ReferenceUsageIndex = createEmptyReferenceUsageIndex();
    private saveTimeout: number | null = null;

    constructor(
        private readonly app: App,
        private readonly getDataDirectoryPath: () => string,
        private readonly parseMatches: (text: string) => BibleReferenceMatch[],
        private readonly getExcludedFolders: () => string[],
    ) {}

    public getIndexPath(): string {
        return `${this.getDataDirectoryPath()}/${REFERENCE_USAGE_INDEX_FILE_NAME}`;
    }

    public async load(): Promise<void> {
        const indexPath = this.getIndexPath();
        if (!(await this.app.vault.adapter.exists(indexPath))) {
            this.index = createEmptyReferenceUsageIndex();
            return;
        }
        const rawIndex = await this.app.vault.adapter.read(indexPath);
        this.index = normalizeReferenceUsageIndex(JSON.parse(rawIndex));
    }

    public async save(): Promise<void> {
        this.index.updatedAt = Date.now();
        await ensureAdapterDirectoryExists(this.app, this.getDataDirectoryPath());
        await this.app.vault.adapter.write(this.getIndexPath(), JSON.stringify(this.index, null, 2));
    }

    public scheduleSave(): void {
        if (this.saveTimeout !== null) {
            window.clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = window.setTimeout(() => {
            this.saveTimeout = null;
            void this.save();
        }, REFERENCE_USAGE_INDEX_SAVE_DELAY_MS);
    }

    public clearPendingSave(): void {
        if (this.saveTimeout !== null) {
            window.clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
    }

    public async build(files: TFile[], forceRebuild: boolean): Promise<ReferenceUsageIndexBuildResult> {
        const indexableFiles = files.filter((file) => this.shouldIndexFile(file));
        const indexedFilePaths = new Set(indexableFiles.map((file) => file.path));
        const nextIndex = forceRebuild ? createEmptyReferenceUsageIndex() : normalizeReferenceUsageIndex(this.index);

        for (const indexedFilePath of Object.keys(nextIndex.files)) {
            if (!indexedFilePaths.has(indexedFilePath)) {
                delete nextIndex.files[indexedFilePath];
            }
        }

        let updatedFileCount = 0;
        for (const file of indexableFiles) {
            const existingFileIndex = nextIndex.files[file.path];
            if (!forceRebuild && existingFileIndex !== undefined && existingFileIndex.mtime === file.stat.mtime && existingFileIndex.size === file.stat.size) {
                continue;
            }
            const content = await this.app.vault.cachedRead(file);
            nextIndex.files[file.path] = this.createIndexedFile(file, content);
            updatedFileCount += 1;
        }

        nextIndex.updatedAt = Date.now();
        this.index = nextIndex;
        await this.save();
        return { ...this.getStats(), updatedFileCount };
    }

    public async clear(): Promise<void> {
        this.index = createEmptyReferenceUsageIndex();
        await this.save();
    }

    public async updateFile(file: TFile): Promise<void> {
        if (!this.shouldIndexFile(file)) {
            this.removeFile(file.path);
            return;
        }
        const content = await this.app.vault.cachedRead(file);
        this.index.files[file.path] = this.createIndexedFile(file, content);
        this.scheduleSave();
    }

    public removeFile(path: string): boolean {
        if (this.index.files[path] === undefined) {
            return false;
        }
        delete this.index.files[path];
        this.scheduleSave();
        return true;
    }

    public findUsages(queryReferences: BibleReference[]): ReferenceUsageSearchResult[] {
        const results: ReferenceUsageSearchResult[] = [];
        const seen = new Set<string>();
        for (const file of Object.values(this.index.files)) {
            for (const reference of file.references) {
                if (!queryReferences.some((queryReference) => doBibleReferenceRangesIntersect(queryReference, reference))) {
                    continue;
                }
                const key = `${file.path}:${reference.id}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                results.push({ ...reference, filePath: file.path });
            }
        }
        results.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.line - right.line || left.chStart - right.chStart);
        return results;
    }

    public getStats(): ReferenceUsageIndexStats {
        return {
            fileCount: Object.keys(this.index.files).length,
            referenceCount: Object.values(this.index.files).reduce((count, file) => count + file.references.length, 0),
            updatedAt: this.index.updatedAt,
            indexPath: this.getIndexPath(),
        };
    }

    public shouldIndexFile(file: TFile): boolean {
        if (file.extension !== "md") {
            return false;
        }
        const normalizedPath = normalizePath(file.path);
        const indexDataDirectory = `${normalizePath(this.getDataDirectoryPath())}/`;
        if (normalizedPath.startsWith(indexDataDirectory)) {
            return false;
        }
        return !this.getExcludedFolders().some((folder) => {
            const normalizedFolder = normalizeReferenceUsageExcludedFolder(folder);
            return normalizedFolder.length > 0 && normalizedPath.startsWith(normalizedFolder);
        });
    }

    private createIndexedFile(file: TFile, content: string): IndexedReferenceUsageFile {
        const references: IndexedReferenceUsage[] = [];
        const lines = content.split(/\r?\n/u);
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex];
            const matches = this.parseMatches(line);
            for (const match of matches) {
                for (let referenceIndex = 0; referenceIndex < match.references.length; referenceIndex += 1) {
                    const reference = match.references[referenceIndex];
                    references.push({
                        id: `${file.path}:${lineIndex + 1}:${match.from}:${match.to}:${referenceIndex}`,
                        sourceText: match.text,
                        book: reference.book,
                        chapterStart: reference.chapterStart,
                        verseStart: reference.verseStart,
                        chapterEnd: reference.chapterEnd,
                        verseEnd: reference.verseEnd,
                        line: lineIndex + 1,
                        chStart: match.from,
                        chEnd: match.to,
                        excerpt: line.trim(),
                    });
                }
            }
        }
        return { path: file.path, mtime: file.stat.mtime, size: file.stat.size, references };
    }
}

export function normalizeReferenceUsageExcludedFolders(value: string): string[] {
    return [...new Set(value
        .split(/[\n,]/u)
        .map((folder) => normalizeReferenceUsageExcludedFolder(folder))
        .filter((folder) => folder.length > 0))];
}

export function normalizeReferenceUsageExcludedFolder(value: string): string {
    const folder = normalizePath(value.trim());
    if (folder.length === 0) {
        return "";
    }
    return folder.endsWith("/") ? folder : `${folder}/`;
}

function createEmptyReferenceUsageIndex(): ReferenceUsageIndex {
    return { version: REFERENCE_USAGE_INDEX_VERSION, updatedAt: 0, files: {} };
}

function normalizeReferenceUsageIndex(value: unknown): ReferenceUsageIndex {
    if (!isRecord(value) || value.version !== REFERENCE_USAGE_INDEX_VERSION || !isRecord(value.files)) {
        return createEmptyReferenceUsageIndex();
    }
    const files: Record<string, IndexedReferenceUsageFile> = {};
    for (const [path, file] of Object.entries(value.files)) {
        if (!isRecord(file) || !Array.isArray(file.references)) {
            continue;
        }
        files[path] = {
            path: typeof file.path === "string" ? file.path : path,
            mtime: typeof file.mtime === "number" ? file.mtime : 0,
            size: typeof file.size === "number" ? file.size : 0,
            references: file.references.filter(isIndexedReferenceUsage),
        };
    }
    return { version: REFERENCE_USAGE_INDEX_VERSION, updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0, files };
}

function isIndexedReferenceUsage(value: unknown): value is IndexedReferenceUsage {
    return isRecord(value)
        && typeof value.id === "string"
        && typeof value.sourceText === "string"
        && typeof value.book === "number"
        && typeof value.chapterStart === "number"
        && typeof value.verseStart === "number"
        && typeof value.chapterEnd === "number"
        && typeof value.verseEnd === "number"
        && typeof value.line === "number"
        && typeof value.chStart === "number"
        && typeof value.chEnd === "number"
        && typeof value.excerpt === "string";
}

function doBibleReferenceRangesIntersect(left: BibleReference, right: IndexedReferenceUsage): boolean {
    if (left.book !== right.book) {
        return false;
    }
    return compareBibleReferencePosition(left.chapterStart, left.verseStart, right.chapterEnd, right.verseEnd) <= 0
        && compareBibleReferencePosition(right.chapterStart, right.verseStart, left.chapterEnd, left.verseEnd) <= 0;
}

function compareBibleReferencePosition(leftChapter: number, leftVerse: number, rightChapter: number, rightVerse: number): number {
    return leftChapter !== rightChapter ? leftChapter - rightChapter : leftVerse - rightVerse;
}

async function ensureAdapterDirectoryExists(app: App, path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (normalizedPath.length === 0 || await app.vault.adapter.exists(normalizedPath)) {
        return;
    }
    const parentPath = getDirectoryPath(normalizedPath);
    if (parentPath.length > 0 && parentPath !== normalizedPath) {
        await ensureAdapterDirectoryExists(app, parentPath);
    }
    if (!(await app.vault.adapter.exists(normalizedPath))) {
        await app.vault.adapter.mkdir(normalizedPath);
    }
}

function normalizePath(path: string): string {
    return path.split("\\").join("/").replace(/\/+/g, "/");
}

function getDirectoryPath(path: string): string {
    const normalizedPath = normalizePath(path);
    const slashIndex = normalizedPath.lastIndexOf("/");
    return slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
