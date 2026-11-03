import { ItemView, Platform, type Menu, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { BiblePreviewScrollCommand } from "./BiblePreviewHeader";
import { BibleReaderPanel, type BibleReaderLocation, type BibleReaderOpenState, type BibleReaderViewInput } from "./BibleReaderPanel";

export type { BibleReaderLocation, BibleReaderOpenState, BibleReaderViewInput } from "./BibleReaderPanel";

export const BIBLE_READER_VIEW_TYPE = "bible-reference-reader";
/** Obsidian's body class for the navbar hidden by scrolling (phone, "Full screen" option). */
const HIDDEN_NAVBAR_CLASS = "is-hidden-nav";
/** Scrolling by fewer pixels does not hide or show the navbar. */
const NAVBAR_SCROLL_THRESHOLD = 8;

/**
 * The state Obsidian saves with the workspace. It keeps the chapter in the active translation's numbering and
 * no translation: the reader's translation is not remembered, a restored reader shows the active one.
 */
type BibleReaderSavedState = {
    book: number;
    chapter: number;
};

/**
 * "Bible reader" in a tab: the reader panel (BibleReaderPanel) in an Obsidian view. Several readers can be open,
 * each with its own translation.
 */
export class BibleReaderView extends ItemView {
    private panel: BibleReaderPanel | null = null;

    /** The last scroll position of the view, to tell scrolling down from scrolling up. */
    private lastScrollTop = 0;
    /** Whether this reader hid Obsidian's mobile navbar, so it shows it again when left. */
    private hidesNavbar = false;

    constructor(leaf: WorkspaceLeaf, private input: BibleReaderViewInput) {
        super(leaf);
    }

    onload(): void {
        super.onload();
        this.registerDomEvent(this.contentEl, "scroll", () => this.onViewScroll());
        this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
            if (leaf !== this.leaf) this.setNavbarHidden(false);
        }));
    }

    getViewType(): string { return BIBLE_READER_VIEW_TYPE; }
    getIcon(): string { return "book-open-text"; }

    // The tab's menu (right click or ⋯): another reader in a new tab, for another translation or book;
    // on a phone, this chapter in the panel under the note.
    onPaneMenu(menu: Menu, source: string): void {
        super.onPaneMenu(menu, source);
        menu.addItem((item) => item
            .setTitle(this.input.getNewReaderTabText())
            .setIcon("plus")
            .onClick(() => this.input.onOpenNewReaderTab()));
        const openBelow = this.input.onOpenBelow;
        if (openBelow !== undefined) {
            menu.addItem((item) => item
                .setTitle(this.input.getOpenBelowText())
                .setIcon("panel-bottom")
                .onClick(() => openBelow(this.leaf, this.getLocation())));
        }
    }

    getDisplayText(): string {
        return this.panel?.getTitle() ?? this.input.getViewTitle();
    }

    getLocation(): BibleReaderLocation | null {
        return this.panel?.getLocation() ?? null;
    }

    getTranslationId(): string | null {
        return this.panel?.getTranslationId() ?? null;
    }

    async onOpen(): Promise<void> {
        this.getPanel();
    }

    async onClose(): Promise<void> {
        this.setNavbarHidden(false);
        this.panel?.dispose();
        this.panel = null;
    }

    /** The book and chapter picker, with the focus in its search field. */
    openNavigator(): void {
        this.getPanel().openNavigator();
    }

    getState(): Record<string, unknown> {
        const location = this.getLocation();
        if (location === null) return {};
        const activeTranslationId = this.input.getActiveTranslationId();
        const saved = activeTranslationId === null || activeTranslationId === location.translationId
            ? location.target
            : this.input.mapChapterLocation(location.target, location.translationId, activeTranslationId);
        const state: BibleReaderSavedState = { book: saved.book, chapter: saved.chapter };
        return state;
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        await super.setState(state, result);
        await this.getPanel().open(parseOpenState(state));
    }

    /** Rebuilds the open chapter (translations or the language changed), keeping the scroll position. */
    async refresh(input: BibleReaderViewInput = this.input): Promise<void> {
        this.input = input;
        await this.getPanel().refresh(input);
    }

    public scrollReader(command: BiblePreviewScrollCommand): boolean {
        return this.panel?.scrollReader(command) ?? false;
    }

    private getPanel(): BibleReaderPanel {
        if (this.panel !== null) return this.panel;
        const containerEl = this.contentEl;
        // The view itself scrolls, as a note does: Obsidian's bottom padding (room for the mobile navbar,
        // or the keyboard while it is open) stays below the text, and the bar is pinned at the top.
        containerEl.addClass("bible-reader-view-content");
        const panel = new BibleReaderPanel(this.input, {
            containerEl,
            scrollEl: containerEl,
            onChange: () => {
                // The tab title follows the chapter.
                updateLeafHeader(this.leaf);
                // Obsidian saves view states only with the layout; ask for it so a restart opens this chapter.
                this.app.workspace.requestSaveLayout();
            },
            getReturnPoint: () => this.input.createLeafReturnPoint(this.leaf),
        });
        this.panel = panel;
        panel.load();
        return panel;
    }

    /**
     * On a phone with Obsidian's "Full screen" option, notes hide the navbar while scrolling down and
     * show it when scrolling up. Obsidian does that only for its own note views, so the reader does
     * the same with the body class Obsidian uses.
     */
    private onViewScroll(): void {
        const scrollTop = this.contentEl.scrollTop;
        const delta = scrollTop - this.lastScrollTop;
        this.lastScrollTop = scrollTop;
        if (!Platform.isPhone || !this.isAutoFullScreen()) return;
        if (delta > NAVBAR_SCROLL_THRESHOLD) this.setNavbarHidden(true);
        else if (delta < -NAVBAR_SCROLL_THRESHOLD || scrollTop <= 0) this.setNavbarHidden(false);
    }

    private isAutoFullScreen(): boolean {
        const vault = this.app.vault as unknown as { getConfig?: (key: string) => unknown };
        // On by default: only an explicit "off" keeps the navbar.
        return vault.getConfig?.("autoFullScreen") !== false;
    }

    private setNavbarHidden(hidden: boolean): void {
        if (!hidden && !this.hidesNavbar) return;
        this.hidesNavbar = hidden;
        this.contentEl.doc.body.toggleClass(HIDDEN_NAVBAR_CLASS, hidden);
    }
}

function parseOpenState(state: unknown): BibleReaderOpenState {
    if (typeof state !== "object" || state === null) return {};
    const value = state as Partial<BibleReaderOpenState>;
    return {
        ...(isPositiveInteger(value.book) && isPositiveInteger(value.chapter) ? { book: value.book, chapter: value.chapter } : {}),
        ...(typeof value.translationId === "string" ? { translationId: value.translationId } : {}),
        ...(Array.isArray(value.highlightedRanges) ? { highlightedRanges: value.highlightedRanges } : {}),
    };
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// Not in the public API: refreshes the tab title after the chapter changes.
function updateLeafHeader(leaf: WorkspaceLeaf): void {
    (leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
}
