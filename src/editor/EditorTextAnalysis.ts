import type { EditorView, ViewUpdate } from "@codemirror/view";

const MAX_ANALYZED_PARAGRAPH_LINES = 40;
const MAX_ANALYZED_PARAGRAPH_CHARACTERS = 2000;

export type BibleReferenceMatchAtPosition = {
    from: number;
    to: number;
    text: string;
};

export type BibleReferenceTextMatch = {
    from: number;
    to: number;
    text: string;
};

export function findBibleReferenceMatchAtPosition(
    view: EditorView,
    position: number,
    parseMatches: (text: string) => BibleReferenceTextMatch[],
): BibleReferenceMatchAtPosition | null {
    const line = view.state.doc.lineAt(position);
    const offset = position - line.from;
    const matches = parseMatches(line.text);

    for (const match of matches) {
        if (offset >= match.from && offset <= match.to) {
            return {
                from: line.from + match.from,
                to: line.from + match.to,
                text: match.text,
            };
        }
    }

    return null;
}

export function getCurrentParagraph(update: ViewUpdate): string {
    return getCurrentAnalysisFragment(update)?.text ?? "";
}

function getCurrentAnalysisFragment(update: ViewUpdate): { text: string; end: number } | null {
    const doc = update.state.doc;
    const cursorPosition = update.state.selection.main.head;
    const line = doc.lineAt(cursorPosition);

    if (line.text.trim() === "") {
        return null;
    }

    if (line.text.length > MAX_ANALYZED_PARAGRAPH_CHARACTERS) {
        return getCurrentLineAnalysisFragment(line.text, line.from, cursorPosition);
    }

    const lines: string[] = [line.text];
    let characterCount = line.text.length;
    let topLine = line;
    let bottomLine = line;
    let canExpandUp = true;
    let canExpandDown = true;

    while (lines.length < MAX_ANALYZED_PARAGRAPH_LINES && (canExpandUp || canExpandDown)) {
        let expanded = false;

        if (canExpandUp && lines.length < MAX_ANALYZED_PARAGRAPH_LINES) {
            if (topLine.number <= 1) {
                canExpandUp = false;
            } else {
                const previousLine = doc.line(topLine.number - 1);

                if (previousLine.text.trim() === "") {
                    canExpandUp = false;
                } else if (characterCount + previousLine.text.length + 1 > MAX_ANALYZED_PARAGRAPH_CHARACTERS) {
                    canExpandUp = false;
                } else {
                    lines.unshift(previousLine.text);
                    characterCount += previousLine.text.length + 1;
                    topLine = previousLine;
                    expanded = true;
                }
            }
        }

        if (canExpandDown && lines.length < MAX_ANALYZED_PARAGRAPH_LINES) {
            if (bottomLine.number >= doc.lines) {
                canExpandDown = false;
            } else {
                const nextLine = doc.line(bottomLine.number + 1);

                if (nextLine.text.trim() === "") {
                    canExpandDown = false;
                } else if (characterCount + nextLine.text.length + 1 > MAX_ANALYZED_PARAGRAPH_CHARACTERS) {
                    canExpandDown = false;
                } else {
                    lines.push(nextLine.text);
                    characterCount += nextLine.text.length + 1;
                    bottomLine = nextLine;
                    expanded = true;
                }
            }
        }

        if (!expanded && !canExpandUp && !canExpandDown) {
            break;
        }
    }

    return {
        text: lines.join("\n"),
        end: bottomLine.to,
    };
}

function getCurrentLineAnalysisFragment(lineText: string, lineFrom: number, cursorPosition: number): { text: string; end: number } {
    const cursorOffset = cursorPosition - lineFrom;
    const halfLimit = Math.floor(MAX_ANALYZED_PARAGRAPH_CHARACTERS / 2);
    let fromOffset = Math.max(0, cursorOffset - halfLimit);
    let toOffset = Math.min(lineText.length, fromOffset + MAX_ANALYZED_PARAGRAPH_CHARACTERS);

    if (toOffset === lineText.length) {
        fromOffset = Math.max(0, toOffset - MAX_ANALYZED_PARAGRAPH_CHARACTERS);
    }

    return {
        text: lineText.slice(fromOffset, toOffset),
        end: lineFrom + toOffset,
    };
}
