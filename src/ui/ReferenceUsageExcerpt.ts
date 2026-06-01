import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";

export function renderReferenceUsageExcerpt(containerEl: HTMLElement, result: ReferenceUsageSearchResult): HTMLElement {
    const excerptEl = containerEl.createDiv();
    excerptEl.style.fontSize = "12px";
    excerptEl.style.color = "var(--text-muted)";
    excerptEl.style.marginTop = "4px";

    appendHighlightedExcerpt(excerptEl, result.excerpt, result.sourceText);
    return excerptEl;
}

function appendHighlightedExcerpt(containerEl: HTMLElement, excerpt: string, sourceText: string): void {
    const matchIndex = sourceText.length > 0 ? excerpt.indexOf(sourceText) : -1;
    if (matchIndex < 0) {
        containerEl.createSpan({ text: excerpt });
        return;
    }

    const beforeText = excerpt.slice(0, matchIndex);
    const matchedText = excerpt.slice(matchIndex, matchIndex + sourceText.length);
    const afterText = excerpt.slice(matchIndex + sourceText.length);

    if (beforeText.length > 0) {
        containerEl.createSpan({ text: beforeText });
    }

    const matchedEl = containerEl.createSpan({ text: matchedText });
    matchedEl.style.fontWeight = "700";
    matchedEl.style.color = "var(--text-normal)";
    matchedEl.style.backgroundColor = "var(--text-highlight-bg)";
    matchedEl.style.borderRadius = "3px";
    matchedEl.style.padding = "0 2px";

    if (afterText.length > 0) {
        containerEl.createSpan({ text: afterText });
    }
}
