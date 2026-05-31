export function clearEditorReferenceLinkUpdateTimeout(
    currentTimeout: number | null,
    setReferenceLinkUpdateTimeout: (timeout: number | null) => void,
): void {
    if (currentTimeout === null) {
        return;
    }

    window.clearTimeout(currentTimeout);
    setReferenceLinkUpdateTimeout(null);
}
