import { stripBookIcon } from "../ui/Icons";
import { MarkdownView, Notice, type Component, type View, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation } from "../application/BibleChapterNavigation";
import type { BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import { refreshChapterUsageCounts } from "../ui/BiblePreviewRenderer";
import type { PluginContext } from "../core/PluginContext";
import type { BibleReference } from "../domain/BibleReference";
import type { EditorReferenceUnderCursor, EditorService } from "../editor/EditorService";
import { BIBLE_PREVIEW_VIEW_TYPE } from "../ui/BiblePreviewPaneView";
import type { BiblePreviewService } from "../ui/BiblePreviewService";
import {
    REFERENCE_USAGE_VIEW_TYPE,
    ReferenceUsagePaneView,
    type ReferenceUsagePaneBackAction,
    type ReferenceUsagePaneQuery,
    type ReferenceUsagePaneViewInput,
} from "../ui/ReferenceUsagePaneView";
import { ReferenceUsageResultsModal } from "../ui/ReferenceUsageResultsModal";
import { areStringArraysEqual } from "../utils/ArrayEquality";
import { detachDuplicateWorkspaceLeavesOfType, getFirstWorkspaceLeafOfType, getWorkspaceLeavesOfType, revealLeafWithoutStealingEditorFocus } from "../workspace/BiblePreviewWorkspace";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";
import { createChapterUsageQuery, groupReferenceUsagesByChapterVerses, isWholeChapterUsageSpan, type ChapterUsageVerseSpan } from "./ReferenceUsageChapterGroups";
import { ReferenceUsageController } from "./ReferenceUsageController";
import {
    normalizeReferenceUsageExcludedFolders,
    REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES,
    REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
    ReferenceUsageIndexService,
    type ReferenceUsageSearchResult,
} from "./ReferenceUsageIndexService";
import { openReferenceUsageResult } from "./ReferenceUsageResultOpening";

/** The index of Bible reference usages in notes: settings, indexing, search and the results panel. */
/** Where the usages panel's back button returns: the preview's reference or the Bible reader's chapter. */
export type ReferenceUsageReturnPoint = {
    kind: "reference" | "chapter";
    run: () => void;
};

export class ReferenceUsageService {
    private indexService: ReferenceUsageIndexService | null = null;
    private controller: ReferenceUsageController | null = null;
    private outdatedNotice: Notice | null = null;

    constructor(
        private readonly context: PluginContext,
        private readonly editor: EditorService,
        private readonly preview: BiblePreviewService,
    ) {}

    async load(): Promise<void> {
        const service = this.getIndexService();
        try {
            await service.load();
        } catch (error) {
            console.warn("Bible reference usage index load failed", error);
            new Notice(this.context.t("notice.referenceUsageIndexLoadFailed"), 5000);
        }
    }

    registerVaultEvents(owner: Component): void {
        const vault = this.context.app.vault;
        const controller = this.getController();
        owner.registerEvent(vault.on("create", (file) => controller.handleFileCreateOrModify(file)));
        owner.registerEvent(vault.on("modify", (file) => controller.handleFileCreateOrModify(file)));
        owner.registerEvent(vault.on("delete", (file) => controller.handleFileDelete(file)));
        owner.registerEvent(vault.on("rename", (file, oldPath) => controller.handleFileRename(file, oldPath)));
        owner.register(() => controller.clearPendingUpdates());
    }

    /**
     * Called after the book names changed and once on startup. An outdated index is rebuilt in the background
     * when auto-update is on; otherwise a notice offers the rebuild.
     */
    handleParserChanged(): void {
        if (!this.isReferenceUsageIndexingEnabled() || !this.context.hasImportedTranslations() || !this.isReferenceUsageIndexOutdated()) {
            return;
        }
        if (this.shouldAutoUpdateReferenceUsageIndex()) {
            this.getController().requestRebuildAfterParserChange();
            return;
        }
        this.showOutdatedNotice();
    }

    isReferenceUsageIndexOutdated(): boolean {
        return this.getIndexService().isOutdated();
    }

    isReferenceUsageIndexingEnabled(): boolean {
        return this.context.settings.referenceUsageIndexingEnabled;
    }

    async setReferenceUsageIndexingEnabled(referenceUsageIndexingEnabled: boolean): Promise<void> {
        if (this.context.settings.referenceUsageIndexingEnabled === referenceUsageIndexingEnabled) return;
        this.context.updateSettings({ referenceUsageIndexingEnabled });
        await this.context.saveSettings();
        this.context.refreshSettingsTab();
    }

    shouldAutoUpdateReferenceUsageIndex(): boolean {
        return this.context.settings.referenceUsageAutoUpdate;
    }

    async setReferenceUsageAutoUpdate(referenceUsageAutoUpdate: boolean): Promise<void> {
        if (this.context.settings.referenceUsageAutoUpdate === referenceUsageAutoUpdate) return;
        this.context.updateSettings({ referenceUsageAutoUpdate });
        await this.context.saveSettings();
        this.context.refreshSettingsTab();
    }

    getReferenceUsageExcludedFoldersText(): string {
        return this.context.settings.referenceUsageExcludedFolders.join("\n");
    }

    async setReferenceUsageExcludedFoldersText(value: string): Promise<void> {
        const referenceUsageExcludedFolders = normalizeReferenceUsageExcludedFolders(value);
        if (areStringArraysEqual(this.context.settings.referenceUsageExcludedFolders, referenceUsageExcludedFolders)) return;
        this.context.updateSettings({ referenceUsageExcludedFolders });
        await this.context.saveSettings();
        // No settings refresh: the text area owns its value, and re-rendering on each keystroke drops focus.
    }

    async buildReferenceUsageIndex(): Promise<void> {
        await this.getController().buildIndex(false);
    }

    async rebuildReferenceUsageIndex(): Promise<void> {
        await this.getController().buildIndex(true);
    }

    async clearReferenceUsageIndex(): Promise<void> {
        await this.getController().clearIndex();
    }

    async showReferenceUsageIndexStats(): Promise<void> {
        this.getController().showStats();
    }

    async findUsagesUnderCursor(): Promise<void> {
        const match = this.getReferenceUnderCursor();
        if (match === null) {
            return;
        }

        const results = this.findUsages(match.references);
        new ReferenceUsageResultsModal(
            this.context.app,
            this.context.settings.interfaceLanguage,
            this.formatTitle(match.text),
            results,
            (result) => void openReferenceUsageResult(this.context.app, result),
        ).open();
    }

    async openUsagesPanelUnderCursor(): Promise<void> {
        const match = this.getReferenceUnderCursor();
        if (match === null) {
            return;
        }

        await this.showResultsInPanel({
            titleText: this.formatTitle(match.text),
            run: () => ({ results: this.findUsages(match.references) }),
        });
    }

    async showUsagesForPreviewBlock(target: BiblePreviewUsageTarget, returnPoint: ReferenceUsageReturnPoint | null = null): Promise<void> {
        if (!this.ensureIndexingEnabled()) {
            return;
        }

        await this.showResultsInPanel({
            titleText: this.formatTitle(target.title),
            run: () => ({ results: this.findUsages(target.references) }),
            back: this.createBackAction(returnPoint),
        });
    }

    // Null hides the chapter's find-usages button (indexing is off).
    countUsagesInChapter(location: BibleChapterLocation): number | null {
        return this.isReferenceUsageIndexingEnabled() ? this.findUsages([createChapterUsageQuery(location)]).length : null;
    }

    async showUsagesForChapter(location: BibleChapterLocation, chapterTitle: string, returnPoint: ReferenceUsageReturnPoint | null = null): Promise<void> {
        if (!this.ensureIndexingEnabled()) {
            return;
        }

        await this.showResultsInPanel({
            titleText: this.formatTitle(chapterTitle),
            run: () => {
                const results = this.findUsages([createChapterUsageQuery(location)]);
                return { results, groups: groupReferenceUsagesByChapterVerses(results, location, (span) => this.formatChapterGroupTitle(span)) };
            },
            back: this.createBackAction(returnPoint),
        });
    }

    // The panel's back button returns to the preview the search started from.
    private createBackAction(returnPoint: ReferenceUsageReturnPoint | null): ReferenceUsagePaneBackAction | undefined {
        if (returnPoint === null) {
            return undefined;
        }
        return {
            ariaLabel: this.context.t(returnPoint.kind === "reference"
                ? "referenceUsages.panel.backToReferenceAria"
                : "referenceUsages.panel.backToChapterAria"),
            run: returnPoint.run,
        };
    }

    createPaneViewInput(): ReferenceUsagePaneViewInput {
        const t = this.context.t.bind(this.context);
        return {
            getTitle: () => t("referenceUsages.panel.titleFallback"),
            getBackText: () => t("preview.chapterBack"),
            getEmptyText: () => t("modal.referenceUsages.empty"),
            getCountText: (count) => t("modal.referenceUsages.count", { count }),
            getOpenResultAria: (result) => t("referenceUsages.openResultAria", { filePath: result.filePath, line: result.line }),
            onOpenResult: (result) => void openReferenceUsageResult(this.context.app, result),
            getRefreshAria: () => t("referenceUsages.panel.refreshAria"),
            getRefreshProgressText: (progress) => t("referenceUsages.panel.refreshProgress", {
                processed: progress.processedFileCount,
                total: progress.totalFileCount,
            }),
            refreshIndex: (onProgress) => this.getController().updateIndexInBackground(onProgress),
        };
    }

    private getIndexService(): ReferenceUsageIndexService {
        if (this.indexService === null) {
            this.indexService = new ReferenceUsageIndexService(
                this.context.app,
                () => this.context.dataDirectoryPath,
                (text) => this.context.parseMatches(text),
                () => this.context.settings.referenceUsageExcludedFolders,
                {
                    getParserSignature: () => this.context.parserSignature,
                    ...(this.context.isMobile
                        ? {
                            maxMarkdownFileSizeBytes: REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
                            buildYieldEveryFiles: REFERENCE_USAGE_MOBILE_BUILD_YIELD_EVERY_FILES,
                        }
                        : {}),
                },
            );
        }
        return this.indexService;
    }

    private getController(): ReferenceUsageController {
        if (this.controller === null) {
            this.controller = new ReferenceUsageController({
                app: this.context.app,
                getService: () => this.getIndexService(),
                isIndexingEnabled: () => this.isReferenceUsageIndexingEnabled(),
                shouldAutoProcessEvents: () => this.isReferenceUsageIndexingEnabled()
                    && this.shouldAutoUpdateReferenceUsageIndex()
                    && this.context.hasImportedTranslations(),
                hasImportedTranslations: () => this.context.hasImportedTranslations(),
                showNoImportedTranslationsNotice: () => this.context.showNoImportedTranslationsNotice(),
                translate: (key, params) => this.context.t(key, params),
                refreshSettings: () => this.context.refreshSettingsTab(),
                onIndexChanged: () => this.onIndexChanged(),
            });
        }
        return this.controller;
    }

    private showOutdatedNotice(): void {
        this.outdatedNotice?.hide();
        const fragment = createFragment((el) => {
            el.createDiv({ text: this.context.t("notice.referenceUsageIndexOutdatedPrompt") });
            el.createEl("button", { text: this.context.t("notice.referenceUsageIndexOutdatedRebuildButton") }, (buttonEl) => {
                buttonEl.addEventListener("click", () => {
                    this.outdatedNotice?.hide();
                    this.outdatedNotice = null;
                    void this.rebuildReferenceUsageIndex();
                });
            });
        });
        this.outdatedNotice = new Notice(fragment, 0);
    }

    private onIndexChanged(): void {
        refreshChapterUsageCounts(activeDocument, (location) => this.countUsagesInChapter(location));
    }

    private getReferenceUnderCursor(): EditorReferenceUnderCursor | null {
        if (!this.ensureIndexingEnabled()) {
            return null;
        }
        return this.editor.getReferenceUnderCursor(true);
    }

    private ensureIndexingEnabled(): boolean {
        if (this.isReferenceUsageIndexingEnabled()) {
            return true;
        }
        new Notice(this.context.t("notice.referenceUsageIndexDisabled"), 4000);
        return false;
    }

    // Searches the index after reindexing open notes from their editor text, so the current note
    // is found even when auto-update is off or its latest edits are not saved yet.
    private findUsages(references: BibleReference[]): ReferenceUsageSearchResult[] {
        const service = this.getIndexService();
        if (this.isReferenceUsageIndexingEnabled() && this.context.hasImportedTranslations() && this.syncOpenMarkdownNotes(service)) {
            window.setTimeout(() => this.onIndexChanged(), 0);
        }
        return service.findUsages(references);
    }

    private syncOpenMarkdownNotes(service: ReferenceUsageIndexService): boolean {
        const openFilePaths = new Set<string>();
        let changed = false;
        for (const leaf of this.context.app.workspace.getLeavesOfType("markdown")) {
            const view = leaf.view;
            if (!(view instanceof MarkdownView) || view.file === null) {
                continue;
            }
            openFilePaths.add(view.file.path);
            if (service.syncOpenFileContent(view.file, view.getViewData())) {
                changed = true;
            }
        }
        service.retainSyncedOpenFiles(openFilePaths);
        return changed;
    }

    private formatTitle(referenceText: string): string {
        return this.context.t("modal.referenceUsages.title", { reference: stripBookIcon(referenceText) });
    }

    private formatChapterGroupTitle(span: ChapterUsageVerseSpan): string {
        const t = this.context.t.bind(this.context);
        if (isWholeChapterUsageSpan(span)) {
            return t("referenceUsages.chapterGroup.wholeChapter");
        }
        if (span.verseEnd === null) {
            return t("referenceUsages.chapterGroup.verseToEnd", { start: span.verseStart });
        }
        return span.verseStart === span.verseEnd
            ? t("referenceUsages.chapterGroup.verse", { verse: span.verseStart })
            : t("referenceUsages.chapterGroup.verseRange", { start: span.verseStart, end: span.verseEnd });
    }

    private async showResultsInPanel(query: ReferenceUsagePaneQuery): Promise<void> {
        const view = await this.getOrCreatePaneView();
        if (view === null) {
            return;
        }
        view.refreshInput(this.createPaneViewInput());
        view.setQuery(query);
    }

    closePane(): void {
        for (const leaf of getWorkspaceLeavesOfType(this.context.app, REFERENCE_USAGE_VIEW_TYPE)) leaf.detach();
    }

    private async getOrCreatePaneView(): Promise<ReferenceUsagePaneView | null> {
        const app = this.context.app;
        const existingLeaf = getFirstWorkspaceLeafOfType(app, REFERENCE_USAGE_VIEW_TYPE);
        if (existingLeaf !== null) {
            const existingView = await ensureLeafViewLoaded({
                leaf: existingLeaf,
                viewType: REFERENCE_USAGE_VIEW_TYPE,
                active: true,
                isExpectedView: isReferenceUsagePaneView,
            });
            if (existingView !== null) {
                await this.revealLeaf(existingLeaf);
                await detachDuplicateWorkspaceLeavesOfType(app, REFERENCE_USAGE_VIEW_TYPE, existingLeaf);
                existingView.refreshInput(this.createPaneViewInput());
                return existingView;
            }
        }

        const leaf = app.workspace.getRightLeaf(false);
        if (leaf === null) {
            return null;
        }
        await leaf.setViewState({ type: REFERENCE_USAGE_VIEW_TYPE, active: true });
        await this.revealLeaf(leaf);
        await detachDuplicateWorkspaceLeavesOfType(app, REFERENCE_USAGE_VIEW_TYPE, leaf);
        const view = leaf.view;
        return isReferenceUsagePaneView(view) ? view : null;
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
            setSuppressPreviewActiveLeafChange: (value) => this.preview.setSuppressActiveLeafChange(value),
        });
    }
}

function isReferenceUsagePaneView(view: View): view is ReferenceUsagePaneView {
    return view instanceof ReferenceUsagePaneView;
}
