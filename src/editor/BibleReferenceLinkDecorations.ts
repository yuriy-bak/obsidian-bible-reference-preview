import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

const MAX_BIBLE_REFERENCE_DECORATION_RANGE_CHARACTERS = 20000;
const MAX_BIBLE_REFERENCE_DECORATION_TOTAL_CHARACTERS = 50000;

type BibleReferenceLinkDecorationVisibleRangeInput = {
    from: number;
    to: number;
    text: string;
};

export type BibleReferenceLinkDecorationCacheEntry = {
    key: string;
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

export const bibleReferenceLinkTheme = EditorView.baseTheme({
    ".bible-reference-link": {
        textDecoration: "underline",
        textDecorationStyle: "dotted",
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

export function refreshBibleReferenceLinkDecorationsForViews(
    views: Iterable<EditorView>,
    createDecorations: (view: EditorView) => DecorationSet,
): void {
    for (const view of views) {
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
    linkColor: string;
    cache: WeakMap<EditorView, BibleReferenceLinkDecorationCacheEntry>;
    shouldRunBiblePreviewForEditor(view: EditorView): boolean;
    hasImportedTranslations(): boolean;
    parseMatches(text: string): Array<{ from: number; to: number }>;
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

    const rangeInputs: BibleReferenceLinkDecorationVisibleRangeInput[] = [];
    let totalVisibleCharacters = 0;

    for (const range of view.visibleRanges) {
        const text = view.state.doc.sliceString(range.from, range.to);
        if (text.length > MAX_BIBLE_REFERENCE_DECORATION_RANGE_CHARACTERS) {
            continue;
        }

        totalVisibleCharacters += text.length;
        if (totalVisibleCharacters > MAX_BIBLE_REFERENCE_DECORATION_TOTAL_CHARACTERS) {
            cache.delete(view);
            return Decoration.none;
        }

        rangeInputs.push({ from: range.from, to: range.to, text });
    }

    const cacheKey = createBibleReferenceLinkDecorationCacheKey(rangeInputs, input.linkColor, input.activeTranslationId);
    const cachedEntry = cache.get(view);
    if (cachedEntry !== undefined && cachedEntry.key === cacheKey) {
        return cachedEntry.decorations;
    }

    const builder = new RangeSetBuilder<Decoration>();

    for (const range of rangeInputs) {
        const matches = input.parseMatches(range.text);

        for (const match of matches) {
            builder.add(
                range.from + match.from,
                range.from + match.to,
                Decoration.mark({
                    class: "bible-reference-link",
                    attributes: { style: `color: ${input.linkColor};` },
                }),
            );
        }
    }

    const decorations = builder.finish();
    cache.set(view, { key: cacheKey, decorations });
    return decorations;
}

function createBibleReferenceLinkDecorationCacheKey(
    ranges: BibleReferenceLinkDecorationVisibleRangeInput[],
    linkColor: string,
    activeTranslationId: string | null,
): string {
    return [
        activeTranslationId ?? "",
        linkColor,
        ...ranges.map((range) => `${range.from}:${range.to}:${range.text.length}:${range.text}`),
    ].join("\n");
}
