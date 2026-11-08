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
    getSideDockForLeaf,
    getWorkspaceLeavesOfType,
    isBiblePreviewPaneActiveInSideDock,
    isSideDockUtilityLeaf,
    revealLeafWithoutStealingEditorFocus,
} from "../workspace/BiblePreviewWorkspace";
import { ensureLeafViewLoaded } from "../workspace/WorkspaceLeafViewLoading";
import type { BiblePreviewScrollCommand } from "../ui/BiblePreviewHeader";
import { BIBLE_PREVIEW_VIEW_TYPE, BiblePreviewPaneView, type BiblePreviewPaneViewInput } from "../ui/BiblePreviewPaneView";
import type { FloatingBiblePreviewAnchor, FloatingBiblePreviewWindow, FloatingBiblePreviewWindowInput } from "../ui/FloatingBiblePreviewWindow";

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
    /** The target is in `translationId`'s numbering; no translation means the active one. Resolves to where it opened. */
    openChapterInReader: (target: BibleChapterTarget, translationId?: string, newTab?: boolean) => Promise<"below" | "tab">;
    insertIntoNote: (content: BiblePreviewContent) => void;
};

/** The floating preview window and the side panel preview. */
export class BiblePreviewService {
    private floatingWindow: FloatingBiblePreviewWindow | null = null;
    private lastPaneContent: BiblePreviewContent | null = null;
    private lastPanelEscapeTime = 0;
    private suppressActiveLeafChange = false;
    private paneIsActiveInSideDock = false;

    constructor(
        private readonly context: PluginContext,
        private readonly settings: SettingsService,
        private readonly translations: TranslationService,
        private readonly contentBuilder: BiblePreviewContentBuilder,
        private readonly effects: BiblePreviewServiceEffects,
    ) {
        context.onSettingsChanged(async (keys) => {
            if (keys.has("isPluginActive") && !settings.isPluginActive()) {
                this.hideFloating(true);
                await this.closePane({ collapseSideDock: false, requireActivePreview: false });
            }
            if (keys.has("interfaceLanguage")) this.refreshLocalizedLabels();
            else if (keys.has("floatingPreviewBackgroundColor")) this.refreshFloatingLabels();
            if (keys.has("previewPanelSide")) await this.closePane({ collapseSideDock: true, requireActivePreview: false });
        });
    }

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

    /** Whether a preview is shown that the scroll commands can move. */
    canScroll(): boolean {
        if (!this.settings.isPluginActive()) return false;
        if (this.floatingWindow?.isVisible() === true) return true;
        return this.context.settings.previewDisplayMode === "side-panel"
            && getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE) !== null;
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

    createFloatingWindowInput(): FloatingBiblePreviewWindowInput {
        return {
            ...this.createCommonViewInput(),
            getCollapseAria: () => this.context.t("preview.collapseAria"),
            getExpandAria: () => this.context.t("preview.expandAria"),
            getBackgroundColor: () => this.settings.getFloatingPreviewBackgroundColor(),
            getCloseAria: () => this.context.t("preview.closeAria"),
            getOpenInPanelAria: () => this.context.t("preview.openInPanelAria"),
            onOpenInPanel: (content) => void this.switchToPanel(content),
        };
    }

    createPaneViewInput(): BiblePreviewPaneViewInput {
        return {
            ...this.createCommonViewInput(),
            getOpenFloatingAria: () => this.context.t("preview.openFloatingAria"),
            onOpenFloating: (content) => void this.switchToFloating(content),
        };
    }

    private createCommonViewInput() {
        const t = this.context.t.bind(this.context);
        const isComparisonEnabled = (): boolean => this.context.settings.previewComparisonEnabled;
        return {
            getTitle: () => `📖 ${this.translations.getActiveTranslationPreviewTitle()}`,
            getCopyNoticeText: () => t("notice.bibleTextCopied"),
            getCopyFailedNoticeText: () => t("notice.bibleTextCopyFailed"),
            getCopyAria: () => t("preview.copyAria"),
            getOpenSettingsText: () => t("preview.openSettings"),
            onOpenSettings: () => this.context.openPluginSettings(),
            getInsertIntoNoteText: () => t("preview.insertIntoNote"),
            onInsertIntoNote: (content: BiblePreviewContent) => this.effects.insertIntoNote(content),
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
                void this.openChapter(target, translationId, newTab),
        };
    }

    private async openChapter(target: BibleChapterTarget, translationId?: string, newTab?: boolean): Promise<void> {
        const openedIn = await this.effects.openChapterInReader(target, translationId, newTab);
        if (openedIn === "below") this.hidePaneDrawer();
    }

    // On a phone the side panel is a drawer over the note. A chapter opening in a tab hides it (Obsidian reveals the tab);
    // the reader under the note changes no tab, so the drawer is hidden here, or the chapter stays behind it.
    // The preview stays in the drawer, as it does when a tab opens.
    private hidePaneDrawer(): void {
        const leaf = getFirstWorkspaceLeafOfType(this.context.app, BIBLE_PREVIEW_VIEW_TYPE);
        if (leaf === null) return;
        const sideDock = getSideDockForLeaf(this.context.app, leaf, this.context.settings.previewPanelSide, BIBLE_PREVIEW_VIEW_TYPE);
        if (sideDock === undefined || sideDock.collapsed === true || typeof sideDock.collapse !== "function") return;
        sideDock.collapse();
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
