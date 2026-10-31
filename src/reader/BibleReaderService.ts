import type { WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import type { ReferenceUsageReturnPoint } from "../reference-usage/ReferenceUsageService";
import type { SettingsService } from "../settings/SettingsService";
import { TranslationController } from "../translations/TranslationController";
import type { TranslationService } from "../translations/TranslationService";
import type { BiblePreviewScrollCommand } from "../ui/BiblePreviewHeader";
import { BIBLE_READER_VIEW_TYPE, BibleReaderView, type BibleReaderOpenState, type BibleReaderViewInput } from "../ui/BibleReaderView";
import { getWorkspaceLeavesOfType } from "../workspace/BiblePreviewWorkspace";

/** What the reader needs from the preview and the reference usages. */
export type BibleReaderServiceEffects = {
    revealPreview: () => void;
    refreshPreview: () => void;
    showUsagesForPreviewBlock: (target: BiblePreviewUsageTarget, returnPoint: ReferenceUsageReturnPoint) => void;
    getChapterUsageCount: (location: BibleChapterLocation) => number | null;
    showUsagesForChapter: (location: BibleChapterLocation, title: string, returnPoint: ReferenceUsageReturnPoint) => void;
};

/** Opens and refreshes the "Bible reader" views. */
export class BibleReaderService {
    private lastActiveLeaf: WorkspaceLeaf | null = null;

    constructor(
        private readonly context: PluginContext,
        private readonly settings: SettingsService,
        private readonly translations: TranslationService,
        private readonly contentBuilder: BiblePreviewContentBuilder,
        private readonly effects: BibleReaderServiceEffects,
    ) {}

    /** A chapter from the preview, in the translation it was shown in (the active one without it); in the last reader or a new tab. */
    async openChapter(target: BibleChapterTarget, translationId?: string, options: { newTab?: boolean } = {}): Promise<void> {
        await this.openState({
            book: target.book,
            chapter: target.chapter,
            highlightedRanges: target.highlightedRanges,
            ...(translationId === undefined ? {} : { translationId }),
            fromPreview: true,
        }, options.newTab === true);
    }

    /** The command and the ribbon icon: the last reader, or a new one with the book picker open. */
    async openReader(): Promise<void> {
        const leaf = this.getReaderLeaf();
        if (leaf !== null) {
            await this.context.app.workspace.revealLeaf(leaf);
            this.context.app.workspace.setActiveLeaf(leaf, { focus: true });
            return;
        }
        const activeTranslationId = this.context.activeTranslationId;
        const first = activeTranslationId === null ? null : this.contentBuilder.getFirstChapter(activeTranslationId);
        if (first === null) {
            await this.openState(null);
            return;
        }
        await this.openState({ ...first });
        const view = this.getReaderLeaf()?.view;
        if (view instanceof BibleReaderView) view.openNavigator();
    }

    /** The command "Go to book and chapter": the navigator of the last reader, or of a new one. */
    async openNavigator(): Promise<void> {
        await this.openReader();
        const view = this.getReaderLeaf()?.view;
        if (view instanceof BibleReaderView) view.openNavigator();
    }

    handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        if (leaf?.view instanceof BibleReaderView) this.lastActiveLeaf = leaf;
    }

    async refreshAll(): Promise<void> {
        await Promise.all(this.getViews().map((view) => view.refresh(this.createViewInput())));
    }

    /** Scrolls the reader in the active tab; false when there is none to scroll. */
    scrollActive(command: BiblePreviewScrollCommand): boolean {
        const view = this.context.app.workspace.getActiveViewOfType(BibleReaderView);
        return view?.scrollReader(command) ?? false;
    }

    createViewInput(): BibleReaderViewInput {
        const t = this.context.t.bind(this.context);
        const isComparisonEnabled = (): boolean => this.context.settings.previewComparisonEnabled;
        const translationState = () => this.translations.getControllerState();
        return {
            getViewTitle: () => t("reader.title"),
            getTitle: () => `📖 ${t("reader.title")}`,
            getCopyAria: () => t("preview.copyAria"),
            getCopyNoticeText: () => t("notice.bibleTextCopied"),
            getNoTranslationsText: () => t("notice.noImportedTranslations"),
            isComparisonEnabled,
            getComparisonButtonAria: () => isComparisonEnabled() ? t("preview.comparisonOffAria") : t("preview.comparisonOnAria"),
            getComparisonTranslationsTitle: () => t("preview.comparisonTranslationsTitle"),
            getComparisonTranslations: () => isComparisonEnabled() ? this.translations.getPreviewComparisonTranslationOptions() : [],
            onToggleComparisonTranslation: (translationId, enabled) => void this.translations.setComparisonTranslationEnabled(translationId, enabled),
            onToggleReaderComparison: () => void this.toggleComparison(),
            getActiveTranslationId: () => this.context.activeTranslationId,
            hasTranslation: (translationId) => this.contentBuilder.hasTranslation(translationId),
            getFirstChapter: (translationId) => this.contentBuilder.getFirstChapter(translationId),
            mapChapterLocation: (location, from, to) => this.contentBuilder.mapChapterLocation(location, from, to),
            buildChapter: (target, translationId) => this.contentBuilder.buildChapter(target, translationId),
            getTranslationTitle: (translationId) => TranslationController.getTranslationPreviewTitle(translationState(), translationId),
            getChapterNavigationLabels: () => ({
                back: t("preview.chapterBack"),
                backAria: t("preview.chapterBackAria"),
                previousAria: t("preview.previousChapterAria"),
                nextAria: t("preview.nextChapterAria"),
                hideHighlightAria: t("preview.hideChapterHighlightAria"),
                showHighlightAria: t("preview.showChapterHighlightAria"),
            }),
            getOpenChapterAria: (title) => t("reader.openChapterInTranslationAria", { reference: title }),
            getFindUsagesButtonText: () => t("preview.findUsagesIcon"),
            getFindUsagesButtonAria: (target) => t("preview.findUsagesAria", { reference: target.title }),
            getFindChapterUsagesAria: (title) => t("preview.findChapterUsagesAria", { reference: title }),
            onFindUsages: (target, translationId, leaf) => this.effects.showUsagesForPreviewBlock({
                title: target.title,
                references: this.toActiveReferences(target.references, translationId),
            }, this.createReturnPoint(leaf)),
            getChapterUsageCount: (location, translationId) => this.effects.getChapterUsageCount(this.toActiveLocation(location, translationId)),
            getUsageLocation: (location, translationId) => this.toActiveLocation(location, translationId),
            onFindChapterUsages: (location, title, translationId, leaf) =>
                this.effects.showUsagesForChapter(this.toActiveLocation(location, translationId), title, this.createReturnPoint(leaf)),
            onBack: () => this.effects.revealPreview(),
            mapChapterTarget: (target, from, to) => this.contentBuilder.mapChapterTarget(target, from, to),
            getNavigatorBooks: (translationId) => this.contentBuilder.getNavigatorBooks(translationId),
            getNavigatorLabels: () => ({
                searchPlaceholder: t("reader.navigator.searchPlaceholder"),
                oldTestament: t("reader.navigator.oldTestament"),
                newTestament: t("reader.navigator.newTestament"),
                backToBooks: t("reader.navigator.backToBooks"),
                close: t("reader.navigator.close"),
                noBooks: t("reader.navigator.noBooks"),
            }),
            getOpenNavigatorAria: () => t("reader.navigator.openAria"),
            getTranslationOptions: () => this.translations.getTranslationSettingsItems().map((item) => ({ id: item.id, name: item.name })),
            getTranslationSelectAria: () => t("reader.translationSelectAria"),
        };
    }

    private async openState(state: BibleReaderOpenState | null, newTab = false): Promise<void> {
        const workspace = this.context.app.workspace;
        const leaf = (newTab ? null : this.getReaderLeaf()) ?? workspace.getLeaf("tab");
        await leaf.setViewState({ type: BIBLE_READER_VIEW_TYPE, active: true, state: state ?? {} });
        await workspace.revealLeaf(leaf);
        this.lastActiveLeaf = leaf;
    }

    // The usages panel's back button shows the reader the search started from.
    private createReturnPoint(leaf: WorkspaceLeaf): ReferenceUsageReturnPoint {
        return {
            kind: "chapter",
            run: () => {
                if (!getWorkspaceLeavesOfType(this.context.app, BIBLE_READER_VIEW_TYPE).includes(leaf)) return;
                void this.context.app.workspace.revealLeaf(leaf);
                this.context.app.workspace.setActiveLeaf(leaf, { focus: true });
            },
        };
    }

    private async toggleComparison(): Promise<void> {
        await this.settings.setPreviewComparisonEnabled(!this.settings.isPreviewComparisonEnabled());
        await this.refreshAll();
        this.effects.refreshPreview();
    }

    private getReaderLeaf(): WorkspaceLeaf | null {
        const leaves = getWorkspaceLeavesOfType(this.context.app, BIBLE_READER_VIEW_TYPE);
        const last = this.lastActiveLeaf;
        if (last !== null && leaves.includes(last)) return last;
        return leaves[0] ?? null;
    }

    private getViews(): BibleReaderView[] {
        return getWorkspaceLeavesOfType(this.context.app, BIBLE_READER_VIEW_TYPE)
            .map((leaf) => leaf.view)
            .filter((view): view is BibleReaderView => view instanceof BibleReaderView);
    }

    // The reference usage index follows the active translation's numbering.
    private toActiveLocation(location: BibleChapterLocation, translationId: string): BibleChapterLocation {
        const activeTranslationId = this.context.activeTranslationId;
        return activeTranslationId === null || activeTranslationId === translationId
            ? location
            : this.contentBuilder.mapChapterLocation(location, translationId, activeTranslationId);
    }

    private toActiveReferences(references: BiblePreviewUsageTarget["references"], translationId: string): BiblePreviewUsageTarget["references"] {
        const activeTranslationId = this.context.activeTranslationId;
        return activeTranslationId === null || activeTranslationId === translationId
            ? references
            : this.contentBuilder.mapReferences(references, translationId, activeTranslationId);
    }
}
