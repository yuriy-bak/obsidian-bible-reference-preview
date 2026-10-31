import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";

export function renderReferenceUsageHeading(containerEl: HTMLElement, result: ReferenceUsageSearchResult): void {
    if (result.heading.length > 0) {
        containerEl.createDiv({ text: result.heading, cls: "bible-reference-usage-heading" });
    }
}

export function renderReferenceUsageExcerpt(containerEl: HTMLElement, result: ReferenceUsageSearchResult): HTMLElement {
    const excerptEl = containerEl.createDiv({ cls: "bible-reference-usage-excerpt" });

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

    containerEl.createSpan({ text: matchedText, cls: "bible-reference-usage-excerpt-match" });

    if (afterText.length > 0) {
        containerEl.createSpan({ text: afterText });
    }
}
