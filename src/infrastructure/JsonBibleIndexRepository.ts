import { BibleIndex } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";
import { BibleIndexRepository } from "./BibleIndexRepository";
import { InMemoryBibleIndex } from "./InMemoryBibleIndex";

export class JsonBibleIndexRepository implements BibleIndexRepository {
    constructor(private readonly data: BibleIndexData) {}

    getIndex(): BibleIndex {
        return new InMemoryBibleIndex(this.data);
    }
}
