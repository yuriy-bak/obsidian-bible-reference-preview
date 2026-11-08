import { Notice } from "obsidian";
import type { BiblePreviewContent } from "../application/BiblePreviewModel";

export type CopyBibleTextLabels = {
    getCopyNoticeText: () => string;
    getCopyFailedNoticeText: () => string;
    /** The Markdown "Insert into note" writes, so a pasted passage looks the same as an inserted one. */
    formatCopyText?: (content: BiblePreviewContent) => string;
};

/** Copies the passage as the insert settings format it; the plain text without them. */
export function copyBibleContent(content: BiblePreviewContent | null, labels: CopyBibleTextLabels): Promise<boolean> {
    if (content === null) return Promise.resolve(false);
    const markdown = labels.formatCopyText?.(content) ?? "";
    return copyBibleText(markdown.length > 0 ? markdown : content.plainText, labels);
}

/** Copies the text and says so; a failure (e.g. no clipboard access on a phone) is shown too, not only logged. */
export async function copyBibleText(text: string, labels: CopyBibleTextLabels): Promise<boolean> {
    if (text.length === 0) return false;
    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        console.error("Bible Reference Preview: failed to copy Bible text", error);
        new Notice(labels.getCopyFailedNoticeText(), 4000);
        return false;
    }
    new Notice(labels.getCopyNoticeText(), 2500);
    return true;
}
