import { Platform, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import type { ReferenceUsageReturnPoint } from "../reference-usage/ReferenceUsageService";
import type { TranslationService } from "../translations/TranslationService";
import type { BiblePluginSettings } from "../settings/PluginSettings";
import type { BiblePreviewScrollCommand } from "../ui/BiblePreviewHeader";
import { BIBLE_READER_VIEW_TYPE, BibleReaderView, type BibleReaderLocation, type BibleReaderOpenState, type BibleReaderViewInput } from "../ui/BibleReaderView";
import { BibleReaderSplitPanel } from "../ui/BibleReaderSplitPanel";
import { getWorkspaceLeavesOfType } from "../workspace/BiblePreviewWorkspace";

/** What the reader needs from the reference usages and the import. */
export type BibleReaderServiceEffects = {
    showUsagesForPreviewBlock: (target: BiblePreviewUsageTarget, returnPoint: ReferenceUsageReturnPoint | null) => void;
    getChapterUsageCount: (location: BibleChapterLocation) => number | null;
    showUsagesForChapter: (location: BibleChapterLocation, title: string, returnPoint: ReferenceUsageReturnPoint | null) => void;
    openBibleFilePicker: (hostEl: HTMLElement) => void;
    openTextSearch: (query: string, translationId: string | null) => void;
};

/**
 * Opens and refreshes the "Bible reader" views, and on a phone the reader under the note
 * (when the reader is set to open there).
 */
export class BibleReaderService {
    private lastActiveLeaf: WorkspaceLeaf | null = null;
    private split: BibleReaderSplitPanel | null = null;

    constructor(
        private readonly context: PluginContext,
        private readonly translations: TranslationService,
        private readonly contentBuilder: BiblePreviewContentBuilder,
        private readonly effects: BibleReaderServiceEffects,
    ) {
        context.onSettingsChanged(async (keys) => {
            // The reader under the note closes when the reader goes back to tabs.
            if (keys.has("phoneReaderPlacement") && context.settings.phoneReaderPlacement === "tab") this.closeSplit();
            if (keys.has("interfaceLanguage")) await this.refreshAll();
        });
    }

    /**
     * A chapter from the preview, in the translation it was shown in (the active one without it); in the last reader or a new tab.
     * Resolves to where it opened: "below" for the reader under the note, "tab" otherwise.
     */
    async openChapter(target: BibleChapterTarget, translationId?: string, options: { newTab?: boolean } = {}): Promise<"below" | "tab"> {
        if (options.newTab !== true && this.opensBelow()) {
            await this.getSplit().open({
                book: target.book,
                chapter: target.chapter,
                highlightedRanges: target.highlightedRanges,
                ...(translationId === undefined ? {} : { translationId }),
            });
            return "below";
        }
        await this.openState({
            book: target.book,
            chapter: target.chapter,
            highlightedRanges: target.highlightedRanges,
            ...(translationId === undefined ? {} : { translationId }),
        }, options.newTab === true);
        return "tab";
    }

    /** The command and the ribbon icon: the last reader, or a new one with the book picker open. */
    async openReader(options: { newTab?: boolean } = {}): Promise<void> {
        if (options.newTab !== true && this.opensBelow()) {
            await this.showSplit();
            return;
        }
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
        if (this.opensBelow()) {
            if (this.split?.isOpen() === true) this.split.openNavigator();
            else await this.getSplit().open({});
            return;
        }
        await this.openReader();
        const view = this.getReaderLeaf()?.view;
        if (view instanceof BibleReaderView) view.openNavigator();
    }

    handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        if (leaf?.view instanceof BibleReaderView) this.lastActiveLeaf = leaf;
    }

    async refreshAll(): Promise<void> {
        await Promise.all([
            ...this.getViews().map((view) => view.refresh(this.createViewInput())),
            ...(this.split?.isOpen() === true ? [this.split.refresh(this.createViewInput())] : []),
        ]);
    }

    /** Scrolls the reader in the active tab, or the one under the note; false when there is none to scroll. */
    /** Whether a reader the scroll commands move is active (a reader tab) or open under the note. */
    canScroll(): boolean {
        return this.context.app.workspace.getActiveViewOfType(BibleReaderView) !== null || this.split?.isOpen() === true;
    }

    scrollActive(command: BiblePreviewScrollCommand): boolean {
        const view = this.context.app.workspace.getActiveViewOfType(BibleReaderView);
        if (view !== null) return view.scrollReader(command);
        return this.split?.scrollReader(command) ?? false;
    }

    /**
     * Whether the reader opens under the note: a phone, with that placement in the settings. Always the setting, whatever
     * is open: moving a chapter between a tab and the panel changes it.
     */
    opensBelow(): boolean {
        return Platform.isPhone && this.context.settings.phoneReaderPlacement === "below";
    }

    isSplitOpen(): boolean {
        return this.split?.isOpen() === true;
    }

    /** The command on a phone: shows the reader under the note (at its last chapter) or hides it. */
    async toggleSplit(): Promise<void> {
        if (this.split?.isOpen() === true) {
            this.closeSplit();
            return;
        }
        await this.showSplit();
    }

    /** At start, the reader under the note comes back if it was open (Obsidian's workspace does not keep it). */
    async restoreSplit(): Promise<void> {
        if (!Platform.isPhone || !this.context.settings.readerSplit.open) return;
        await this.showSplit();
    }

    closeSplit(): void {
        if (this.split?.isOpen() !== true) return;
        this.split.close();
        // Closed, but the chapter stays for the next time it opens.
        this.saveSplitState({ ...this.context.settings.readerSplit, open: false });
    }

    /** The plugin unloads: the panel leaves the app's layout; it is still remembered as open. */
    dispose(): void {
        this.split?.close();
        this.split = null;
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
            getCopyFailedNoticeText: () => t("notice.bibleTextCopyFailed"),
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
            onFindUsages: (target, translationId, returnPoint) => this.effects.showUsagesForPreviewBlock({
                title: target.title,
                references: this.toActiveReferences(target.references, translationId),
            }, returnPoint),
            getChapterUsageCount: (location, translationId) => this.effects.getChapterUsageCount(this.toActiveLocation(location, translationId)),
            getUsageLocation: (location, translationId) => this.toActiveLocation(location, translationId),
            onFindChapterUsages: (location, title, translationId, returnPoint) =>
                this.effects.showUsagesForChapter(this.toActiveLocation(location, translationId), title, returnPoint),
            createLeafReturnPoint: (leaf) => this.createReturnPoint(leaf),
            getOpenBelowText: () => t("reader.split.openBelow"),
            // Only on a phone: elsewhere Obsidian splits tabs itself.
            ...(Platform.isPhone ? { onOpenBelow: (leaf: WorkspaceLeaf, location: BibleReaderLocation | null) => void this.moveToSplit(leaf, location) } : {}),
            mapChapterTarget: (target, from, to) => this.contentBuilder.mapChapterTarget(target, from, to),
            getNavigatorBooks: (translationId) => this.contentBuilder.getNavigatorBooks(translationId),
            getNavigatorLabels: () => ({
                searchPlaceholder: t("reader.navigator.searchPlaceholder"),
                backToBooks: t("reader.navigator.backToBooks"),
                close: t("reader.navigator.close"),
                noBooks: t("reader.navigator.noBooks"),
                searchText: (query) => t("reader.navigator.searchText", { query }),
            }),
            getSearchTextAria: () => t("reader.searchTextAria"),
            onSearchText: (query, translationId) => this.effects.openTextSearch(query, translationId),
            getOpenNavigatorAria: () => t("reader.navigator.openAria"),
            getTranslationOptions: () => this.translations.getTranslationSettingsItems().map((item) => ({ id: item.id, name: item.name })),
            getTranslationSelectAria: () => t("reader.translationSelectAria"),
        };
    }

    private getSplit(): BibleReaderSplitPanel {
        if (this.split !== null) return this.split;
        const t = this.context.t.bind(this.context);
        this.split = new BibleReaderSplitPanel({
            reader: this.createViewInput(),
            getRatio: () => this.context.settings.readerSplitRatio,
            onRatioChange: (ratio) => {
                this.context.updateSettings({ readerSplitRatio: ratio });
                void this.context.saveSettings();
            },
            onLocationChange: (location) => this.saveSplitState(location === null
                ? { open: true }
                : { open: true, book: location.target.book, chapter: location.target.chapter, translationId: location.translationId }),
            // The usages panel's back button shows the reader under the note again.
            getReturnPoint: () => ({ kind: "chapter", run: () => void this.showSplit() }),
            onClose: () => this.closeSplit(),
            onOpenInTab: (location) => void this.moveToTab(location),
            getCloseAria: () => t("reader.split.closeAria"),
            getOpenInTabAria: () => t("reader.split.openInTabAria"),
            getResizeAria: () => t("reader.split.resizeAria"),
        });
        return this.split;
    }

    // The last chapter of the panel, or the book picker the first time.
    private async showSplit(): Promise<void> {
        const split = this.getSplit();
        if (split.isOpen()) return;
        const saved = this.context.settings.readerSplit;
        await split.open({
            ...(saved.book !== undefined && saved.chapter !== undefined ? { book: saved.book, chapter: saved.chapter } : {}),
            ...(saved.translationId === undefined ? {} : { translationId: saved.translationId }),
        });
        if (!this.context.settings.readerSplit.open) this.saveSplitState({ ...saved, open: true });
    }

    // The tab's chapter moves under the note: the tab closes, the note it covered comes back on top.
    // Chapters open under the note from now on, as if chosen in the settings.
    private async moveToSplit(leaf: WorkspaceLeaf, location: BibleReaderLocation | null): Promise<void> {
        this.savePlacement("below");
        await this.getSplit().open(location === null ? {} : toOpenState(location));
        leaf.detach();
    }

    // The panel's chapter goes to a tab, the panel closes; chapters open in a tab from now on.
    private async moveToTab(location: BibleReaderLocation | null): Promise<void> {
        this.savePlacement("tab");
        this.closeSplit();
        await this.openState(location === null ? {} : toOpenState(location));
    }

    private savePlacement(phoneReaderPlacement: BiblePluginSettings["phoneReaderPlacement"]): void {
        if (this.context.settings.phoneReaderPlacement === phoneReaderPlacement) return;
        this.context.updateSettings({ phoneReaderPlacement });
        void this.context.saveSettings();
        this.context.refreshSettingsTab();
    }

    private saveSplitState(state: BiblePluginSettings["readerSplit"]): void {
        this.context.updateSettings({ readerSplit: state });
        void this.context.saveSettings();
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

function toOpenState(location: BibleReaderLocation): BibleReaderOpenState {
    return {
        book: location.target.book,
        chapter: location.target.chapter,
        highlightedRanges: location.target.highlightedRanges,
        translationId: location.translationId,
    };
}
