import { App, Modal } from "obsidian";
import { BiblePluginLocale, t } from "../i18n/I18n";
import type { ReferenceUsageSearchResult } from "../reference-usage/ReferenceUsageIndexService";
import { renderReferenceUsageExcerpt, renderReferenceUsageHeading } from "./ReferenceUsageExcerpt";

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
        const listEl = contentEl.createDiv({ cls: "bible-reference-usage-results-list" });
        for (const result of this.results) {
            const rowEl = listEl.createDiv({ cls: "bible-reference-usage-results-row" });
            const buttonEl = rowEl.createEl("button", { text: `${result.filePath}:${result.line}`, cls: "bible-reference-usage-results-open-button" });
            buttonEl.addEventListener("click", (event) => {
                event.preventDefault();
                this.openResult(result);
                this.close();
            });
            renderReferenceUsageHeading(rowEl, result);
            rowEl.createDiv({ text: result.sourceText, cls: "bible-reference-usage-source-text" });
            renderReferenceUsageExcerpt(rowEl, result);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
