import type { DataAdapter } from "obsidian";
import { BibleIndex, EMPTY_BIBLE_INDEX } from "../BibleIndex";
import { ensureVaultDirectoryExists, getDirectoryPath, normalizePath } from "../VaultPathUtils";
import { BibleImportReport } from "../sources/BibleSource";
import { BibleBookV2Loader } from "./BibleBookV2Loader";
import { BibleIndexV2Data, BibleIndexV2TranslationMetadata } from "./BibleIndexV2Data";
import { sanitizeBibleIndexV2Data } from "./BibleIndexV2Validation";
import { CompactBibleBookData } from "./CompactBibleBookData";
import { LazyBibleIndexV2 } from "./LazyBibleIndexV2";

const BIBLES_INDEX_FILE_NAME = "bibles-index.json";
const OLD_BIBLE_INDEX_V2_FILE_NAME = "bible-index-v2.json";
const IMPORT_REPORT_FILE_NAME = "import-report.json";
const SAVE_BIBLE_INDEX_YIELD_EVERY_BOOKS = 10;

export type SaveBibleIndexV2Input = {
    metadata: BibleIndexV2Data;
    books: Record<string, CompactBibleBookData>;
    report: BibleImportReport;
};

export class ObsidianBibleIndexV2Repository implements BibleBookV2Loader {
    private currentV2Data: BibleIndexV2Data | null = null;

    constructor(
        private readonly adapter: DataAdapter,
        private readonly dataDirectoryPath: string,
    ) {}

    async load(): Promise<void> {
        const newIndex = await this.readV2Index(this.getMetadataPath());

        if (newIndex !== null) {
            this.currentV2Data = newIndex;
            return;
        }

        const oldV2Index = await this.readV2Index(this.getOldV2MetadataPath());

        if (oldV2Index !== null) {
            this.currentV2Data = oldV2Index;
            return;
        }

        this.currentV2Data = null;
    }

    async saveV2(input: SaveBibleIndexV2Input): Promise<void> {
        await ensureVaultDirectoryExists(this.adapter, this.dataDirectoryPath);

        const translationId = input.report.translationId;
        const incomingTranslation = input.metadata.translations[translationId];

        if (incomingTranslation === undefined) {
            throw new Error(`Imported translation metadata was not found: ${translationId}`);
        }

        const nextData: BibleIndexV2Data = this.currentV2Data ?? {
            version: 2,
            translations: {},
        };

        delete nextData.translations[translationId];
        await this.removeTranslationDirectory(translationId);

        let savedBookCount = 0;
        for (const [path, book] of Object.entries(input.books)) {
            const fullPath = normalizePath(`${this.dataDirectoryPath}/${path}`);
            await ensureVaultDirectoryExists(this.adapter, getDirectoryPath(fullPath));
            await this.adapter.write(fullPath, JSON.stringify(book));
            savedBookCount += 1;
            await yieldSaveBibleIndexIfNeeded(savedBookCount);
        }

        nextData.translations[translationId] = incomingTranslation;
        await this.adapter.write(this.getMetadataPath(), JSON.stringify(nextData));
        await this.adapter.write(this.getImportReportPath(), JSON.stringify(input.report));
        this.currentV2Data = nextData;
    }

    async deleteTranslation(translationId: string): Promise<void> {
        if (this.currentV2Data === null || this.currentV2Data.translations[translationId] === undefined) {
            return;
        }

        const nextData: BibleIndexV2Data = {
            version: 2,
            translations: { ...this.currentV2Data.translations },
        };

        delete nextData.translations[translationId];
        await this.removeTranslationDirectory(translationId);
        await ensureVaultDirectoryExists(this.adapter, this.dataDirectoryPath);
        await this.adapter.write(this.getMetadataPath(), JSON.stringify(nextData));
        this.currentV2Data = nextData;
    }

    /** Updates the stored scheme fields of one translation, keeping everything else in bibles-index.json. */
    async updateTranslationVersification(
        translationId: string,
        fields: Required<Pick<BibleIndexV2TranslationMetadata, "versification">> & Pick<BibleIndexV2TranslationMetadata, "bookOrder">,
    ): Promise<void> {
        // Re-read the file: an import may have saved another translation since this repository was loaded.
        const latestData = await this.readV2Index(this.getMetadataPath()) ?? this.currentV2Data;
        const translation = latestData?.translations[translationId];
        if (latestData === null || translation === undefined) {
            return;
        }

        const nextData: BibleIndexV2Data = {
            version: 2,
            translations: {
                ...latestData.translations,
                [translationId]: { ...translation, ...fields },
            },
        };
        await this.adapter.write(this.getMetadataPath(), JSON.stringify(nextData));
        this.currentV2Data = nextData;
    }

    getIndex(): BibleIndex {
        return this.currentV2Data !== null
            ? new LazyBibleIndexV2(this.currentV2Data, this)
            : EMPTY_BIBLE_INDEX;
    }

    getV2Data(): BibleIndexV2Data | null {
        return this.currentV2Data;
    }

    async loadBook(translationId: string, bookId: number): Promise<CompactBibleBookData | null> {
        const bookMetadata = this.currentV2Data?.translations[translationId]?.books[String(bookId)];

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

    private async readV2Index(path: string): Promise<BibleIndexV2Data | null> {
        if (!(await this.adapter.exists(path))) {
            return null;
        }

        const parsed = JSON.parse(await this.adapter.read(path)) as unknown;
        return isBibleIndexV2Data(parsed) ? sanitizeBibleIndexV2Data(parsed) : null;
    }

    private async removeTranslationDirectory(translationId: string): Promise<void> {
        const path = normalizePath(`${this.dataDirectoryPath}/translations/${translationId}`);

        if (!(await this.adapter.exists(path))) {
            return;
        }

        await this.adapter.rmdir(path, true);
    }
}

function isBibleIndexV2Data(value: unknown): value is BibleIndexV2Data {
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
