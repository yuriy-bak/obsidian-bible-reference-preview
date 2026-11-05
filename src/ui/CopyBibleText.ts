import { Notice } from "obsidian";

export type CopyBibleTextLabels = {
    getCopyNoticeText: () => string;
    getCopyFailedNoticeText: () => string;
};

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
