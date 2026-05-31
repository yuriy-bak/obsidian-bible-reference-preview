import type { BiblePreviewContent, BiblePreviewReferenceBlock } from "../application/formatBibleTexts";
import type { I18nKey } from "../i18n/I18n";
import type { PreviewComparisonTranslationOption } from "../translations/TranslationModels";
import type { BiblePreviewPaneViewInput } from "./BiblePreviewPaneView";
import type { FloatingBiblePreviewWindowInput } from "./FloatingBiblePreviewWindow";

type TranslateParams = Record<string, string | number>;

export type BiblePreviewViewInputFactoryInput = {
    getActiveTranslationPreviewTitle(): string;
    translate(key: I18nKey, params?: TranslateParams): string;
    getFloatingPreviewBackgroundColor(): string;
    isPreviewComparisonEnabled(): boolean;
    getPreviewComparisonTranslationOptions(): PreviewComparisonTranslationOption[];
    showReferenceUsagesForPreviewBlock(block: BiblePreviewReferenceBlock): void;
    setComparisonTranslationEnabled(translationId: string, enabled: boolean): void;
    toggleBiblePreviewComparison(content: BiblePreviewContent): void;
    switchBiblePreviewToPanel(content: BiblePreviewContent): void;
    switchBiblePreviewToFloating(content: BiblePreviewContent): void;
};

function createCommonPreviewInput(input: BiblePreviewViewInputFactoryInput) {
    return {
        getTitle: () => `📖 ${input.getActiveTranslationPreviewTitle()}`,
        getCopyNoticeText: () => input.translate("notice.bibleTextCopied"),
        getCopyAria: () => input.translate("preview.copyAria"),
        getFindUsagesButtonText: () => input.translate("preview.findUsagesIcon"),
        getFindUsagesButtonAria: (block: BiblePreviewReferenceBlock) => input.translate("preview.findUsagesAria", { reference: block.title }),
        onFindUsages: (block: BiblePreviewReferenceBlock) => input.showReferenceUsagesForPreviewBlock(block),
        getComparisonButtonText: () => input.isPreviewComparisonEnabled() ? "1" : "⇄",
        getComparisonButtonAria: () => input.isPreviewComparisonEnabled()
            ? input.translate("preview.comparisonOffAria")
            : input.translate("preview.comparisonOnAria"),
        getComparisonTranslationsTitle: () => input.translate("preview.comparisonTranslationsTitle"),
        getComparisonTranslations: () => input.isPreviewComparisonEnabled() ? input.getPreviewComparisonTranslationOptions() : [],
        onToggleComparisonTranslation: (translationId: string, enabled: boolean) => input.setComparisonTranslationEnabled(translationId, enabled),
        onToggleComparison: (content: BiblePreviewContent) => input.toggleBiblePreviewComparison(content),
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
