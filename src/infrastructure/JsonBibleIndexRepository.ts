import { BibleIndex } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";
import { WritableBibleIndexRepository } from "./BibleIndexRepository";
import { InMemoryBibleIndex } from "./InMemoryBibleIndex";

export class JsonBibleIndexRepository implements WritableBibleIndexRepository {
    constructor(private data: BibleIndexData) {}

    async save(data: BibleIndexData): Promise<void> {
        this.data = data;
    }

    getIndex(): BibleIndex {
        return new InMemoryBibleIndex(this.data);
    }
}
