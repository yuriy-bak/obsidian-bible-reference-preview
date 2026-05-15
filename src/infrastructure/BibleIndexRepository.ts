import { BibleIndex } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";

export type BibleIndexRepository = {
    getIndex(): BibleIndex;
};

export type WritableBibleIndexRepository = BibleIndexRepository & {
    save(data: BibleIndexData): Promise<void>;
};