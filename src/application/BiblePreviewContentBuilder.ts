import type { PluginContext } from "../core/PluginContext";
import { createBookMappingFromBibleIndexData } from "../infrastructure/bible-index/createBookMappingFromBibleIndexData";
import { TranslationController } from "../translations/TranslationController";
import type { TranslationService } from "../translations/TranslationService";
import { BiblePreviewAnalyzer } from "./BiblePreviewAnalyzer";
import type { BibleChapterLocation, BibleChapterTarget } from "./BibleChapterNavigation";
import { getBibleChapterTextBlock, getBibleTextBlocks } from "./getBibleTexts";
import { type BiblePreviewContent, formatBibleComparisonTextBlocks, formatBibleTextBlocks } from "./BiblePreviewModel";
import { mapBibleReferences } from "./mapBibleReferences";
import type { BibleIndexData } from "../infrastructure/bible-index/BibleIndexData";
import type { BibleReference } from "../domain/BibleReference";
import type { BookMapping } from "../parsing/BookMapping";
import { getLanguageBookAliases } from "../parsing/languageBookAliases";
import { createNavigatorBooks, type NavigatorBook } from "./BibleNavigatorModel";
import { DEFAULT_VERSIFICATION_KEY, getVersificationRegistry } from "../versification/VersificationRegistry";

/** Builds preview content from the current Bible data. Each call reads the data anew, so imports and translation changes apply at once. */
export class BiblePreviewContentBuilder {
    constructor(
        private readonly context: PluginContext,
        private readonly translations: TranslationService,
    ) {}

    analyze(text: string): Promise<BiblePreviewContent | null> {
        return this.createAnalyzer().analyzeParagraph(text);
    }

    rebuild(content: BiblePreviewContent): Promise<BiblePreviewContent | null> {
        return this.createAnalyzer().rebuildContent(content);
    }

    /** A whole chapter of one translation (the Bible reader), without compared translations. */
    buildChapter(target: BibleChapterTarget, translationId: string): Promise<BiblePreviewContent | null> {
        return this.createAnalyzer().buildChapterContent(target, translationId);
    }

    hasTranslation(translationId: string): boolean {
        return this.context.indexData?.translations[translationId] !== undefined;
    }

    /** The translation's books for the reader's navigator, in its order. */
    getNavigatorBooks(translationId: string): NavigatorBook[] {
        const translation = this.context.indexData?.translations[translationId];
        if (translation === undefined) return [];
        const sources = Object.entries(translation.books)
            .map(([id, book]) => ({
                id: Number(id),
                name: book.name,
                abbreviation: book.abbreviation,
                aliases: [
                    ...book.aliases,
                    ...getLanguageBookAliases(translation.language, Number(id)),
                    ...(this.context.settings.bookAliases[translationId]?.[id] ?? []),
                ],
                ...(book.chapterCount === undefined ? {} : { chapterCount: book.chapterCount }),
            }))
            .filter((book) => Number.isInteger(book.id) && book.id > 0);
        return createNavigatorBooks(sources, translation.bookOrder ?? []);
    }

    /**
     * The chapter and its highlighted verses in another translation's numbering; highlights that fall into
     * another chapter there are dropped.
     */
    mapChapterTarget(target: BibleChapterTarget, fromTranslationId: string, toTranslationId: string): BibleChapterTarget {
        const location = this.mapChapterLocation(target, fromTranslationId, toTranslationId);
        const highlightedRanges = this.mapReferences(target.highlightedRanges.map((range) => ({
            book: target.book,
            chapterStart: target.chapter,
            verseStart: range.verseStart,
            chapterEnd: target.chapter,
            verseEnd: range.verseEnd ?? range.verseStart,
        })), fromTranslationId, toTranslationId)
            .filter((reference) => reference.book === location.book && reference.chapterStart === location.chapter)
            .map((reference) => ({
                verseStart: reference.verseStart,
                verseEnd: reference.chapterEnd === location.chapter ? reference.verseEnd : undefined,
            }));
        return { ...location, highlightedRanges };
    }

