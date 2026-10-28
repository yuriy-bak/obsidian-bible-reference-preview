import { MarkdownView, type View, type WorkspaceLeaf } from "obsidian";
import type { BibleChapterLocation, BibleChapterTarget } from "../application/BibleChapterNavigation";
import type { BiblePreviewContent, BiblePreviewUsageTarget } from "../application/formatBibleTexts";
import type { PluginContext } from "../core/PluginContext";
import {
    backFromBiblePreviewChapter,
    isBiblePreviewChapterHighlightHidden,
    isBiblePreviewChapterModeActive,
    navigateBiblePreviewChapter,
    openBiblePreviewChapter,
    setBiblePreviewChapterHighlightHidden,
    trackShownBiblePreviewContent,
    type BiblePreviewChapterFlowInput,
    type BiblePreviewChapterState,
} from "../preview-navigation/BiblePreviewChapterFlow";
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
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, type BiblePreviewPaneViewInput, type BiblePreviewScrollCommand } from "./BiblePreviewPaneView";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow, FloatingBiblePreviewWindowInput } from "./FloatingBiblePreviewWindow";

export type ClosePreviewPaneOptions = {
    collapseSideDock?: boolean;
    requireActivePreview?: boolean;
};

/** What the preview needs from the editor and the reference usages. */
export type BiblePreviewServiceEffects = {
    rebuildContent: (content: BiblePreviewContent) => Promise<BiblePreviewContent | null>;
    buildChapterContent: (target: BibleChapterTarget) => Promise<BiblePreviewContent | null>;
    toggleComparison: (content: BiblePreviewContent) => Promise<void>;
    showReferenceUsagesForPreviewBlock: (target: BiblePreviewUsageTarget) => void;
    getChapterUsageCount: (location: BibleChapterLocation) => number | null;
    showReferenceUsagesForChapter: (location: BibleChapterLocation, title: string) => void;
};

/** The floating preview window, the side panel preview and the chapter mode shared by both. */
export class BiblePreviewService {
    private floatingWindow: FloatingBiblePreviewWindow | null = null;
    private lastPaneContent: BiblePreviewContent | null = null;
    private chapterState: BiblePreviewChapterState | null = null;
    private lastPanelEscapeTime = 0;
    private suppressActiveLeafChange = false;
    private paneIsActiveInSideDock = false;
    private readonly chapterFlowInput: BiblePreviewChapterFlowInput = {
        getState: () => this.chapterState,
        setState: (state) => {
            this.chapterState = state;
        },
        buildChapterContent: (target) => this.effects.buildChapterContent(target),
        showBiblePreviewContent: (content) => this.show(content, { type: "default" }, { reveal: true }),
    };

    constructor(
        private readonly context: PluginContext,
        private readonly settings: SettingsService,
        private readonly translations: TranslationService,
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
        this.chapterState = trackShownBiblePreviewContent(this.chapterState, content);
        const reveal = options.reveal !== false;
        if (this.context.settings.previewDisplayMode === "side-panel") {
            void this.showInPanel(content, reveal);
            this.hideFloating();
            return;
        }

        this.floatingWindow?.show(content, anchor, { reveal });
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

    async refreshVisibleContent(): Promise<void> {
        const content = this.getCurrentContent();
        if (content === null) {
            return;
        }

        const nextContent = await this.effects.rebuildContent(content);
        if (nextContent !== null) {
            this.show(nextContent, { type: "default" }, { reveal: false });
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

    isChapterModeActive(): boolean {
        const isPreviewVisible = this.context.settings.previewDisplayMode === "side-panel"
            ? getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE) !== null
            : this.floatingWindow?.isVisible() === true;
        return isPreviewVisible && isBiblePreviewChapterModeActive(this.chapterState, this.getCurrentContent());
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
            getCopyIcon: () => this.context.t("preview.copyIcon"),
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
            onFindUsages: (target: BiblePreviewUsageTarget) => this.effects.showReferenceUsagesForPreviewBlock(target),
            getComparisonButtonText: () => isComparisonEnabled() ? "1" : "⇄",
            getComparisonButtonAria: () => isComparisonEnabled()
                ? t("preview.comparisonOffAria")
                : t("preview.comparisonOnAria"),
            getComparisonTranslationsTitle: () => t("preview.comparisonTranslationsTitle"),
            getComparisonTranslations: () => isComparisonEnabled() ? this.translations.getPreviewComparisonTranslationOptions() : [],
            onToggleComparisonTranslation: (translationId: string, enabled: boolean) =>
                void this.translations.setComparisonTranslationEnabled(translationId, enabled),
            onToggleComparison: (content: BiblePreviewContent) => void this.effects.toggleComparison(content),
            getOpenChapterAria: (title: string) => t("preview.openChapterAria", { reference: title }),
            onOpenChapter: (target: BibleChapterTarget, returnContent: BiblePreviewContent, returnScrollTop: number) =>
                void openBiblePreviewChapter(this.chapterFlowInput, target, returnContent, returnScrollTop),
            getChapterNavigationLabels: () => ({
                back: t("preview.chapterBack"),
                backAria: t("preview.chapterBackAria"),
                previousAria: t("preview.previousChapterAria"),
                nextAria: t("preview.nextChapterAria"),
                hideHighlightAria: t("preview.hideChapterHighlightAria"),
                showHighlightAria: t("preview.showChapterHighlightAria"),
            }),
            onNavigateChapter: (location: BibleChapterLocation) => void navigateBiblePreviewChapter(this.chapterFlowInput, location),
            onBackFromChapter: () => backFromBiblePreviewChapter(this.chapterFlowInput),
            isChapterHighlightHidden: () => isBiblePreviewChapterHighlightHidden(this.chapterState),
            onToggleChapterHighlight: (hidden: boolean) => setBiblePreviewChapterHighlightHidden(this.chapterFlowInput, hidden),
            getChapterUsageCount: (location: BibleChapterLocation) => this.effects.getChapterUsageCount(location),
            getFindChapterUsagesAria: (title: string) => t("preview.findChapterUsagesAria", { reference: title }),
            onFindChapterUsages: (location: BibleChapterLocation, title: string) => this.effects.showReferenceUsagesForChapter(location, title),
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
