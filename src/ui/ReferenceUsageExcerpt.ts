import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";

// The heading, the lines the reference sits under (indented by level) and the excerpt below them.
export function renderReferenceUsageExcerpt(containerEl: HTMLElement, result: ReferenceUsageSearchResult): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: "bible-reference-usage-excerpt-block" });
    if (result.heading.length > 0) {
        blockEl.createDiv({ text: result.heading, cls: "bible-reference-usage-heading" });
    }
    for (const line of result.context) {
        setLevel(blockEl.createDiv({ text: line.text, cls: "bible-reference-usage-context-line" }), line.level);
    }
    const excerptEl = blockEl.createDiv({ cls: "bible-reference-usage-excerpt" });
    setLevel(excerptEl, result.context.length);
    appendHighlightedExcerpt(excerptEl, result.excerpt, result.sourceText);
    return blockEl;
}

function setLevel(el: HTMLElement, level: number): void {
    el.setCssProps({ "--bible-reference-usage-level": String(level) });
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
