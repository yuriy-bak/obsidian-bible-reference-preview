import type { ViewUpdate } from "@codemirror/view";
import type { EditorClickedReference } from "./EditorClickedReference";
import { remapClickedReferenceAfterDocumentChange } from "./EditorClickedReference";

export type EditorClickedReferenceUpdateInput = {
    update: ViewUpdate;
    clickedReference: EditorClickedReference | null;
    findReferenceMatchAtPosition(position: number): EditorClickedReference | null;
    setClickedReference(reference: EditorClickedReference | null): void;
    hideBiblePreview(resetParagraphCache?: boolean): void;
};

export function updateClickedReferenceAfterDocumentChange(input: EditorClickedReferenceUpdateInput): void {
    if (input.clickedReference === null) {
        return;
    }

    const nextClickedReference = remapClickedReferenceAfterDocumentChange(
        input.update,
        input.clickedReference,
        input.findReferenceMatchAtPosition,
    );
    if (nextClickedReference === null) {
        input.setClickedReference(null);
        input.hideBiblePreview(true);
        return;
    }

    input.setClickedReference(nextClickedReference);
}
