import { MarkdownView, type View, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContentBuilder } from "../application/BiblePreviewContentBuilder";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/BiblePreviewModel";
import type { PluginContext } from "../core/PluginContext";
import type { SettingsService } from "../settings/SettingsService";
import type { TranslationService } from "../translations/TranslationService";
import { waitForNextAnimationFrame } from "../utils/AnimationFrame";
import {
    closeBiblePreviewPane,
    detachDuplicateWorkspaceLeavesOfType,
    expandBiblePreviewSideDock,
    getFirstWorkspaceLeafOfType,
    getWorkspaceLeavesOfType,
    isBiblePreviewPaneActiveInSideDock,
    isSideDockUtilityLeaf,
    revealLeafWithoutStealingEditorFocus,
} from "../workspace/BiblePreviewWorkspace";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";
import type { BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, type BiblePreviewPaneViewInput } from "./BiblePreviewPaneView";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow, FloatingBiblePreviewWindowInput } from "./FloatingBiblePreviewWindow";

export type ClosePreviewPaneOptions = {
    collapseSideDock?: boolean;
    requireActivePreview?: boolean;
};

/** What the preview showed when a usages search started from it; the usages panel returns to it. */
export type BiblePreviewReturnPoint = {
    content: BiblePreviewContent;
    scrollTop: number;
};

/** What the preview needs from the reference usages and the Bible reader. */
export type BiblePreviewServiceEffects = {
    showReferenceUsagesForPreviewBlock: (target: BiblePreviewUsageTarget, returnPoint: BiblePreviewReturnPoint | null) => void;
    /** The target is in `translationId`'s numbering; no translation means the active one. */
    openChapterInReader: (target: BibleChapterTarget, translationId?: string, newTab?: boolean) => void;
    /** The comparison setting is shared with the readers. */
    refreshReaders: () => void;
};

/** The floating preview window and the side panel preview. */
export class BiblePreviewService {
    private floatingWindow: FloatingBiblePreviewWindow | null = null;
    private lastPaneContent: BiblePreviewContent | null = null;
    // What the floating window showed last, also after it was hidden (switching to the Bible reader hides it).
    private lastFloatingContent: BiblePreviewContent | null = null;
    private lastPanelEscapeTime = 0;
    private suppressActiveLeafChange = false;
    private paneIsActiveInSideDock = false;

    constructor(
        private readonly context: PluginContext,
        private readonly settings: SettingsService,
        private readonly translations: TranslationService,
        private readonly contentBuilder: BiblePreviewContentBuilder,
        private readonly effects: BiblePreviewServiceEffects,
    ) {}

    setFloatingWindow(floatingWindow: FloatingBiblePreviewWindow): void {
        this.floatingWindow = floatingWindow;
    }

    getLastPaneContent(): BiblePreviewContent | null {
        return this.lastPaneContent;
    }

    setSuppressActiveLeafChange(value: boolean): void {
        this.suppressActiveLeafChange = value;
    }

    show(
        content: BiblePreviewContent,
        anchor: FloatingBiblePreviewAnchor = { type: "default" },
        options: { reveal?: boolean } = {},
    ): void {
        const reveal = options.reveal !== false;
        if (this.context.settings.previewDisplayMode === "side-panel") {
            void this.showInPanel(content, reveal);
            this.hideFloating();
            return;
        }

        this.lastFloatingContent = content;
        this.floatingWindow?.show(content, anchor, { reveal });
    }

    handleWindowClose(closedWindow: Window): void {
        this.floatingWindow?.handleWindowClose(closedWindow);
    }

    hideFloating(resetPosition = false): void {
        this.floatingWindow?.hide(resetPosition);
    }

    isFloatingTarget(target: Node): boolean {
        return this.floatingWindow?.containsTarget(target) ?? false;
    }

    getCurrentContent(): BiblePreviewContent | null {
        if (this.context.settings.previewDisplayMode === "side-panel") {
            return this.lastPaneContent;
        }
        return this.floatingWindow?.getContent() ?? null;
    }

    captureReturnPoint(): BiblePreviewReturnPoint | null {
        const content = this.getCurrentContent();
        if (content === null) {
            return null;
        }
        return { content, scrollTop: this.getCurrentScrollTop() };
    }

    /** Shows the captured content again, with its scroll position. */
    returnTo(point: BiblePreviewReturnPoint): void {
        if (!this.settings.isPluginActive()) {
            return;
        }
        this.show({ ...point.content, scrollTop: point.scrollTop }, { type: "default" }, { reveal: true });
    }

