import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/formatBibleTexts";
import type { I18nKey } from "../i18n/I18n";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import type { BiblePreviewPaneViewInput } from "./BiblePreviewPaneView";
import type { FloatingBiblePreviewWindowInput } from "./FloatingBiblePreviewWindow";

type TranslateParams = Record<string, string | number>;

export type BiblePreviewViewInputFactoryInput = {
    getActiveTranslationPreviewTitle: () => string;
    translate: (key: I18nKey, params?: TranslateParams) => string;
    getFloatingPreviewBackgroundColor: () => string;
    isPreviewComparisonEnabled: () => boolean;
    getPreviewComparisonTranslationOptions: () => PreviewComparisonTranslationOption[];
    showReferenceUsagesForPreviewBlock: (target: BiblePreviewUsageTarget) => void;
    getChapterUsageCount: (location: BibleChapterLocation) => number | null;
    showReferenceUsagesForChapter: (location: BibleChapterLocation, title: string) => void;
    setComparisonTranslationEnabled: (translationId: string, enabled: boolean) => void;
    toggleBiblePreviewComparison: (content: BiblePreviewContent) => void;
    switchBiblePreviewToPanel: (content: BiblePreviewContent) => void;
    switchBiblePreviewToFloating: (content: BiblePreviewContent) => void;
    openBiblePreviewChapter: (target: BibleChapterTarget, returnContent: BiblePreviewContent, returnScrollTop: number) => void;
    navigateBiblePreviewChapter: (location: BibleChapterLocation) => void;
    backFromBiblePreviewChapter: () => void;
    isBiblePreviewChapterHighlightHidden: () => boolean;
    setBiblePreviewChapterHighlightHidden: (hidden: boolean) => void;
};

function createCommonPreviewInput(input: BiblePreviewViewInputFactoryInput) {
    return {
        getTitle: () => `📖 ${input.getActiveTranslationPreviewTitle()}`,
        getCopyNoticeText: () => input.translate("notice.bibleTextCopied"),
        getCopyAria: () => input.translate("preview.copyAria"),
        getFindUsagesButtonText: () => input.translate("preview.findUsagesIcon"),
        getFindUsagesButtonAria: (target: BiblePreviewUsageTarget) => input.translate("preview.findUsagesAria", { reference: target.title }),
        onFindUsages: (target: BiblePreviewUsageTarget) => input.showReferenceUsagesForPreviewBlock(target),
        getComparisonButtonText: () => input.isPreviewComparisonEnabled() ? "1" : "⇄",
        getComparisonButtonAria: () => input.isPreviewComparisonEnabled()
            ? input.translate("preview.comparisonOffAria")
            : input.translate("preview.comparisonOnAria"),
        getComparisonTranslationsTitle: () => input.translate("preview.comparisonTranslationsTitle"),
        getComparisonTranslations: () => input.isPreviewComparisonEnabled() ? input.getPreviewComparisonTranslationOptions() : [],
        onToggleComparisonTranslation: (translationId: string, enabled: boolean) => input.setComparisonTranslationEnabled(translationId, enabled),
        onToggleComparison: (content: BiblePreviewContent) => input.toggleBiblePreviewComparison(content),
        getOpenChapterAria: (title: string) => input.translate("preview.openChapterAria", { reference: title }),
        onOpenChapter: (target: BibleChapterTarget, returnContent: BiblePreviewContent, returnScrollTop: number) =>
            input.openBiblePreviewChapter(target, returnContent, returnScrollTop),
        getChapterNavigationLabels: () => ({
            back: input.translate("preview.chapterBack"),
            backAria: input.translate("preview.chapterBackAria"),
            previousAria: input.translate("preview.previousChapterAria"),
            nextAria: input.translate("preview.nextChapterAria"),
            hideHighlightAria: input.translate("preview.hideChapterHighlightAria"),
            showHighlightAria: input.translate("preview.showChapterHighlightAria"),
        }),
        onNavigateChapter: (location: BibleChapterLocation) => input.navigateBiblePreviewChapter(location),
        onBackFromChapter: () => input.backFromBiblePreviewChapter(),
        isChapterHighlightHidden: () => input.isBiblePreviewChapterHighlightHidden(),
        onToggleChapterHighlight: (hidden: boolean) => input.setBiblePreviewChapterHighlightHidden(hidden),
        getChapterUsageCount: (location: BibleChapterLocation) => input.getChapterUsageCount(location),
        getFindChapterUsagesAria: (title: string) => input.translate("preview.findChapterUsagesAria", { reference: title }),
        onFindChapterUsages: (location: BibleChapterLocation, title: string) => input.showReferenceUsagesForChapter(location, title),
    };
}

export function createFloatingBiblePreviewWindowInput(input: BiblePreviewViewInputFactoryInput): FloatingBiblePreviewWindowInput {
    return {
        ...createCommonPreviewInput(input),
        getCollapseAria: () => input.translate("preview.collapseAria"),
        getExpandAria: () => input.translate("preview.expandAria"),
        getBackgroundColor: () => input.getFloatingPreviewBackgroundColor(),
        getCloseAria: () => input.translate("preview.closeAria"),
        getOpenInPanelAria: () => input.translate("preview.openInPanelAria"),
        getOpenInPanelIcon: () => input.translate("preview.openInPanelIcon"),
        onOpenInPanel: (content) => input.switchBiblePreviewToPanel(content),
    };
}

export function createBiblePreviewPaneViewInput(input: BiblePreviewViewInputFactoryInput): BiblePreviewPaneViewInput {
    return {
        ...createCommonPreviewInput(input),
        getOpenFloatingAria: () => input.translate("preview.openFloatingAria"),
        getOpenFloatingIcon: () => input.translate("preview.openFloatingIcon"),
        getCopyIcon: () => input.translate("preview.copyIcon"),
        onOpenFloating: (content) => input.switchBiblePreviewToFloating(content),
    };
}
