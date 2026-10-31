import type { App, TFile } from "obsidian";
import type { BibleReference } from "../domain/BibleReference";
import { ensureVaultDirectoryExists, normalizePath } from "../infrastructure/VaultPathUtils";
import type { BibleReferenceMatch } from "../parsing/BibleReferenceParser";

export const REFERENCE_USAGE_INDEX_VERSION = 1;
export const REFERENCE_USAGE_INDEX_FILE_NAME = "reference-usage-index.json";
export const REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES = 1024 * 1024;
export const REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES = 512 * 1024;
const REFERENCE_USAGE_INDEX_SAVE_DELAY_MS = 1000;
const REFERENCE_USAGE_EXCERPT_BEFORE_CHARS = 30;
const REFERENCE_USAGE_EXCERPT_AFTER_CHARS = 140;
const REFERENCE_USAGE_EXCERPT_ELLIPSIS = "…";
// Bump when the excerpt format changes, so indexes with excerpts in the old format are rebuilt.
const REFERENCE_USAGE_EXCERPT_FORMAT_VERSION = 2;
// Quote markers, then a heading, list item (with an optional task box) or ordered list marker.
const MARKDOWN_LINE_PREFIX_PATTERN = /^(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/u;
const REFERENCE_USAGE_BUILD_YIELD_EVERY_FILES = 25;
export const REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES = 10;
const REFERENCE_USAGE_BUILD_ABORT_ERROR_NAME = "AbortError";

export type ReferenceUsageIndexServiceOptions = {
    maxMarkdownFileSizeBytes?: number;
    buildYieldEveryFiles?: number;
    // Signature of the parser that produces the matches (getBibleReferenceParserSignature).
    getParserSignature?: () => string;
};

export type ReferenceUsageIndexBuildProgress = {
    totalFileCount: number;
    processedFileCount: number;
    updatedFileCount: number;
    skippedLargeFileCount: number;
};

export type ReferenceUsageIndexBuildOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: ReferenceUsageIndexBuildProgress) => void;
};

export type ReferenceUsageIndex = {
    version: number;
    updatedAt: number;
    // Parser signature of the last full pass over the vault; null for an index from before signatures.
    parserSignature: string | null;
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
    // The index was built by a parser with other book names or rules; a build parses all notes again.
    isOutdated: boolean;
};

export type ReferenceUsageIndexBuildResult = ReferenceUsageIndexStats & {
    updatedFileCount: number;
    skippedLargeFileCount: number;
    maxFileSizeBytes: number;
};

export class ReferenceUsageIndexService {
    private index: ReferenceUsageIndex = createEmptyReferenceUsageIndex();
    private saveTimeout: number | null = null;
    // Last editor text indexed per open note, so repeated searches skip unchanged notes.
    private readonly syncedOpenFileContents = new Map<string, string>();
    private readonly maxMarkdownFileSizeBytes: number;
    private readonly buildYieldEveryFiles: number;
    private readonly getParserSignature: () => string;

    constructor(
        private readonly app: App,
        private readonly getDataDirectoryPath: () => string,
        private readonly parseMatches: (text: string) => BibleReferenceMatch[],
        private readonly getExcludedFolders: () => string[],
        options: ReferenceUsageIndexServiceOptions = {},
    ) {
        this.maxMarkdownFileSizeBytes = options.maxMarkdownFileSizeBytes ?? REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES;
        this.buildYieldEveryFiles = options.buildYieldEveryFiles ?? REFERENCE_USAGE_BUILD_YIELD_EVERY_FILES;
        this.getParserSignature = options.getParserSignature ?? (() => "");
    }

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
        await ensureVaultDirectoryExists(this.app.vault.adapter, this.getDataDirectoryPath());
        await this.app.vault.adapter.write(this.getIndexPath(), JSON.stringify(this.index));
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

    // Used on unload: writes a scheduled save right away instead of dropping it.
    public flushPendingSave(): void {
        if (this.saveTimeout === null) return;
        window.clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
        void this.save();
    }

