import type { WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import type { ReferenceUsageReturnPoint } from "../reference-usage/ReferenceUsageService";
import type { TranslationService } from "../translations/TranslationService";
import type { BiblePreviewScrollCommand } from "../ui/BiblePreviewHeader";
import { BIBLE_READER_VIEW_TYPE, BibleReaderView, type BibleReaderOpenState, type BibleReaderViewInput } from "../ui/BibleReaderView";
import { getWorkspaceLeavesOfType } from "../workspace/BiblePreviewWorkspace";

/** What the reader needs from the reference usages and the import. */
export type BibleReaderServiceEffects = {
    showUsagesForPreviewBlock: (target: BiblePreviewUsageTarget, returnPoint: ReferenceUsageReturnPoint) => void;
    getChapterUsageCount: (location: BibleChapterLocation) => number | null;
    showUsagesForChapter: (location: BibleChapterLocation, title: string, returnPoint: ReferenceUsageReturnPoint) => void;
    openBibleFilePicker: (hostEl: HTMLElement) => void;
};

/** Opens and refreshes the "Bible reader" views. */
export class BibleReaderService {
    private lastActiveLeaf: WorkspaceLeaf | null = null;

    constructor(
        private readonly context: PluginContext,
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
        }, options.newTab === true);
    }

    /** The command and the ribbon icon: the last reader, or a new one with the book picker open. */
    async openReader(options: { newTab?: boolean } = {}): Promise<void> {
        const leaf = options.newTab === true ? null : this.getReaderLeaf();
        if (leaf !== null) {
            await this.context.app.workspace.revealLeaf(leaf);
            this.context.app.workspace.setActiveLeaf(leaf, { focus: true });
            return;
        }
        // No chapter: the new reader opens the book picker in the active translation.
        await this.openState({}, options.newTab === true);
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
        return {
            getViewTitle: () => t("reader.title"),
            getNewReaderTabText: () => t("command.openBibleReaderNewTab"),
            onOpenNewReaderTab: () => void this.openReader({ newTab: true }),
            getChooseBookText: () => `📖 ${t("reader.chooseBook")}`,
            getCopyAria: () => t("preview.copyAria"),
            getCopyNoticeText: () => t("notice.bibleTextCopied"),
            getNoTranslationsText: () => t("reader.empty"),
            getImportButtonText: () => t("settings.import.button"),
            onImport: (hostEl) => this.effects.openBibleFilePicker(hostEl),
            getOpenSettingsText: () => t("notice.gettingStartedButton"),
            onOpenSettings: () => this.context.openPluginSettings(),
            getHistoryBackAria: () => t("reader.historyBackAria"),
            getHistoryForwardAria: () => t("reader.historyForwardAria"),
            getActiveTranslationId: () => this.context.activeTranslationId,
            hasTranslation: (translationId) => this.contentBuilder.hasTranslation(translationId),
            mapChapterLocation: (location, from, to) => this.contentBuilder.mapChapterLocation(location, from, to),
            buildChapter: (target, translationId) => this.contentBuilder.buildChapter(target, translationId),
            getChapterNavigationLabels: () => ({
                previousAria: t("preview.previousChapterAria"),
                nextAria: t("preview.nextChapterAria"),
                hideHighlightAria: t("preview.hideChapterHighlightAria"),
                showHighlightAria: t("preview.showChapterHighlightAria"),
            }),
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
            mapChapterTarget: (target, from, to) => this.contentBuilder.mapChapterTarget(target, from, to),
            getNavigatorBooks: (translationId) => this.contentBuilder.getNavigatorBooks(translationId),
            getNavigatorLabels: () => ({
                searchPlaceholder: t("reader.navigator.searchPlaceholder"),
                backToBooks: t("reader.navigator.backToBooks"),
                close: t("reader.navigator.close"),
                noBooks: t("reader.navigator.noBooks"),
            }),
            getOpenNavigatorAria: () => t("reader.navigator.openAria"),
            getTranslationOptions: () => this.translations.getTranslationSettingsItems().map((item) => ({ id: item.id, name: item.name })),
            getTranslationSelectAria: () => t("reader.translationSelectAria"),
        };
    }

    private async openState(state: BibleReaderOpenState, newTab = false): Promise<void> {
        const workspace = this.context.app.workspace;
        const leaf = (newTab ? null : this.getReaderLeaf()) ?? workspace.getLeaf("tab");
        await leaf.setViewState({ type: BIBLE_READER_VIEW_TYPE, active: true, state });
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
