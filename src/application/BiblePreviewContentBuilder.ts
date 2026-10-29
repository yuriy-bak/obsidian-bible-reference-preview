import type { PluginContext } from "../core/PluginContext";
import { createBookMappingFromBibleIndexV2Data } from "../infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { TranslationController } from "../translations/TranslationController";
import type { TranslationService } from "../translations/TranslationService";
import { BiblePreviewAnalyzer } from "./BiblePreviewAnalyzer";
import type { BibleChapterTarget } from "./BibleChapterNavigation";
import { getBibleChapterTextBlock, getBibleTextBlocks } from "./getBibleTexts";
import { type BiblePreviewContent, formatBibleComparisonTextBlocks, formatBibleTextBlocks } from "./formatBibleTexts";

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
            getBibleChapterTextBlock: (book, chapter, translationId) => getBibleChapterTextBlock(book, chapter, bibleIndex, translationId),
            getBookIds: () => [...bookMapping.idToDisplayName.keys()].sort((left, right) => left - right),
            getChapterCount: (book) => {
                const activeTranslationId = context.activeTranslationId;
                return activeTranslationId === null
                    ? undefined
                    : v2Data?.translations[activeTranslationId]?.books[String(book)]?.chapterCount;
            },
        });
    }
}
