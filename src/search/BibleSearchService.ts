import type { WorkspaceLeaf, View } from "obsidian";
import type { BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import { getBookIdsInTranslationOrder } from "../application/BiblePreviewContentBuilder";
import type { PluginContext } from "../core/PluginContext";
import type { BibleIndexData } from "../infrastructure/bible-index/BibleIndexData";
import type { CompactVerseData } from "../infrastructure/bible-index/CompactBibleBookData";
import { BIBLE_PREVIEW_VIEW_TYPE } from "../ui/BiblePreviewPaneView";
import { BIBLE_SEARCH_VIEW_TYPE, BibleSearchView, type BibleSearchViewInput } from "../ui/BibleSearchView";
import { detachDuplicateWorkspaceLeavesOfType, getFirstWorkspaceLeafOfType, revealLeafWithoutStealingEditorFocus } from "../workspace/BiblePreviewWorkspace";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";
import { createSearchableVerse, parseTextSearchQuery, searchVerses, type SearchableVerse, type TextSearchScope } from "./BibleTextSearch";

export type BibleSearchServiceEffects = {
    openChapter: (target: BibleChapterTarget, translationId: string) => void;
    setSuppressPreviewActiveLeafChange: (value: boolean) => void;
};

export type BibleSearchProgress = { loadedBooks: number; totalBooks: number };

/**
 * Full-text search in the imported translations. A translation's text is read book by book on its first search
 * and kept in memory (normalized) until the translations change; nothing is written to disk.
 */
export class BibleSearchService {
    private readonly loaded = new Map<string, Promise<SearchableVerse[]>>();
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
            openResult: (verse, translationId) => this.effects.openChapter({
                book: verse.book,
                chapter: verse.chapter,
                highlightedRanges: [{ verseStart: verse.verse, verseEnd: verse.verseEnd ?? verse.verse }],
            }, translationId),
        };
    }

    private loadVerses(translationId: string, onProgress?: (progress: BibleSearchProgress) => void): Promise<SearchableVerse[]> {
        const indexData = this.context.indexData;
        // An import, a deletion or a rename gives new index data: the loaded text may be outdated.
        if (indexData !== this.loadedFor) {
            this.loaded.clear();
            this.loadedFor = indexData;
        }
        const cached = this.loaded.get(translationId);
        if (cached !== undefined) return cached;
        const loading = this.readTranslation(translationId, indexData, onProgress);
        this.loaded.set(translationId, loading);
        loading.catch(() => {
            if (this.loaded.get(translationId) === loading) this.loaded.delete(translationId);
        });
        return loading;
    }

    private async readTranslation(translationId: string, indexData: BibleIndexData | null, onProgress?: (progress: BibleSearchProgress) => void): Promise<SearchableVerse[]> {
        const translation = indexData?.translations[translationId];
        const readBook = this.context.bibleIndex.readBook;
        if (translation === undefined || readBook === undefined) return [];
        const bookIds = getBookIdsInTranslationOrder(Object.keys(translation.books).map(Number).filter(Number.isInteger), translation.bookOrder);
        const verses: SearchableVerse[] = [];
        for (const [index, bookId] of bookIds.entries()) {
            onProgress?.({ loadedBooks: index, totalBooks: bookIds.length });
            const book = await readBook.call(this.context.bibleIndex, translationId, bookId);
            book?.chapters.forEach((chapter, chapterNumber) => {
                chapter?.forEach((compactVerse, verseNumber) => {
                    if (compactVerse === null || verseNumber === 0) return;
                    verses.push(createSearchableVerse({ book: bookId, chapter: chapterNumber, verse: verseNumber, ...readVerse(compactVerse) }));
                });
            });
            // Lets the interface breathe between books on a phone.
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
