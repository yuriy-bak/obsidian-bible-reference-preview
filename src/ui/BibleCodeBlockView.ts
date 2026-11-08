import { MarkdownRenderChild } from "obsidian";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";
import { parseBibleCodeBlockLines } from "../code-block/BibleCodeBlock";
import { type BiblePreviewRenderOptions, renderBiblePreviewContent } from "./BiblePreviewRenderer";

export const BIBLE_CODE_BLOCK_CLASS = "bible-code-block";

export type BibleCodeBlockViewLabels = {
    noTranslations: string;
    empty: string;
};

export type BibleCodeBlockViewInput = {
    hasImportedTranslations: () => boolean;
    hasReference: (line: string) => boolean;
    /** One line's passage in the main translation (or the one its code names), without comparison. */
    analyze: (line: string) => Promise<BiblePreviewContent | null>;
    getRenderOptions: () => BiblePreviewRenderOptions;
    getLabels: () => BibleCodeBlockViewLabels;
};

/**
 * A ```bible block in reading mode and Live Preview: each line is rendered as the passage it references,
 * from the imported translations, so the note keeps only the references. Registered in `views` while shown,
 * so an import or another main translation renders it again.
 */
export class BibleCodeBlockView extends MarkdownRenderChild {
    private renderId = 0;

    constructor(
        containerEl: HTMLElement,
        private readonly source: string,
        private readonly input: BibleCodeBlockViewInput,
        private readonly views: Set<BibleCodeBlockView>,
    ) {
        super(containerEl);
    }

    onload(): void {
        this.views.add(this);
        this.containerEl.addClass(BIBLE_CODE_BLOCK_CLASS);
        void this.render();
    }

    onunload(): void {
        this.views.delete(this);
    }

    async render(): Promise<void> {
        const renderId = ++this.renderId;
        const labels = this.input.getLabels();
        const fragment = createFragment();
        if (!this.input.hasImportedTranslations()) {
            fragment.createDiv({ cls: "bible-code-block-message", text: labels.noTranslations });
        } else {
            const lines = parseBibleCodeBlockLines(this.source, this.input.hasReference);
            if (lines.length === 0) fragment.createDiv({ cls: "bible-code-block-message", text: labels.empty });
            const options = this.input.getRenderOptions();
            for (const line of lines) {
                const content = line.type === "reference" ? await this.input.analyze(line.text) : null;
                if (renderId !== this.renderId) return;
                if (content === null || content.blocks.length === 0) {
                    fragment.createDiv({ cls: "bible-code-block-unrecognized", text: line.text });
                    continue;
                }
                renderBiblePreviewContent(fragment.createDiv({ cls: "bible-code-block-passage" }), content, options);
            }
        }
        if (renderId !== this.renderId) return;
        this.containerEl.replaceChildren(fragment);
    }
}
