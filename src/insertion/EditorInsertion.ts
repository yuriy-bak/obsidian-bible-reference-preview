// Where inserted Bible text goes in a note: a block of its own after the paragraph, never inside a line.

/** The part of Obsidian's Editor the insertion uses (a fake one in the tests). */
export type InsertionEditor = {
    getCursor: () => { line: number; ch: number };
    getLine: (line: number) => string;
    lineCount: () => number;
    replaceRange: (text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => void;
    setCursor: (position: { line: number; ch: number }) => void;
};

export type ReferenceMatchInLine = { from: number; to: number; text: string };

/** The reference the cursor is in or touches on its line. */
export function findReferenceAtCursor(editor: InsertionEditor, parseMatches: (text: string) => ReferenceMatchInLine[]): { line: number; text: string } | null {
    const cursor = editor.getCursor();
    const match = parseMatches(editor.getLine(cursor.line)).find((candidate) => candidate.from <= cursor.ch && cursor.ch <= candidate.to);
    return match === undefined ? null : { line: cursor.line, text: match.text };
}

/** Inserts the block after the paragraph the line belongs to, with an empty line before it. */
export function insertBlockAfterParagraph(editor: InsertionEditor, line: number, markdown: string): void {
    let last = line;
    while (last + 1 < editor.lineCount() && editor.getLine(last + 1).trim().length > 0) last += 1;
    const end = { line: last, ch: editor.getLine(last).length };
    const followedByText = last + 1 < editor.lineCount() && editor.getLine(last + 1).trim().length > 0;
    editor.replaceRange(`\n\n${markdown}${followedByText ? "\n" : ""}`, end);
    placeCursorAfter(editor, last + 2, markdown);
}

/**
 * Inserts the block at the cursor: on an empty line in place, with empty lines around it where text touches it;
 * on a line with text after its paragraph.
 */
export function insertBlockAtCursor(editor: InsertionEditor, markdown: string): void {
    const cursor = editor.getCursor();
    if (editor.getLine(cursor.line).trim().length > 0) {
        insertBlockAfterParagraph(editor, cursor.line, markdown);
        return;
    }
    const textBefore = cursor.line > 0 && editor.getLine(cursor.line - 1).trim().length > 0;
    const textAfter = cursor.line + 1 < editor.lineCount() && editor.getLine(cursor.line + 1).trim().length > 0;
    const text = `${textBefore ? "\n" : ""}${markdown}${textAfter ? "\n" : ""}`;
    editor.replaceRange(text, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: editor.getLine(cursor.line).length });
    placeCursorAfter(editor, cursor.line + (textBefore ? 1 : 0), markdown);
}

function placeCursorAfter(editor: InsertionEditor, firstLine: number, markdown: string): void {
    const lines = markdown.split("\n");
    editor.setCursor({ line: firstLine + lines.length - 1, ch: lines[lines.length - 1].length });
}

export type SuggestTrigger = { start: number; query: string };

const MAX_SUGGEST_QUERY_LENGTH = 40;

/**
 * The typed text after the trigger ("--Ин 3:16" → "Ин 3:16") when the cursor is in it: the trigger starts the
 * line or follows a space, and a letter follows it, so "---" and "-- " (a dash) do not open suggestions.
 */
export function findSuggestTrigger(textBeforeCursor: string, trigger: string): SuggestTrigger | null {
    if (trigger.length === 0) return null;
    const start = textBeforeCursor.lastIndexOf(trigger);
    if (start < 0) return null;
    const charBefore = start === 0 ? "" : textBeforeCursor[start - 1];
    if (charBefore !== "" && !/\s/u.test(charBefore)) return null;
    const query = textBeforeCursor.slice(start + trigger.length);
    if (query.length === 0 || query.length > MAX_SUGGEST_QUERY_LENGTH || !/^[\p{L}\d]/u.test(query)) return null;
    // "1 Кор" starts with a digit; a digit alone is not a book yet.
    if (/^\d/u.test(query) && !/^\d\s?\p{L}/u.test(query)) return null;
    return { start, query };
}
