import type { DataAdapter } from "obsidian";
import { BibleIndex } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";
import { WritableBibleIndexRepository } from "./BibleIndexRepository";
import { InMemoryBibleIndex } from "./InMemoryBibleIndex";
import { mockBibleIndexData } from "./mockBibleIndex";
import { serializeBibleIndexData } from "./serializeBibleIndexData";

const BIBLE_INDEX_FILE_NAME = "bible-index.json";

export class ObsidianBibleIndexRepository implements WritableBibleIndexRepository {
    private currentData: BibleIndexData;

    constructor(
        private readonly adapter: DataAdapter,
        private readonly dataDirectoryPath: string,
        fallbackData: BibleIndexData = mockBibleIndexData,
    ) {
        this.currentData = fallbackData;
    }

    async load(): Promise<void> {
        const indexPath = this.getIndexPath();
        const indexExists = await this.adapter.exists(indexPath);

        if (!indexExists) {
            return;
        }

        const rawIndex = await this.adapter.read(indexPath);
        const parsedIndex = JSON.parse(rawIndex) as unknown;

        if (!isBibleIndexData(parsedIndex)) {
            return;
        }

        this.currentData = parsedIndex;
    }

    async save(data: BibleIndexData): Promise<void> {
        await this.ensureDataDirectoryExists();

        await this.adapter.write(
            this.getIndexPath(),
            serializeBibleIndexData(data),
        );

        this.currentData = data;
    }

    getIndex(): BibleIndex {
        return new InMemoryBibleIndex(this.currentData);
    }

    getData(): BibleIndexData {
        return this.currentData;
    }

    getIndexPath(): string {
        return normalizePath(`${this.dataDirectoryPath}/${BIBLE_INDEX_FILE_NAME}`);
    }

    private async ensureDataDirectoryExists(): Promise<void> {
        const normalizedDirectoryPath = normalizePath(this.dataDirectoryPath);
        const directoryExists = await this.adapter.exists(normalizedDirectoryPath);

        if (directoryExists) {
            return;
        }

        await this.adapter.mkdir(normalizedDirectoryPath);
    }
}

function isBibleIndexData(value: unknown): value is BibleIndexData {
    if (!isRecord(value)) {
        return false;
    }

    return isRecord(value.translations);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(path: string): string {
    return path.split("\\").join("/").replace(/\/+/g, "/");
}