import { BibleIndex } from "./BibleIndex";

export type BibleIndexRepository = {
    getIndex(): BibleIndex;
};
