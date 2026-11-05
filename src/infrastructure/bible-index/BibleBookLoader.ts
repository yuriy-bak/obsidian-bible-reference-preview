import { CompactBibleBookData } from "./CompactBibleBookData";

export type BibleBookLoader = {
    loadBook: (translationId: string, bookId: number) => Promise<CompactBibleBookData | null>;
};
