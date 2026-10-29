import { BibleIndex, GetBibleTextInput } from "../BibleIndex";
import { BibleText } from "../../domain/BibleText";
import { BibleBookV2Loader } from "./BibleBookV2Loader";
import { BibleIndexV2Data } from "./BibleIndexV2Data";
import { CompactBibleBookData } from "./CompactBibleBookData";
import { extractBibleTextFromCompactBook } from "./extractBibleTextFromCompactBook";

// Enough for the comparison mode with four translations and a few open chapters.
export const LAZY_BIBLE_INDEX_BOOK_CACHE_SIZE = 20;

export class LazyBibleIndexV2 implements BibleIndex {
    // Holds the loading promise, so parallel requests for one book share one read.
    // Map order is the LRU order: a hit moves the book to the end, the first entry is evicted.
    private readonly bookCache = new Map<string, Promise<CompactBibleBookData | null>>();

    constructor(
        private readonly metadata: BibleIndexV2Data,
        private readonly bookLoader: BibleBookV2Loader,
        private readonly bookCacheSize = LAZY_BIBLE_INDEX_BOOK_CACHE_SIZE,
    ) {}

    async getBibleText(input: GetBibleTextInput): Promise<BibleText | null> {
        const book = await this.getBook(input.translationId, input.book);
        return book === null ? null : extractBibleTextFromCompactBook(this.metadata, book, input);
    }

    getChapterCount(translationId: string, book: number): number | undefined {
        return this.metadata.translations[translationId]?.books[String(book)]?.chapterCount;
    }

    private getBook(translationId: string, bookId: number): Promise<CompactBibleBookData | null> {
        const cacheKey = `${translationId}:${bookId}`;
        const cached = this.bookCache.get(cacheKey);
        if (cached !== undefined) {
            this.bookCache.delete(cacheKey);
            this.bookCache.set(cacheKey, cached);
            return cached;
        }

        const loading = this.bookLoader.loadBook(translationId, bookId);
        this.bookCache.set(cacheKey, loading);
        this.evictOldBooks();
        // A missing or failed book is not cached, so the next request tries again.
        const forget = (): void => {
            if (this.bookCache.get(cacheKey) === loading) this.bookCache.delete(cacheKey);
        };
        loading.then((book) => {
            if (book === null) forget();
        }, forget);
        return loading;
    }

    private evictOldBooks(): void {
        while (this.bookCache.size > this.bookCacheSize) {
            const oldestKey = this.bookCache.keys().next().value;
            if (oldestKey === undefined) return;
            this.bookCache.delete(oldestKey);
        }
    }
}
