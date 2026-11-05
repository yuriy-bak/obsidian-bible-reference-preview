const LINK_COLOR_PROPERTY = "--bible-reference-link-color";

/** Links in the editor and in reading mode take their color from this variable on the window's body. */
export function applyBibleReferenceLinkColor(targetDocument: Document, color: string): void {
    targetDocument.body.setCssProps({ [LINK_COLOR_PROPERTY]: color });
}

export function removeBibleReferenceLinkColor(targetDocument: Document): void {
    targetDocument.body.style.removeProperty(LINK_COLOR_PROPERTY);
}
