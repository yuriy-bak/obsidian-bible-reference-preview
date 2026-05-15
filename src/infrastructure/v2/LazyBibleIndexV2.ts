import { BibleIndex, GetBibleTextInput } from "../BibleIndex";
import { BibleText } from "../../domain/BibleText";
import { BibleBookV2Loader } from "./BibleBookV2Loader";
import { BibleIndexV2Data } from "./BibleIndexV2Data";
import { CompactBibleBookData } from "./CompactBibleBookData";
import { extractBibleTextFromCompactBook } from "./extractBibleTextFromCompactBook";

export class LazyBibleIndexV2 implements BibleIndex {
    private readonly bookCache = new Map<string, CompactBibleBookData>();

    constructor(private readonly metadata: BibleIndexV2Data, private readonly bookLoader: BibleBookV2Loader) {}

    async getBibleText(input: GetBibleTextInput): Promise<BibleText | null> {
        const book = await this.getBook(input.translationId, input.book);
        return book === null ? null : extractBibleTextFromCompactBook(this.metadata, book, input);
    }

    private async getBook(translationId: string, bookId: number): Promise<CompactBibleBookData | null> {
        const cacheKey = `${translationId}:${bookId}`;
        const cached = this.bookCache.get(cacheKey);
        if (cached !== undefined) return cached;
        const loaded = await this.bookLoader.loadBook(translationId, bookId);
        if (loaded === null) return null;
        this.bookCache.set(cacheKey, loaded);
        return loaded;
    }
}
