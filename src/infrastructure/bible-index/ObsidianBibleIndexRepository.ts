import type { DataAdapter } from "obsidian";
import { BibleIndex, EMPTY_BIBLE_INDEX } from "../BibleIndex";
import { ensureVaultDirectoryExists, getBackupPath, getDirectoryPath, normalizePath, writeFileWithBackup } from "../VaultPathUtils";
import { EpubImportError } from "../epub/EpubImportError";
import { BibleImportReport } from "../sources/BibleSource";
import { BibleBookLoader } from "./BibleBookLoader";
import { BibleIndexData, BibleIndexTranslationMetadata } from "./BibleIndexData";
import { sanitizeBibleIndexData } from "./BibleIndexValidation";
import { CompactBibleBookData } from "./CompactBibleBookData";
import { LazyBibleIndex } from "./LazyBibleIndex";

const BIBLES_INDEX_FILE_NAME = "bibles-index.json";
const OLD_BIBLE_INDEX_V2_FILE_NAME = "bible-index-v2.json";
const IMPORT_REPORT_FILE_NAME = "import-report.json";
const SAVE_BIBLE_INDEX_YIELD_EVERY_BOOKS = 10;

export type SaveBibleIndexInput = {
    metadata: BibleIndexData;
    books: Record<string, CompactBibleBookData>;
    report: BibleImportReport;
    onProgress?: (savedBookCount: number, totalBookCount: number) => void;
};

export class ObsidianBibleIndexRepository implements BibleBookLoader {
    private currentIndexData: BibleIndexData | null = null;

    constructor(
        private readonly adapter: DataAdapter,
        private readonly dataDirectoryPath: string,
    ) {}

    async load(): Promise<void> {
        const newIndex = await this.readIndexFile(this.getMetadataPath());

        if (newIndex !== null) {
            this.currentIndexData = newIndex;
            return;
        }

        const oldFormatIndex = await this.readIndexFile(this.getOldV2MetadataPath());

        if (oldFormatIndex !== null) {
            this.currentIndexData = oldFormatIndex;
            return;
        }

        this.currentIndexData = null;
    }

    async saveTranslation(input: SaveBibleIndexInput): Promise<void> {
        await ensureVaultDirectoryExists(this.adapter, this.dataDirectoryPath);

        const translationId = input.report.translationId;
        const incomingTranslation = input.metadata.translations[translationId];

        if (incomingTranslation === undefined) {
            throw new Error(`Imported translation metadata was not found: ${translationId}`);
        }

        // The new books are written over the old ones and the files the new import has no longer are removed
        // after that: a reimport that fails halfway leaves the translation readable instead of deleted.
        const bookEntries = Object.entries(input.books);
        const writtenPaths = new Set<string>();
        let savedBookCount = 0;
        input.onProgress?.(0, bookEntries.length);
        for (const [path, book] of bookEntries) {
            const fullPath = normalizePath(`${this.dataDirectoryPath}/${path}`);
            await ensureVaultDirectoryExists(this.adapter, getDirectoryPath(fullPath));
            await this.adapter.write(fullPath, JSON.stringify(book));
            writtenPaths.add(fullPath);
            savedBookCount += 1;
            input.onProgress?.(savedBookCount, bookEntries.length);
            await yieldSaveBibleIndexIfNeeded(savedBookCount);
        }

        // Read again: other translations may have been renamed or deleted while this one was being imported.
        const nextData: BibleIndexData = await this.readIndexFile(this.getMetadataPath()) ?? this.currentIndexData ?? {
            version: 2,
            translations: {},
        };
        nextData.translations[translationId] = incomingTranslation;
        await writeFileWithBackup(this.adapter, this.getMetadataPath(), JSON.stringify(nextData));
        await this.adapter.write(this.getImportReportPath(), JSON.stringify(input.report));
        this.currentIndexData = nextData;
        await this.removeFilesExcept(normalizePath(`${this.dataDirectoryPath}/translations/${translationId}`), writtenPaths);
    }

    async deleteTranslation(translationId: string): Promise<void> {
        if (this.currentIndexData === null || this.currentIndexData.translations[translationId] === undefined) {
            return;
        }

        const nextData: BibleIndexData = {
            version: 2,
            translations: { ...this.currentIndexData.translations },
        };

        delete nextData.translations[translationId];
        await this.removeTranslationDirectory(translationId);
        await ensureVaultDirectoryExists(this.adapter, this.dataDirectoryPath);
        await writeFileWithBackup(this.adapter, this.getMetadataPath(), JSON.stringify(nextData));
        this.currentIndexData = nextData;
    }

    /** Updates the stored scheme fields of one translation, keeping everything else in bibles-index.json. */
    async updateTranslationVersification(
        translationId: string,
        fields: Required<Pick<BibleIndexTranslationMetadata, "versification">> & Pick<BibleIndexTranslationMetadata, "bookOrder">,
    ): Promise<void> {
        await this.updateTranslationMetadata(translationId, fields);
    }

    /** Stores the display name of one translation; its id, files and everything else stay as they are. */
    async updateTranslationName(translationId: string, name: string): Promise<void> {
        await this.updateTranslationMetadata(translationId, { name });
    }

