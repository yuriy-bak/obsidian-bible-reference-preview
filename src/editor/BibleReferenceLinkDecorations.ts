import { RangeSetBuilder, StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

// The parser reads 50,000 characters in ~10 ms. Visible text is parsed in chunks of whole lines; past the total
// budget the rest of the screen stays without links instead of the whole screen losing them.
const BIBLE_REFERENCE_DECORATION_CHUNK_CHARACTERS = 20000;
const MAX_BIBLE_REFERENCE_DECORATION_TOTAL_CHARACTERS = 150000;

type BibleReferenceLinkDecorationVisibleRangeInput = {
    from: number;
    to: number;
    text: string;
};

// The document is immutable, so comparing it by reference together with the visible ranges
// tells whether the visible text changed without building a key from that text.
export type BibleReferenceLinkDecorationCacheEntry = {
    doc: Text;
    ranges: Array<{ from: number; to: number }>;
    activeTranslationId: string | null;
    decorations: DecorationSet;
};

const setBibleReferenceLinkDecorationsEffect = StateEffect.define<DecorationSet>();

export const bibleReferenceLinkDecorationsField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },

    update(decorations, transaction) {
        let nextDecorations = decorations.map(transaction.changes);

        for (const effect of transaction.effects) {
            if (effect.is(setBibleReferenceLinkDecorationsEffect)) {
                nextDecorations = effect.value;
            }
        }

        return nextDecorations;
    },

    provide: (field) => EditorView.decorations.from(field),
});

// One decoration for every link: the color comes from a CSS variable, so a color change rebuilds nothing.
const BIBLE_REFERENCE_LINK_MARK = Decoration.mark({ class: "bible-reference-link" });

export const bibleReferenceLinkTheme = EditorView.baseTheme({
    ".bible-reference-link": {
        // Set on the body of each window from the settings, see applyBibleReferenceLinkColor.
        color: "var(--bible-reference-link-color)",
        borderBottom: "1px dotted currentColor",
        cursor: "pointer",
    },
});

export function dispatchBibleReferenceLinkDecorations(view: EditorView, decorations: DecorationSet): void {
    window.setTimeout(() => {
        if (view.state.field(bibleReferenceLinkDecorationsField, false) === undefined) {
            return;
        }

        view.dispatch({
            effects: setBibleReferenceLinkDecorationsEffect.of(decorations),
        });
    }, 0);
}

export function clearBibleReferenceLinkDecorations(view: EditorView): void {
    dispatchBibleReferenceLinkDecorations(view, Decoration.none);
}

// A refresh means the parser or settings changed, so cached decorations for the same text are stale.
export function refreshBibleReferenceLinkDecorationsForViews(
    views: Iterable<EditorView>,
    cache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>,
    createDecorations: (view: EditorView) => DecorationSet,
): void {
    for (const view of views) {
        cache.delete(view);
        dispatchBibleReferenceLinkDecorations(view, createDecorations(view));
    }
}

export function clearBibleReferenceLinkDecorationsForViews(
    views: Iterable<EditorView>,
    cache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>,
): void {
    for (const view of views) {
        cache.delete(view);
        clearBibleReferenceLinkDecorations(view);
    }
}

export function createBibleReferenceLinkEditorExtensions(cursorPlugin: Extension): Extension[] {
    return [
        bibleReferenceLinkDecorationsField,
        bibleReferenceLinkTheme,
        cursorPlugin,
    ];
}

export type BibleReferenceLinkDecorationInput = {
    view: EditorView;
    activeTranslationId: string | null;
    cache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>;
    shouldRunBiblePreviewForEditor: (view: EditorView) => boolean;
    hasImportedTranslations: () => boolean;
    parseMatches: (text: string) => Array<{ from: number; to: number }>;
};

export function createBibleReferenceLinkDecorations(input: BibleReferenceLinkDecorationInput): DecorationSet {
    const { view, cache } = input;

    if (!input.shouldRunBiblePreviewForEditor(view)) {
        cache.delete(view);
        return Decoration.none;
    }
    if (!input.hasImportedTranslations()) {
        cache.delete(view);
        return Decoration.none;
    }

    const rangeInputs = getVisibleTextChunks(view);

    const doc = view.state.doc;
    const ranges = rangeInputs.map((range) => ({ from: range.from, to: range.to }));
    const cachedEntry = cache.get(view);
    if (cachedEntry !== undefined
        && cachedEntry.doc === doc
        && cachedEntry.activeTranslationId === input.activeTranslationId
        && areDecorationRangesEqual(cachedEntry.ranges, ranges)) {
        return cachedEntry.decorations;
    }

    const builder = new RangeSetBuilder<Decoration>();

    for (const range of rangeInputs) {
        const matches = input.parseMatches(range.text);

        for (const match of matches) {
            builder.add(
                range.from + match.from,
                range.from + match.to,
                BIBLE_REFERENCE_LINK_MARK,
            );
        }
    }

    const decorations = builder.finish();
    cache.set(view, { doc, ranges, activeTranslationId: input.activeTranslationId, decorations });
    return decorations;
}

/** Visible text in chunks of whole lines (a longer line is a chunk of its own), within the total budget. */
function getVisibleTextChunks(view: EditorView): BibleReferenceLinkDecorationVisibleRangeInput[] {
    const doc = view.state.doc;
    const chunks: BibleReferenceLinkDecorationVisibleRangeInput[] = [];
    let remaining = MAX_BIBLE_REFERENCE_DECORATION_TOTAL_CHARACTERS;
    for (const range of view.visibleRanges) {
        let from = range.from;
        while (from < range.to && remaining > 0) {
            const limit = Math.min(range.to, from + Math.min(BIBLE_REFERENCE_DECORATION_CHUNK_CHARACTERS, remaining));
            let to = limit;
            if (limit < range.to) {
                // End the chunk at the end of the last whole line, or after the first line when it is longer.
                const lineEnd = doc.lineAt(limit).from - 1;
                to = lineEnd > from ? lineEnd : Math.min(range.to, doc.lineAt(from).to);
            }
            const text = doc.sliceString(from, to);
            chunks.push({ from, to, text });
            remaining -= text.length;
            from = to + 1;
        }
    }
    return chunks;
}

function areDecorationRangesEqual(
    left: Array<{ from: number; to: number }>,
    right: Array<{ from: number; to: number }>,
): boolean {
    return left.length === right.length
        && left.every((range, index) => range.from === right[index].from && range.to === right[index].to);
}
