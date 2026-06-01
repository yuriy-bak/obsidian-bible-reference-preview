import { App, Modal } from "obsidian";
import { BiblePluginLocale, t } from "../i18n/I18n";
import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";
import { renderReferenceUsageExcerpt } from "./ReferenceUsageExcerpt";

export class ReferenceUsageResultsModal extends Modal {
    constructor(
        app: App,
        private readonly locale: BiblePluginLocale,
        private readonly titleText: string,
        private readonly results: ReferenceUsageSearchResult[],
        private readonly openResult: (result: ReferenceUsageSearchResult) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.titleText });
        if (this.results.length === 0) {
            contentEl.createEl("p", { text: t(this.locale, "modal.referenceUsages.empty") });
            return;
        }
        contentEl.createEl("p", { text: t(this.locale, "modal.referenceUsages.count", { count: this.results.length }) });
        const listEl = contentEl.createDiv();
        listEl.style.display = "flex";
        listEl.style.flexDirection = "column";
        listEl.style.gap = "8px";
        for (const result of this.results) {
            const rowEl = listEl.createDiv();
            rowEl.style.border = "1px solid var(--background-modifier-border)";
            rowEl.style.borderRadius = "6px";
            rowEl.style.padding = "8px";
            const buttonEl = rowEl.createEl("button", { text: `${result.filePath}:${result.line}` });
            buttonEl.style.marginBottom = "6px";
            buttonEl.addEventListener("click", (event) => {
                event.preventDefault();
                this.openResult(result);
                this.close();
            });
            rowEl.createDiv({ text: result.sourceText }).style.fontWeight = "600";
            renderReferenceUsageExcerpt(rowEl, result);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
