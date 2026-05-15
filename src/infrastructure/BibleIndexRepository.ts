import { BibleIndex } from "./BibleIndex";
import { BibleIndexData } from "./BibleIndexData";

export type BibleIndexRepository = {
    getIndex(): BibleIndex;
    getData(): BibleIndexData;
};

export type WritableBibleIndexRepository = BibleIndexRepository & {
    save(data: BibleIndexData): Promise<void>;
};