import type { WorkspaceLeaf, View } from "obsidian";
import type { BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import { getBookIdsInTranslationOrder } from "../application/BiblePreviewContentBuilder";
import type { PluginContext } from "../core/PluginContext";
import type { BibleIndexData } from "../infrastructure/bible-index/BibleIndexData";
import type { CompactVerseData } from "../infrastructure/bible-index/CompactBibleBookData";
import { BIBLE_PREVIEW_VIEW_TYPE } from "../ui/BiblePreviewPaneView";
import { BIBLE_SEARCH_VIEW_TYPE, BibleSearchView, type BibleSearchViewInput } from "../ui/BibleSearchView";
import { detachDuplicateWorkspaceLeavesOfType, getFirstWorkspaceLeafOfType, getSideDockForLeaf, revealLeafWithoutStealingEditorFocus } from "../workspace/BiblePreviewWorkspace";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";
import { createSearchableVerse, parseTextSearchQuery, searchVerses, type SearchableVerse, type TextSearchScope } from "./BibleTextSearch";

export type BibleSearchServiceEffects = {
    /** Resolves to where the chapter opened: "below" for the reader under the note on a phone. */
    openChapter: (target: BibleChapterTarget, translationId: string) => Promise<"below" | "tab">;
    setSuppressPreviewActiveLeafChange: (value: boolean) => void;
};

const BOOKS_READ_AT_ONCE = 6;

export type BibleSearchProgress = { loadedBooks: number; totalBooks: number };

/**
 * Full-text search in the imported translations. A translation's text is read book by book on its first search
 * and kept in memory (normalized) until the translations change; nothing is written to disk.
 */
export class BibleSearchService {
    private readonly loaded = new Map<string, Promise<SearchableVerse[]>>();
    /** Who waits for a translation still being read: a search started during the preload shows its progress too. */
    private readonly progressListeners = new Map<string, Set<(progress: BibleSearchProgress) => void>>();
    private readonly lastProgress = new Map<string, BibleSearchProgress>();
    private loadedFor: BibleIndexData | null = null;

    constructor(
        private readonly context: PluginContext,
        private readonly contentBuilder: BiblePreviewContentBuilder,
        private readonly effects: BibleSearchServiceEffects,
    ) {}

    async search(query: string, translationId: string, scope: TextSearchScope, onProgress?: (progress: BibleSearchProgress) => void): Promise<SearchableVerse[]> {
        const terms = parseTextSearchQuery(query);
        if (terms.length === 0) return [];
        return searchVerses(await this.loadVerses(translationId, onProgress), terms, scope);
    }

    /** Opens the search panel, with a query to run (from the reader's navigator) and the translation to search. */
    async openPanel(options: { query?: string; translationId?: string } = {}): Promise<void> {
        const view = await this.getOrCreateView();
        if (view === null) return;
        view.refreshInput(this.createViewInput());
        view.start(options.query, options.translationId);
        // The text is read while the query is typed, so the first search does not wait for all of it.
        const translationId = options.translationId ?? this.context.activeTranslationId;
        if (translationId !== null && this.contentBuilder.hasTranslation(translationId)) void this.loadVerses(translationId).catch(() => undefined);
    }

    createViewInput(): BibleSearchViewInput {
        const t = this.context.t.bind(this.context);
        return {
            getLabels: () => ({
                title: t("search.title"),
                placeholder: t("search.placeholder"),
                hint: t("search.hint"),
                translationAria: t("search.translationAria"),
                scopeAria: t("search.scopeAria"),
                scopeAll: t("search.scope.all"),
                scopeOld: t("search.scope.old"),
                scopeNew: t("search.scope.new"),
                empty: t("search.empty"),
                showMore: t("search.showMore"),
                count: (count) => t("search.count", { count }),
                loading: (progress) => t("search.loading", { loaded: progress.loadedBooks, total: progress.totalBooks }),
            }),
            getTranslations: () => this.context.settings.translationOrder
                .filter((translationId) => this.contentBuilder.hasTranslation(translationId))
                .map((translationId) => ({ id: translationId, name: this.context.indexData?.translations[translationId]?.name ?? translationId })),
            getDefaultTranslationId: () => this.context.activeTranslationId,
            getBooks: (translationId) => this.contentBuilder.getNavigatorBooks(translationId),
            search: (query, translationId, scope, onProgress) => this.search(query, translationId, scope, onProgress),
            openResult: (verse, translationId) => void this.openResult({
                book: verse.book,
                chapter: verse.chapter,
                highlightedRanges: [{ verseStart: verse.verse, verseEnd: verse.verseEnd ?? verse.verse }],
            }, translationId),
        };
    }

    private async openResult(target: BibleChapterTarget, translationId: string): Promise<void> {
        const openedIn = await this.effects.openChapter(target, translationId);
        // On a phone the chapter opens under the note, which the panel's drawer covers.
        if (openedIn === "below") this.hidePanelDrawer();
    }

    private hidePanelDrawer(): void {
        const leaf = getFirstWorkspaceLeafOfType(this.context.app, BIBLE_SEARCH_VIEW_TYPE);
        if (leaf === null) return;
        const sideDock = getSideDockForLeaf(this.context.app, leaf, this.context.settings.previewPanelSide, BIBLE_PREVIEW_VIEW_TYPE);
        if (sideDock === undefined || sideDock.collapsed === true || typeof sideDock.collapse !== "function") return;
        sideDock.collapse();
    }

    private loadVerses(translationId: string, onProgress?: (progress: BibleSearchProgress) => void): Promise<SearchableVerse[]> {
        const indexData = this.context.indexData;
        // An import, a deletion or a rename gives new index data: the loaded text may be outdated.
        if (indexData !== this.loadedFor) {
            this.loaded.clear();
            this.loadedFor = indexData;
        }
        const cached = this.loaded.get(translationId);
        if (cached !== undefined) {
            this.listenToProgress(translationId, cached, onProgress);
            return cached;
        }
        const listeners = new Set<(progress: BibleSearchProgress) => void>();
        this.progressListeners.set(translationId, listeners);
        const loading = this.readTranslation(translationId, indexData, (progress) => {
            this.lastProgress.set(translationId, progress);
            for (const listener of listeners) listener(progress);
        });
        this.loaded.set(translationId, loading);
        this.listenToProgress(translationId, loading, onProgress);
        const finish = (): void => {
            if (this.progressListeners.get(translationId) === listeners) {
                this.progressListeners.delete(translationId);
                this.lastProgress.delete(translationId);
            }
        };
        loading.then(finish, () => {
            finish();
            if (this.loaded.get(translationId) === loading) this.loaded.delete(translationId);
        });
        return loading;
    }

    private listenToProgress(translationId: string, loading: Promise<SearchableVerse[]>, onProgress?: (progress: BibleSearchProgress) => void): void {
        const listeners = this.progressListeners.get(translationId);
        if (onProgress === undefined || listeners === undefined) return;
        listeners.add(onProgress);
        const last = this.lastProgress.get(translationId);
        if (last !== undefined) onProgress(last);
        const remove = (): void => {
            listeners.delete(onProgress);
        };
        loading.then(remove, remove);
    }

    private async readTranslation(translationId: string, indexData: BibleIndexData | null, onProgress?: (progress: BibleSearchProgress) => void): Promise<SearchableVerse[]> {
        const translation = indexData?.translations[translationId];
        const readBook = this.context.bibleIndex.readBook;
        if (translation === undefined || readBook === undefined) return [];
        const bookIds = getBookIdsInTranslationOrder(Object.keys(translation.books).map(Number).filter(Number.isInteger), translation.bookOrder);
        const verses: SearchableVerse[] = [];
        // A few books are read at once: on a phone the file reads, not the text, take most of the time.
        for (let start = 0; start < bookIds.length; start += BOOKS_READ_AT_ONCE) {
            onProgress?.({ loadedBooks: start, totalBooks: bookIds.length });
            const batch = bookIds.slice(start, start + BOOKS_READ_AT_ONCE);
            const books = await Promise.all(batch.map((bookId) => readBook.call(this.context.bibleIndex, translationId, bookId)));
            books.forEach((book, index) => {
                const bookId = batch[index];
                book?.chapters.forEach((chapter, chapterNumber) => {
                    chapter?.forEach((compactVerse, verseNumber) => {
                        if (compactVerse === null || verseNumber === 0) return;
                        verses.push(createSearchableVerse({ book: bookId, chapter: chapterNumber, verse: verseNumber, ...readVerse(compactVerse) }));
                    });
                });
            });
            // Lets the interface breathe between batches on a phone.
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        onProgress?.({ loadedBooks: bookIds.length, totalBooks: bookIds.length });
        return verses;
    }

    private async getOrCreateView(): Promise<BibleSearchView | null> {
        const app = this.context.app;
        const existingLeaf = getFirstWorkspaceLeafOfType(app, BIBLE_SEARCH_VIEW_TYPE);
        if (existingLeaf !== null) {
            const existingView = await ensureLeafViewLoaded({ leaf: existingLeaf, viewType: BIBLE_SEARCH_VIEW_TYPE, active: true, isExpectedView: isBibleSearchView });
            if (existingView !== null) {
                await this.revealLeaf(existingLeaf);
                await detachDuplicateWorkspaceLeavesOfType(app, BIBLE_SEARCH_VIEW_TYPE, existingLeaf);
                return existingView;
            }
        }
        const leaf = app.workspace.getRightLeaf(false);
        if (leaf === null) return null;
        await leaf.setViewState({ type: BIBLE_SEARCH_VIEW_TYPE, active: true });
        await this.revealLeaf(leaf);
        await detachDuplicateWorkspaceLeavesOfType(app, BIBLE_SEARCH_VIEW_TYPE, leaf);
        return isBibleSearchView(leaf.view) ? leaf.view : null;
    }

    private async revealLeaf(leaf: WorkspaceLeaf): Promise<void> {
        await revealLeafWithoutStealingEditorFocus({
            app: this.context.app,
            leaf,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: this.context.settings.previewPanelSide,
            restoreActiveLeaf: null,
            focus: true,
            isMobile: this.context.isMobile,
            setSuppressPreviewActiveLeafChange: (value) => this.effects.setSuppressPreviewActiveLeafChange(value),
        });
    }
}

function readVerse(compactVerse: CompactVerseData): { text: string; verseEnd?: number } {
    if (typeof compactVerse === "string") return { text: compactVerse };
    if (Array.isArray(compactVerse)) return { text: compactVerse[0] };
    return compactVerse.verseEnd === undefined ? { text: compactVerse.text } : { text: compactVerse.text, verseEnd: compactVerse.verseEnd };
}

function isBibleSearchView(view: View): view is BibleSearchView {
    return view instanceof BibleSearchView;
}
