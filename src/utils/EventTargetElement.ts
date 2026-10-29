/**
 * The event target as an HTML element, also for events from popout windows: their nodes belong to
 * another realm, where `instanceof Node` is false, so the check goes through Obsidian's `instanceOf`.
 */
export function getHTMLElementTarget(target: EventTarget | null): HTMLElement | null {
    const node = target as Partial<Node> | null;
    if (node === null || typeof node.instanceOf !== "function") return null;
    return node.instanceOf(HTMLElement) ? node : null;
}
