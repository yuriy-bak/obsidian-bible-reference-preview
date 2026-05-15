import { WritableBibleIndexRepository } from "./BibleIndexRepository";
import { JsonBibleIndexRepository } from "./JsonBibleIndexRepository";
import { mockBibleIndexData } from "./mockBibleIndex";

export function createMockBibleIndexRepository(): WritableBibleIndexRepository {
    return new JsonBibleIndexRepository(mockBibleIndexData);
}
