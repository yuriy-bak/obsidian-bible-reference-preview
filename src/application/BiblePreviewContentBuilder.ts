import type { PluginContext } from "../core/PluginContext";
import { createBookMappingFromBibleIndexV2Data } from "../infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { TranslationController } from "../translations/TranslationController";
import type { TranslationService } from "../translations/TranslationService";
import { BiblePreviewAnalyzer } from "./BiblePreviewAnalyzer";
import type { BibleChapterTarget } from "./BibleChapterNavigation";
import { getBibleChapterTextBlock, getBibleTextBlocks } from "./getBibleTexts";
import { type BiblePreviewContent, formatBibleComparisonTextBlocks, formatBibleTextBlocks } from "./BiblePreviewModel";
import { mapBibleReferences } from "./mapBibleReferences";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
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

    buildChapter(target: BibleChapterTarget): Promise<BiblePreviewContent | null> {
        return this.createAnalyzer().buildChapterContent(target);
    }

    private createAnalyzer(): BiblePreviewAnalyzer {
        const context = this.context;
        const bibleIndex = context.bibleIndex;
        const bookMapping = context.bookMapping;
        const v2Data = context.v2Data;
        const translationState = this.translations.getControllerState();
        return new BiblePreviewAnalyzer({
            hasImportedTranslations: () => context.hasImportedTranslations(),
            getActiveTranslationId: () => context.activeTranslationId,
            isPreviewComparisonEnabled: () => context.settings.previewComparisonEnabled,
            parseMatches: (text) => context.parseMatches(text),
            getBibleTextBlocks: (references, translationId, sourceText) => getBibleTextBlocks(references, bibleIndex, translationId, sourceText),
            formatBibleTextBlocks: (blocks) => formatBibleTextBlocks(blocks, bookMapping, context.t("preview.missingVerse")),
            formatBibleComparisonTextBlocks: (inputs) => formatBibleComparisonTextBlocks(inputs, context.t("preview.missingVerse")),
            getComparisonTranslationIds: () => TranslationController.getComparisonTranslationIds(translationState),
            getTranslationPreviewTitle: (translationId) => TranslationController.getTranslationPreviewTitle(translationState, translationId),
            getComparisonMapping: (translationId) => v2Data === null
                ? bookMapping
                : createBookMappingFromBibleIndexV2Data(v2Data, translationId),
            mapReferences: (references, fromTranslationId, toTranslationId) => mapBibleReferences(
                references,
                getTranslationVersification(v2Data, fromTranslationId),
                getTranslationVersification(v2Data, toTranslationId),
                getVersificationRegistry(),
            ),
            getBibleChapterTextBlock: (book, chapter, translationId) => getBibleChapterTextBlock(book, chapter, bibleIndex, translationId),
            getBookIds: () => getBookIdsInTranslationOrder(
                [...bookMapping.idToDisplayName.keys()],
                context.activeTranslationId === null ? undefined : v2Data?.translations[context.activeTranslationId]?.bookOrder,
            ),
            getChapterCount: (book) => {
                const activeTranslationId = context.activeTranslationId;
                return activeTranslationId === null
                    ? undefined
                    : v2Data?.translations[activeTranslationId]?.books[String(book)]?.chapterCount;
            },
        });
    }
}

function getTranslationVersification(v2Data: BibleIndexV2Data | null, translationId: string): string {
    return v2Data?.translations[translationId]?.versification ?? DEFAULT_VERSIFICATION_KEY;
}

/** The books in the translation's own order (the Synodal one puts James after Acts); by number without it. */
export function getBookIdsInTranslationOrder(bookIds: number[], bookOrder: number[] | undefined): number[] {
    const known = new Set(bookIds);
    const ordered = (bookOrder ?? []).filter((bookId) => known.has(bookId));
    const rest = bookIds.filter((bookId) => !ordered.includes(bookId)).sort((left, right) => left - right);
    return [...ordered, ...rest];
}
