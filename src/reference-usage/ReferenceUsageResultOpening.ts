import { App, MarkdownView, Notice, TFile } from "obsidian";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";

export type ReferenceUsageResultOpeningInput = {
    app: App;
    waitForNextAnimationFrame(): Promise<void>;
};

export async function openReferenceUsageResult(
    input: ReferenceUsageResultOpeningInput,
    result: ReferenceUsageSearchResult,
): Promise<void> {
    const file = input.app.vault.getAbstractFileByPath(result.filePath);

    if (!(file instanceof TFile)) {
        new Notice(`File not found: ${result.filePath}`, 4000);
        return;
    }

    const leaf = input.app.workspace.getLeaf(false);
    await leaf.openFile(file, {
        active: true,
        eState: {
            line: result.line,
        },
    });

    await input.waitForNextAnimationFrame();

    const openedView = leaf.view;
    const markdownView = openedView instanceof MarkdownView
        ? openedView
        : input.app.workspace.getActiveViewOfType(MarkdownView);

    if (markdownView === null || markdownView.file?.path !== file.path) {
        return;
    }

    const line = Math.max(0, result.line - 1);
    const from = {
        line,
        ch: Math.max(0, result.chStart),
    };
    const to = {
        line,
        ch: Math.max(from.ch, result.chEnd),
    };

    markdownView.editor.focus();
    markdownView.editor.setSelection(from, to);
    markdownView.editor.scrollIntoView({ from, to }, true);
}