    private async updateTranslationMetadata(
        translationId: string,
        fields: Partial<Pick<BibleIndexTranslationMetadata, "name" | "versification" | "bookOrder">>,
    ): Promise<void> {
        // Re-read the file: an import may have saved another translation since this repository was loaded.
        const latestData = await this.readIndexFile(this.getMetadataPath()) ?? this.currentIndexData;
        const translation = latestData?.translations[translationId];
        if (latestData === null || translation === undefined) {
            return;
        }

        const nextData: BibleIndexData = {
            version: 2,
            translations: {
                ...latestData.translations,
                [translationId]: { ...translation, ...fields },
            },
        };
        await writeFileWithBackup(this.adapter, this.getMetadataPath(), JSON.stringify(nextData));
        this.currentIndexData = nextData;
    }

    getIndex(): BibleIndex {
        return this.currentIndexData !== null
            ? new LazyBibleIndex(this.currentIndexData, this)
            : EMPTY_BIBLE_INDEX;
    }

    getIndexData(): BibleIndexData | null {
        return this.currentIndexData;
    }

    async loadBook(translationId: string, bookId: number): Promise<CompactBibleBookData | null> {
        const bookMetadata = this.currentIndexData?.translations[translationId]?.books[String(bookId)];

        if (bookMetadata === undefined) {
            return null;
        }

        const bookPath = normalizePath(`${this.dataDirectoryPath}/${bookMetadata.path}`);

        if (!(await this.adapter.exists(bookPath))) {
            return null;
        }

        const parsed = JSON.parse(await this.adapter.read(bookPath)) as unknown;
        return isCompactBibleBookData(parsed) ? parsed : null;
    }

    async readLastImportReport(): Promise<BibleImportReport | null> {
        const path = this.getImportReportPath();

        if (!(await this.adapter.exists(path))) {
            return null;
        }

        const parsed = JSON.parse(await this.adapter.read(path)) as unknown;
        return isImportReport(parsed) ? parsed : null;
    }

    getMetadataPath(): string {
        return normalizePath(`${this.dataDirectoryPath}/${BIBLES_INDEX_FILE_NAME}`);
    }

    getOldV2MetadataPath(): string {
        return normalizePath(`${this.dataDirectoryPath}/${OLD_BIBLE_INDEX_V2_FILE_NAME}`);
    }

    getImportReportPath(): string {
        return normalizePath(`${this.dataDirectoryPath}/${IMPORT_REPORT_FILE_NAME}`);
    }

    /**
     * The translation list, or null when there is none yet. A damaged file (cut off, not the expected shape)
     * is read from its backup; with no usable backup the read fails instead of returning null, so a save never
     * replaces the list of all translations with the one translation it writes.
     */
    private async readIndexFile(path: string): Promise<BibleIndexData | null> {
        const backupPath = getBackupPath(path);
        const exists = await this.adapter.exists(path);
        if (exists) {
            const data = await this.tryReadIndexFile(path);
            if (data !== null) return data;
        }
        // Also when the file is missing: a write stopped between moving it to the backup and putting the new one in place.
        if (await this.adapter.exists(backupPath)) {
            const backup = await this.tryReadIndexFile(backupPath);
            if (backup !== null) {
                console.warn(`Bible index ${path} is ${exists ? "damaged" : "missing"}; its backup is used.`);
                return backup;
            }
        }
        if (!exists) return null;
        throw new EpubImportError(`Bible index is damaged and has no usable backup: ${path}`, "indexDamaged", { path });
    }

    private async tryReadIndexFile(path: string): Promise<BibleIndexData | null> {
        try {
            const parsed = JSON.parse(await this.adapter.read(path)) as unknown;
            return isBibleIndexData(parsed) ? sanitizeBibleIndexData(parsed) : null;
        } catch {
            return null;
        }
    }

    private async removeFilesExcept(directoryPath: string, keptPaths: ReadonlySet<string>): Promise<void> {
        if (!(await this.adapter.exists(directoryPath))) {
            return;
        }
        const listing = await this.adapter.list(directoryPath);
        for (const filePath of listing.files) {
            if (!keptPaths.has(normalizePath(filePath))) {
                await this.adapter.remove(filePath);
            }
        }
        for (const folderPath of listing.folders) {
            await this.removeFilesExcept(folderPath, keptPaths);
        }
    }

    private async removeTranslationDirectory(translationId: string): Promise<void> {
        const path = normalizePath(`${this.dataDirectoryPath}/translations/${translationId}`);

        if (!(await this.adapter.exists(path))) {
            return;
        }

        await this.adapter.rmdir(path, true);
    }
}

function isBibleIndexData(value: unknown): value is BibleIndexData {
    return isRecord(value) && value.version === 2 && isRecord(value.translations);
}

function isCompactBibleBookData(value: unknown): value is CompactBibleBookData {
    return isRecord(value) && Array.isArray(value.chapters);
}

function isImportReport(value: unknown): value is BibleImportReport {
    return isRecord(value)
        && typeof value.translationId === "string"
        && typeof value.translationName === "string"
        && typeof value.language === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function yieldSaveBibleIndexIfNeeded(savedBookCount: number): Promise<void> {
    if (savedBookCount % SAVE_BIBLE_INDEX_YIELD_EVERY_BOOKS !== 0) {
        return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
