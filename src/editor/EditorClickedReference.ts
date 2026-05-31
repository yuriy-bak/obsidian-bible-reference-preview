import type { ViewUpdate } from "@codemirror/view";
import { didChangesTouchRange } from "./EditorChangeRanges";

export type EditorClickedReference = {
    from: number;
    to: number;
    text: string;
};

export function remapClickedReferenceAfterDocumentChange(
    update: ViewUpdate,
    currentReference: EditorClickedReference,
    findReferenceMatchAtPosition: (position: number) => EditorClickedReference | null,
): EditorClickedReference | null {
    if (didChangesTouchRange(update, currentReference.from, currentReference.to)) {
        return null;
    }

    const nextFrom = update.changes.mapPos(currentReference.from, 1);
    const nextTo = update.changes.mapPos(currentReference.to, -1);
    if (nextFrom >= nextTo) {
        return null;
    }

    const nextText = update.state.doc.sliceString(nextFrom, nextTo);
    if (nextText !== currentReference.text) {
        return null;
    }

    const nextMatch = findReferenceMatchAtPosition(nextFrom);
    if (
        nextMatch === null
        || nextMatch.from !== nextFrom
        || nextMatch.to !== nextTo
        || nextMatch.text !== currentReference.text
    ) {
        return null;
    }

    return {
        ...currentReference,
        from: nextFrom,
        to: nextTo,
    };
}