    /** The references in another translation's numbering; the same array when both use the same scheme. */
    mapReferences(references: BibleReference[], fromTranslationId: string, toTranslationId: string): BibleReference[] {
        const indexData = this.context.indexData;
        return mapBibleReferences(
            references,
            getTranslationVersification(indexData, fromTranslationId),
            getTranslationVersification(indexData, toTranslationId),
            getVersificationRegistry(),
        );
    }

    /** The chapter in another translation's numbering, by its first verse (Ps 22 of the Synodal numbering is Ps 23 in English). */
    mapChapterLocation(location: BibleChapterLocation, fromTranslationId: string, toTranslationId: string): BibleChapterLocation {
        const [mapped] = this.mapReferences(
            [{ book: location.book, chapterStart: location.chapter, verseStart: 1, chapterEnd: location.chapter, verseEnd: 1 }],
            fromTranslationId,
            toTranslationId,
        );
        return mapped === undefined ? location : { book: mapped.book, chapter: mapped.chapterStart };
    }

    private createAnalyzer(): BiblePreviewAnalyzer {
        const context = this.context;
        const bibleIndex = context.bibleIndex;
        const bookMapping = context.bookMapping;
        const indexData = context.indexData;
        const translationState = this.translations.getControllerState();
        return new BiblePreviewAnalyzer({
            hasImportedTranslations: () => context.hasImportedTranslations(),
            getActiveTranslationId: () => context.activeTranslationId,
            isPreviewComparisonEnabled: () => context.settings.previewComparisonEnabled,
            parseMatches: (text) => context.parseMatches(text),
            getBibleTextBlocks: (references, translationId, sourceText) => getBibleTextBlocks(references, bibleIndex, translationId, sourceText),
            formatBibleTextBlocks: (blocks, mapping) => formatBibleTextBlocks(blocks, mapping ?? bookMapping, context.t("preview.missingVerse")),
            formatBibleComparisonTextBlocks: (inputs) => formatBibleComparisonTextBlocks(inputs, context.t("preview.missingVerse")),
            getComparisonTranslationIds: () => TranslationController.getComparisonTranslationIds(translationState),
            getTranslationPreviewTitle: (translationId) => TranslationController.getTranslationPreviewTitle(translationState, translationId),
            getComparisonMapping: (translationId) => indexData === null
                ? bookMapping
                : createBookMappingFromBibleIndexData(indexData, translationId),
            mapReferences: (references, fromTranslationId, toTranslationId) => mapBibleReferences(
                references,
                getTranslationVersification(indexData, fromTranslationId),
                getTranslationVersification(indexData, toTranslationId),
                getVersificationRegistry(),
            ),
            getBibleChapterTextBlock: (book, chapter, translationId) => getBibleChapterTextBlock(book, chapter, bibleIndex, translationId),
            getBookIds: (translationId) => getTranslationBookIds(indexData, translationId, bookMapping),
            getChapterCount: (book, translationId) => indexData?.translations[translationId]?.books[String(book)]?.chapterCount,
        });
    }
}

/** The translation's books in its order; the active translation's books for old data without books. */
function getTranslationBookIds(indexData: BibleIndexData | null, translationId: string, activeMapping: BookMapping): number[] {
    const translation = indexData?.translations[translationId];
    const bookIds = translation === undefined
        ? [...activeMapping.idToDisplayName.keys()]
        : Object.keys(translation.books).map(Number).filter(Number.isInteger);
    return getBookIdsInTranslationOrder(bookIds, translation?.bookOrder);
}

function getTranslationVersification(indexData: BibleIndexData | null, translationId: string): string {
    return indexData?.translations[translationId]?.versification ?? DEFAULT_VERSIFICATION_KEY;
}

/** The books in the translation's own order (the Synodal one puts James after Acts); by number without it. */
export function getBookIdsInTranslationOrder(bookIds: number[], bookOrder: number[] | undefined): number[] {
    const known = new Set(bookIds);
    const ordered = (bookOrder ?? []).filter((bookId) => known.has(bookId));
    const rest = bookIds.filter((bookId) => !ordered.includes(bookId)).sort((left, right) => left - right);
    return [...ordered, ...rest];
}
