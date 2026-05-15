import { BibleIndexRepository } from "./BibleIndexRepository";
import { JsonBibleIndexRepository } from "./JsonBibleIndexRepository";
import { mockBibleIndexData } from "./mockBibleIndex";

export function createMockBibleIndexRepository(): BibleIndexRepository {
    return new JsonBibleIndexRepository(mockBibleIndexData);
}