    private getCurrentScrollTop(): number {
        if (this.context.settings.previewDisplayMode !== "side-panel") {
            return this.floatingWindow?.getScrollTop() ?? 0;
        }
        const view = getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE)?.view;
        return view instanceof BiblePreviewPaneView ? view.getScrollTop() : 0;
    }

    async refreshVisibleContent(): Promise<void> {
        const content = this.getCurrentContent();
        if (content === null) {
            return;
        }
        // The last translation was deleted: the open text is gone with it.
        if (!this.context.hasImportedTranslations()) {
            this.lastFloatingContent = null;
            this.hideFloating();
            await this.closeActivePane();
            return;
        }

        const nextContent = await this.contentBuilder.rebuild(content);
        if (nextContent !== null) {
            this.show(nextContent, { type: "default" }, { reveal: false });
        }
    }

    async toggleComparison(content: BiblePreviewContent): Promise<void> {
        await this.settings.setPreviewComparisonEnabled(!this.settings.isPreviewComparisonEnabled());
        this.effects.refreshReaders();
        const nextContent = await this.contentBuilder.rebuild(content);
        if (nextContent !== null) {
            this.show(nextContent, { type: "default" }, { reveal: true });
        }
    }

    refreshFloatingLabels(): void {
        this.floatingWindow?.refreshLabels(this.createFloatingWindowInput());
    }

    /** Re-applies the labels of the floating window and the side panel (interface language change). */
    refreshLocalizedLabels(): void {
        this.refreshFloatingLabels();
        for (const leaf of getWorkspaceLeavesOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE)) {
            if (leaf.view instanceof BiblePreviewPaneView) {
                leaf.view.refreshInput(this.createPaneViewInput());
            }
        }
    }

    async scroll(command: BiblePreviewScrollCommand): Promise<void> {
        if (!this.settings.isPluginActive()) {
            return;
        }

        this.floatingWindow?.scrollPreview(command);

        if (this.context.settings.previewDisplayMode !== "side-panel") {
            return;
        }

        const leaf = getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE);
        await leaf?.loadIfDeferred();
        if (leaf === null || !(leaf.view instanceof BiblePreviewPaneView)) {
            return;
        }

        await this.revealLeaf(leaf, this.getActiveMarkdownLeafToRestore(true));
        leaf.view.scrollPreview(command);
    }

    async closePane(options: ClosePreviewPaneOptions = {}): Promise<void> {
        await closeBiblePreviewPane({
            app: this.context.app,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: this.context.settings.previewPanelSide,
            biblePreviewPaneIsActiveInSideDock: this.paneIsActiveInSideDock,
            collapseSideDock: options.collapseSideDock,
            requireActivePreview: options.requireActivePreview,
            setBiblePreviewPaneIsActiveInSideDock: (value) => {
                this.paneIsActiveInSideDock = value;
            },
            resetLastPanelEscapeTime: () => {
                this.lastPanelEscapeTime = 0;
            },
        });
    }

    /** Two Escape presses within 1.2 s close the side panel preview when it is the active side dock tab. */
    handleEscapeKeydown(event: KeyboardEvent): void {
        if (event.key !== "Escape") {
            return;
        }
        if (this.floatingWindow?.isVisible() === true) {
            this.lastPanelEscapeTime = 0;
            return;
        }
        const panelLeaf = getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE);
        if (panelLeaf === null || !this.isPaneActive()) {
            this.lastPanelEscapeTime = 0;
            return;
        }
        const now = Date.now();
        const isSecondEscape = now - this.lastPanelEscapeTime <= 1200;
        this.lastPanelEscapeTime = now;
        event.preventDefault();
        event.stopPropagation();
        if (!isSecondEscape) {
            return;
        }
        void this.closeActivePane();
    }

    handleActiveLeafChange(activeLeaf: WorkspaceLeaf | null): void {
        if (this.suppressActiveLeafChange) {
            return;
        }
        if (activeLeaf?.view.getViewType() === BIBLE_PREVIEW_VIEW_TYPE) {
            this.paneIsActiveInSideDock = true;
            return;
        }
        if (isSideDockUtilityLeaf(activeLeaf, BIBLE_PREVIEW_VIEW_TYPE)) {
            this.paneIsActiveInSideDock = false;
            return;
        }
        if (!this.context.settings.closePreviewOnActiveLeafChange) {
            return;
        }
        this.hideFloating();
        void this.closeActivePane();
    }

    /** Shows the preview as it is now (the Bible reader's Back): the side panel, or the note with the floating window. */
    async reveal(): Promise<void> {
        const app = this.context.app;
        if (this.context.settings.previewDisplayMode === "side-panel") {
            const leaf = getFirstWorkspaceLeafOfType(app, BIBLE_PREVIEW_VIEW_TYPE);
            if (leaf !== null) {
                this.expandSideDock();
                await app.workspace.revealLeaf(leaf);
            } else if (this.lastPaneContent !== null) {
                await this.showInPanel(this.lastPaneContent, true);
            }
            return;
        }

        const markdownLeaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
        if (markdownLeaf !== null && markdownLeaf.view instanceof MarkdownView) {
            app.workspace.setActiveLeaf(markdownLeaf, { focus: true });
        }
        const shown = this.floatingWindow?.getContent() ?? null;
        // Hidden content is rebuilt: translations may have changed since.
        const content = shown ?? (this.lastFloatingContent === null ? null : await this.contentBuilder.rebuild(this.lastFloatingContent));
        if (content !== null) this.floatingWindow?.show(content, { type: "default" }, { reveal: true });
    }

    createFloatingWindowInput(): FloatingBiblePreviewWindowInput {
        return {
            ...this.createCommonViewInput(),
            getCollapseAria: () => this.context.t("preview.collapseAria"),
            getExpandAria: () => this.context.t("preview.expandAria"),
            getBackgroundColor: () => this.settings.getFloatingPreviewBackgroundColor(),
            getCloseAria: () => this.context.t("preview.closeAria"),
            getOpenInPanelAria: () => this.context.t("preview.openInPanelAria"),
            getOpenInPanelIcon: () => this.context.t("preview.openInPanelIcon"),
            onOpenInPanel: (content) => void this.switchToPanel(content),
        };
    }

    createPaneViewInput(): BiblePreviewPaneViewInput {
        return {
            ...this.createCommonViewInput(),
            getOpenFloatingAria: () => this.context.t("preview.openFloatingAria"),
            getOpenFloatingIcon: () => this.context.t("preview.openFloatingIcon"),
            onOpenFloating: (content) => void this.switchToFloating(content),
        };
    }

    private createCommonViewInput() {
        const t = this.context.t.bind(this.context);
        const isComparisonEnabled = (): boolean => this.context.settings.previewComparisonEnabled;
        return {
            getTitle: () => `📖 ${this.translations.getActiveTranslationPreviewTitle()}`,
            getCopyNoticeText: () => t("notice.bibleTextCopied"),
            getCopyAria: () => t("preview.copyAria"),
            getFindUsagesButtonText: () => t("preview.findUsagesIcon"),
            getFindUsagesButtonAria: (target: BiblePreviewUsageTarget) => t("preview.findUsagesAria", { reference: target.title }),
            onFindUsages: (target: BiblePreviewUsageTarget) => this.effects.showReferenceUsagesForPreviewBlock(target, this.captureReturnPoint()),
            isComparisonEnabled,
            getComparisonButtonAria: () => isComparisonEnabled()
                ? t("preview.comparisonOffAria")
                : t("preview.comparisonOnAria"),
            getComparisonTranslationsTitle: () => t("preview.comparisonTranslationsTitle"),
            getComparisonTranslations: () => isComparisonEnabled() ? this.translations.getPreviewComparisonTranslationOptions() : [],
            onToggleComparisonTranslation: (translationId: string, enabled: boolean) =>
                void this.translations.setComparisonTranslationEnabled(translationId, enabled),
            onToggleComparison: (content: BiblePreviewContent) => void this.toggleComparison(content),
            getOpenChapterAria: (title: string) => t("preview.openChapterAria", { reference: title }),
            onOpenChapter: (target: BibleChapterTarget, translationId?: string, newTab?: boolean) =>
                this.effects.openChapterInReader(target, translationId, newTab),
        };
    }

    private async switchToPanel(content: BiblePreviewContent): Promise<void> {
        await this.setDisplayMode("side-panel");
        await this.showInPanel(content, true);
        this.hideFloating();
    }

    private async switchToFloating(content: BiblePreviewContent): Promise<void> {
        await this.setDisplayMode("floating");
        await this.closeActivePane();
        this.floatingWindow?.show(content, { type: "default" }, { reveal: true });
    }

    private async setDisplayMode(previewDisplayMode: "side-panel" | "floating"): Promise<void> {
        if (this.context.settings.previewDisplayMode === previewDisplayMode) {
            return;
        }
        this.context.updateSettings({ previewDisplayMode });
        await this.context.saveSettings();
        this.context.refreshSettingsTab();
    }

    private async closeActivePane(): Promise<void> {
        await this.closePane({ collapseSideDock: true, requireActivePreview: true });
    }

    private isPaneActive(): boolean {
        return isBiblePreviewPaneActiveInSideDock({
            app: this.context.app,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: this.context.settings.previewPanelSide,
            biblePreviewPaneIsActiveInSideDock: this.paneIsActiveInSideDock,
        });
    }

    private getActiveMarkdownLeafToRestore(reveal: boolean): WorkspaceLeaf | null {
        const activeMarkdownLeaf = this.context.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null;
        return reveal && !this.context.isMobile ? activeMarkdownLeaf : null;
    }

    private async revealLeaf(leaf: WorkspaceLeaf, restoreActiveLeaf: WorkspaceLeaf | null): Promise<void> {
        await revealLeafWithoutStealingEditorFocus({
            app: this.context.app,
            leaf,
            previewViewType: BIBLE_PREVIEW_VIEW_TYPE,
            previewPanelSide: this.context.settings.previewPanelSide,
            restoreActiveLeaf,
            focus: false,
            isMobile: this.context.isMobile,
            setSuppressPreviewActiveLeafChange: (value) => this.setSuppressActiveLeafChange(value),
        });
    }

    private async showInPanel(content: BiblePreviewContent, reveal: boolean): Promise<void> {
        this.lastPaneContent = content;
        const restoreActiveLeaf = this.getActiveMarkdownLeafToRestore(reveal);
        const view = await this.getOrCreatePaneView(restoreActiveLeaf, reveal);
        view?.setContent(content);
    }

    private async getOrCreatePaneView(restoreActiveLeaf: WorkspaceLeaf | null, reveal: boolean): Promise<BiblePreviewPaneView | null> {
        const app = this.context.app;
        const existingLeaf = getFirstWorkspaceLeafOfType(app, BIBLE_PREVIEW_VIEW_TYPE);
        if (existingLeaf !== null) {
            const existingView = await ensureLeafViewLoaded({
                leaf: existingLeaf,
                viewType: BIBLE_PREVIEW_VIEW_TYPE,
                active: reveal,
                isExpectedView: isBiblePreviewPaneView,
            });
            if (existingView !== null) {
                if (reveal) {
                    this.paneIsActiveInSideDock = true;
                    this.expandSideDock();
                    await this.revealLeaf(existingLeaf, restoreActiveLeaf);
                }
                await detachDuplicateWorkspaceLeavesOfType(app, BIBLE_PREVIEW_VIEW_TYPE, existingLeaf);
                existingView.refreshInput(this.createPaneViewInput());
                return existingView;
            }
        }

        const leaf = this.context.settings.previewPanelSide === "left"
            ? app.workspace.getLeftLeaf(false)
            : app.workspace.getRightLeaf(false);
        if (leaf === null) {
            return null;
        }

        this.setSuppressActiveLeafChange(true);
        try {
            if (reveal) {
                this.expandSideDock();
            }
            await leaf.setViewState({ type: BIBLE_PREVIEW_VIEW_TYPE, active: reveal });
            if (reveal) {
                this.paneIsActiveInSideDock = true;
                this.expandSideDock();
                await this.revealLeaf(leaf, restoreActiveLeaf);
            }
            await waitForNextAnimationFrame();
            await waitForNextAnimationFrame();
            await detachDuplicateWorkspaceLeavesOfType(app, BIBLE_PREVIEW_VIEW_TYPE, leaf);
            const view = leaf.view;
            if (isBiblePreviewPaneView(view)) {
                view.refreshInput(this.createPaneViewInput());
                return view;
            }
            return null;
        } finally {
            window.setTimeout(() => {
                this.setSuppressActiveLeafChange(false);
            }, 100);
        }
    }

    private expandSideDock(): void {
        expandBiblePreviewSideDock(this.context.app, this.context.settings.previewPanelSide);
    }
}

function isBiblePreviewPaneView(view: View): view is BiblePreviewPaneView {
    return view instanceof BiblePreviewPaneView;
}
