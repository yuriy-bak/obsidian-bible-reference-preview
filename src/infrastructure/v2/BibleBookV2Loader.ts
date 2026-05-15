import { CompactBibleBookData } from "./CompactBibleBookData";

export type BibleBookV2Loader = {
    loadBook(translationId: string, bookId: number): Promise<CompactBibleBookData | null>;
};
