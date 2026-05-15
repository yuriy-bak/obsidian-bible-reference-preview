import type { DataAdapter } from "obsidian";
import { BibleIndex } from "../BibleIndex";
import { BibleIndexData } from "../BibleIndexData";
import { InMemoryBibleIndex } from "../InMemoryBibleIndex";
import { mockBibleIndexData } from "../mockBibleIndex";
import { EpubBibleImportReport } from "../EpubBibleImporter";
import { BibleBookV2Loader } from "./BibleBookV2Loader";
import { BibleIndexV2Data } from "./BibleIndexV2Data";
import { CompactBibleBookData } from "./CompactBibleBookData";
import { LazyBibleIndexV2 } from "./LazyBibleIndexV2";

const BIBLE_INDEX_V2_FILE_NAME = "bible-index-v2.json";
const LEGACY_BIBLE_INDEX_FILE_NAME = "bible-index.json";
const IMPORT_REPORT_FILE_NAME = "import-report.json";

export type SaveBibleIndexV2Input = { metadata: BibleIndexV2Data; books: Record<string, CompactBibleBookData>; report: EpubBibleImportReport; };

export class ObsidianBibleIndexV2Repository implements BibleBookV2Loader {
    private currentV2Data: BibleIndexV2Data | null = null;
    private currentLegacyData: BibleIndexData | null;

    constructor(private readonly adapter: DataAdapter, private readonly dataDirectoryPath: string, fallbackData: BibleIndexData = mockBibleIndexData) {
        this.currentLegacyData = fallbackData;
    }

    async load(): Promise<void> {
        if (await this.adapter.exists(this.getMetadataPath())) {
            const parsed = JSON.parse(await this.adapter.read(this.getMetadataPath())) as unknown;
            if (isBibleIndexV2Data(parsed)) { this.currentV2Data = parsed; this.currentLegacyData = null; return; }
        }
        if (await this.adapter.exists(this.getLegacyIndexPath())) {
            const parsed = JSON.parse(await this.adapter.read(this.getLegacyIndexPath())) as unknown;
            if (isBibleIndexData(parsed)) { this.currentV2Data = null; this.currentLegacyData = parsed; }
        }
    }

    async saveV2(input: SaveBibleIndexV2Input): Promise<void> {
        await this.ensureDirectoryExists(this.dataDirectoryPath);
        for (const [path, book] of Object.entries(input.books)) {
            const fullPath = normalizePath(`${this.dataDirectoryPath}/${path}`);
            await this.ensureDirectoryExists(getDirectoryPath(fullPath));
            await this.adapter.write(fullPath, JSON.stringify(book));
        }
        await this.adapter.write(this.getMetadataPath(), JSON.stringify(input.metadata));
        await this.adapter.write(this.getImportReportPath(), JSON.stringify(input.report));
        this.currentV2Data = input.metadata;
        this.currentLegacyData = null;
    }

    getIndex(): BibleIndex { return this.currentV2Data !== null ? new LazyBibleIndexV2(this.currentV2Data, this) : new InMemoryBibleIndex(this.currentLegacyData ?? mockBibleIndexData); }
    getV2Data(): BibleIndexV2Data | null { return this.currentV2Data; }
    getLegacyData(): BibleIndexData | null { return this.currentLegacyData; }

    async loadBook(translationId: string, bookId: number): Promise<CompactBibleBookData | null> {
        const bookMetadata = this.currentV2Data?.translations[translationId]?.books[String(bookId)];
        if (bookMetadata === undefined) return null;
        const bookPath = normalizePath(`${this.dataDirectoryPath}/${bookMetadata.path}`);
        if (!(await this.adapter.exists(bookPath))) return null;
        const parsed = JSON.parse(await this.adapter.read(bookPath)) as unknown;
        return isCompactBibleBookData(parsed) ? parsed : null;
    }

    getMetadataPath(): string { return normalizePath(`${this.dataDirectoryPath}/${BIBLE_INDEX_V2_FILE_NAME}`); }
    getLegacyIndexPath(): string { return normalizePath(`${this.dataDirectoryPath}/${LEGACY_BIBLE_INDEX_FILE_NAME}`); }
    getImportReportPath(): string { return normalizePath(`${this.dataDirectoryPath}/${IMPORT_REPORT_FILE_NAME}`); }

    private async ensureDirectoryExists(path: string): Promise<void> {
        const normalized = normalizePath(path);
        if (normalized.length === 0 || await this.adapter.exists(normalized)) return;
        const parent = getDirectoryPath(normalized);
        if (parent !== normalized && parent.length > 0) await this.ensureDirectoryExists(parent);
        if (!(await this.adapter.exists(normalized))) await this.adapter.mkdir(normalized);
    }
}

function isBibleIndexV2Data(value: unknown): value is BibleIndexV2Data { return isRecord(value) && value.version === 2 && isRecord(value.translations); }
function isBibleIndexData(value: unknown): value is BibleIndexData { return isRecord(value) && isRecord(value.translations); }
function isCompactBibleBookData(value: unknown): value is CompactBibleBookData { return isRecord(value) && Array.isArray(value.chapters); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function normalizePath(path: string): string { return path.split("\\").join("/").replace(/\/+/g, "/"); }
function getDirectoryPath(path: string): string { const normalized = normalizePath(path); const slashIndex = normalized.lastIndexOf("/"); return slashIndex < 0 ? "" : normalized.slice(0, slashIndex); }