    public async build(
        files: TFile[],
        forceRebuild: boolean,
        options: ReferenceUsageIndexBuildOptions = {},
    ): Promise<ReferenceUsageIndexBuildResult> {
        assertReferenceUsageBuildNotAborted(options.signal);
        const indexableFiles = files.filter((file) => this.shouldIndexFile(file));
        const buildableFiles = indexableFiles.filter((file) => !this.isFileTooLargeForIndex(file));
        const skippedLargeFileCount = indexableFiles.length - buildableFiles.length;
        const indexedFilePaths = new Set(buildableFiles.map((file) => file.path));
        const parserSignature = this.getIndexSignature();
        // Notes indexed by another parser may hold other references even when unchanged, so parse them all again.
        const reparseAllFiles = forceRebuild || this.index.parserSignature !== parserSignature;
        const nextIndex = reparseAllFiles ? createEmptyReferenceUsageIndex() : normalizeReferenceUsageIndex(this.index);

        for (const indexedFilePath of Object.keys(nextIndex.files)) {
            if (!indexedFilePaths.has(indexedFilePath)) {
                delete nextIndex.files[indexedFilePath];
            }
        }

        let updatedFileCount = 0;
        let processedFileCount = 0;
        options.onProgress?.(createReferenceUsageBuildProgress(buildableFiles.length, processedFileCount, updatedFileCount, skippedLargeFileCount));

        for (const file of buildableFiles) {
            assertReferenceUsageBuildNotAborted(options.signal);
            processedFileCount += 1;
            const existingFileIndex = nextIndex.files[file.path];
            if (!reparseAllFiles && existingFileIndex !== undefined && existingFileIndex.mtime === file.stat.mtime && existingFileIndex.size === file.stat.size) {
                options.onProgress?.(createReferenceUsageBuildProgress(buildableFiles.length, processedFileCount, updatedFileCount, skippedLargeFileCount));
                await yieldReferenceUsageBuildIfNeeded(processedFileCount, this.buildYieldEveryFiles);
                continue;
            }
            const content = await this.app.vault.cachedRead(file);
            assertReferenceUsageBuildNotAborted(options.signal);
            nextIndex.files[file.path] = this.createIndexedFile(file, content);
            updatedFileCount += 1;
            options.onProgress?.(createReferenceUsageBuildProgress(buildableFiles.length, processedFileCount, updatedFileCount, skippedLargeFileCount));
            await yieldReferenceUsageBuildIfNeeded(processedFileCount, this.buildYieldEveryFiles);
        }

        assertReferenceUsageBuildNotAborted(options.signal);
        nextIndex.updatedAt = Date.now();
        nextIndex.parserSignature = parserSignature;
        this.index = nextIndex;
        this.syncedOpenFileContents.clear();
        await this.save();
        return {
            ...this.getStats(),
            updatedFileCount,
            skippedLargeFileCount,
            maxFileSizeBytes: this.maxMarkdownFileSizeBytes,
        };
    }

    public async clear(): Promise<void> {
        this.index = createEmptyReferenceUsageIndex();
        this.syncedOpenFileContents.clear();
        await this.save();
    }

    public async updateFile(file: TFile): Promise<void> {
        if (!this.shouldIndexFile(file) || this.isFileTooLargeForIndex(file)) {
            this.removeFile(file.path);
            return;
        }
        const content = await this.app.vault.cachedRead(file);
        this.index.files[file.path] = this.createIndexedFile(file, content);
        this.scheduleSave();
    }

    // Indexes an open note from its editor text, including unsaved edits. Returns true when its references changed.
    public syncOpenFileContent(file: TFile, content: string): boolean {
        if (this.syncedOpenFileContents.get(file.path) === content) {
            return false;
        }
        this.syncedOpenFileContents.set(file.path, content);
        if (!this.shouldIndexFile(file) || this.isFileTooLargeForIndex(file)) {
            return this.removeFile(file.path);
        }
        const previousFile = this.index.files[file.path];
        const nextFile = this.createIndexedFile(file, content);
        this.index.files[file.path] = nextFile;
        if (areIndexedReferenceUsagesEqual(previousFile?.references ?? [], nextFile.references)) {
            return false;
        }
        this.scheduleSave();
        return true;
    }

    public retainSyncedOpenFiles(openFilePaths: ReadonlySet<string>): void {
        for (const path of this.syncedOpenFileContents.keys()) {
            if (!openFilePaths.has(path)) {
                this.syncedOpenFileContents.delete(path);
            }
        }
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

    public isOutdated(): boolean {
        return Object.keys(this.index.files).length > 0 && this.index.parserSignature !== this.getIndexSignature();
    }

    // The parser signature plus the excerpt format: either one changing means the notes must be indexed again.
    private getIndexSignature(): string {
        return `${this.getParserSignature()}|excerpt:${REFERENCE_USAGE_EXCERPT_FORMAT_VERSION}`;
    }

    public getStats(): ReferenceUsageIndexStats {
        return {
            fileCount: Object.keys(this.index.files).length,
            referenceCount: Object.values(this.index.files).reduce((count, file) => count + file.references.length, 0),
            updatedAt: this.index.updatedAt,
            indexPath: this.getIndexPath(),
            isOutdated: this.isOutdated(),
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

    private isFileTooLargeForIndex(file: TFile): boolean {
        return file.stat.size > this.maxMarkdownFileSizeBytes;
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
                        id: `${lineIndex + 1}:${match.from}:${match.to}:${referenceIndex}`,
                        sourceText: match.text,
                        book: reference.book,
                        chapterStart: reference.chapterStart,
                        verseStart: reference.verseStart,
                        chapterEnd: reference.chapterEnd,
                        verseEnd: reference.verseEnd,
                        line: lineIndex + 1,
                        chStart: match.from,
                        chEnd: match.to,
                        excerpt: createReferenceUsageExcerpt(lines, lineIndex, match.from, match.to),
                    });
                }
            }
        }
        return { path: file.path, mtime: file.stat.mtime, size: file.stat.size, references };
    }
}

export function isReferenceUsageIndexBuildAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === REFERENCE_USAGE_BUILD_ABORT_ERROR_NAME;
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
    return { version: REFERENCE_USAGE_INDEX_VERSION, updatedAt: 0, parserSignature: null, files: {} };
}

export function createReferenceUsageExcerpt(lines: readonly string[], lineIndex: number, from: number, to: number): string {
    const line = lines[lineIndex];
    const excerptStart = Math.max(0, from - REFERENCE_USAGE_EXCERPT_BEFORE_CHARS);
    const excerptEnd = Math.min(line.length, to + REFERENCE_USAGE_EXCERPT_AFTER_CHARS);
    const suffix = excerptEnd < line.length ? REFERENCE_USAGE_EXCERPT_ELLIPSIS : "";
    if (excerptStart > 0) {
        return `${REFERENCE_USAGE_EXCERPT_ELLIPSIS}${line.slice(excerptStart, excerptEnd).trim()}${suffix}`;
    }
    const lineText = line.slice(0, excerptEnd).trim();
    // Little or no text before the reference on its line (e.g. "About Happy:" on the line above): fill up with the end of the previous line.
    const missingChars = REFERENCE_USAGE_EXCERPT_BEFORE_CHARS - line.slice(0, from).trim().length;
    const context = missingChars > 0 ? getPreviousLineContext(lines, lineIndex, missingChars) : "";
    return `${context.length > 0 ? `${context} ` : ""}${lineText}${suffix}`;
}

// The end of the nearest non-empty line above, within the same block: at most one blank line between,
// and not across a code fence or a front matter / horizontal rule line.
function getPreviousLineContext(lines: readonly string[], lineIndex: number, maxChars: number): string {
    let previousIndex = lineIndex - 1;
    if (previousIndex >= 0 && lines[previousIndex].trim().length === 0) {
        previousIndex -= 1;
    }
    if (previousIndex < 0) {
        return "";
    }
    const previousLine = lines[previousIndex].trim();
    if (previousLine.length === 0 || /^(?:```|~~~|---\s*$)/u.test(previousLine)) {
        return "";
    }
    const text = previousLine.replace(MARKDOWN_LINE_PREFIX_PATTERN, "").trim();
    if (text.length <= maxChars) {
        return text;
    }
    let tail = text.slice(text.length - maxChars);
    // Start at a word boundary when the cut falls inside a word.
    if (!/\s/u.test(text[text.length - maxChars - 1])) {
        const spaceIndex = tail.search(/\s/u);
        tail = spaceIndex >= 0 ? tail.slice(spaceIndex) : "";
    }
    tail = tail.trim();
    return tail.length > 0 ? `${REFERENCE_USAGE_EXCERPT_ELLIPSIS}${tail}` : "";
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
    return {
        version: REFERENCE_USAGE_INDEX_VERSION,
        updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
        parserSignature: typeof value.parserSignature === "string" ? value.parserSignature : null,
        files,
    };
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

function createReferenceUsageBuildProgress(
    totalFileCount: number,
    processedFileCount: number,
    updatedFileCount: number,
    skippedLargeFileCount: number,
): ReferenceUsageIndexBuildProgress {
    return {
        totalFileCount,
        processedFileCount,
        updatedFileCount,
        skippedLargeFileCount,
    };
}

function assertReferenceUsageBuildNotAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted !== true) {
        return;
    }
    const error = new Error("Reference usage index build was cancelled.");
    error.name = REFERENCE_USAGE_BUILD_ABORT_ERROR_NAME;
    throw error;
}

function areIndexedReferenceUsagesEqual(left: IndexedReferenceUsage[], right: IndexedReferenceUsage[]): boolean {
    return left.length === right.length && JSON.stringify(left) === JSON.stringify(right);
}

async function yieldReferenceUsageBuildIfNeeded(processedFileCount: number, everyCount: number): Promise<void> {
    if (everyCount <= 0 || processedFileCount % everyCount !== 0) {
        return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
