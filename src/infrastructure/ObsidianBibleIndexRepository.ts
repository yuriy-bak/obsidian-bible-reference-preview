import type { DataAdapter } from "obsidian";
import { BibleIndex } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";
import { BibleIndexRepository } from "./BibleIndexRepository";
import { InMemoryBibleIndex } from "./InMemoryBibleIndex";
import { mockBibleIndexData } from "./mockBibleIndex";

const BIBLE_INDEX_FILE_NAME = "bible-index.json";

export class ObsidianBibleIndexRepository implements BibleIndexRepository {
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

    getIndex(): BibleIndex {
        return new InMemoryBibleIndex(this.currentData);
    }

    getIndexPath(): string {
        return normalizePath(`${this.dataDirectoryPath}/${BIBLE_INDEX_FILE_NAME}`);
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
