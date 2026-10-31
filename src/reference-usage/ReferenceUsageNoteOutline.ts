/** A line shown above a usage excerpt, indented by its level in the shown chain. */
export type ReferenceUsageContextLine = {
    text: string;
    level: number;
};

export type ReferenceUsageLineContext = {
    // The nearest `#` heading above the line; "" when there is none.
    heading: string;
    // What the line sits under, from the outermost: the line that introduces its list or paragraph,
    // then the lines it is nested under by indentation, as the editor folds them.
    lines: ReferenceUsageContextLine[];
};

const CONTEXT_LINE_MAX_CHARS = 60;
// More parents than this show the first one, "…" and the nearest one.
const CONTEXT_MAX_PARENTS = 3;
// How far up a list is followed to find the line that introduces it.
const LIST_START_MAX_LINES = 200;
const ELLIPSIS = "…";
const TAB_WIDTH = 4;

const LIST_ITEM_PATTERN = /^(?:[-*+]|\d+[.)])(?:\s|$)/u;
const HEADING_PATTERN = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/u;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/u;
const THEMATIC_BREAK_PATTERN = /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/u;
const QUOTE_PREFIX_PATTERN = /^\s*(?:>\s?)+/u;
// Quote markers, then a heading, list item (with an optional task box) or ordered list marker.
export const MARKDOWN_LINE_PREFIX_PATTERN = /^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/u;

/**
 * The outline of a note in one pass over its lines: for each line the nearest heading above it and the
 * line it is nested under by indentation (the same lines the editor folds). Headings, code fences, front
 * matter and thematic breaks end the nesting; blank lines do not.
 */
export class ReferenceUsageNoteOutline {
    private readonly parents: number[];
    private readonly headings: string[];
    private readonly indents: number[];

    constructor(private readonly lines: readonly string[]) {
        this.parents = new Array<number>(lines.length).fill(-1);
        this.headings = new Array<string>(lines.length).fill("");
        this.indents = lines.map((line) => getIndent(line));
        this.build();
    }

    public getContext(lineIndex: number): ReferenceUsageLineContext {
        const parents: number[] = [];
        for (let parent = this.parents[lineIndex]; parent >= 0; parent = this.parents[parent]) {
            parents.unshift(parent);
        }
        const outermost = parents[0] ?? lineIndex;
        const intro = this.isTopLevelListItem(outermost)
            ? this.findListIntro(outermost)
            : parents.length === 0 ? this.findColonIntro(lineIndex) : -1;

        const shownParents = parents.length > CONTEXT_MAX_PARENTS ? [parents[0], -1, parents[parents.length - 1]] : parents;
        const shownLines = intro >= 0 ? [intro, ...shownParents] : shownParents;
        return {
            heading: this.headings[lineIndex],
            lines: shownLines.map((line, level) => ({ text: line < 0 ? ELLIPSIS : getContextLineText(this.lines[line]), level })),
        };
    }

    private build(): void {
        let heading = "";
        let fence: string | null = null;
        let inFrontMatter = this.lines[0]?.trim() === "---";
        let stack: number[] = [];
        for (let index = 0; index < this.lines.length; index += 1) {
            const line = this.lines[index];
            this.headings[index] = heading;
            if (inFrontMatter) {
                if (index > 0 && /^(?:---|\.\.\.)\s*$/u.test(line)) inFrontMatter = false;
                continue;
            }
            if (fence !== null) {
                if (line.trim().startsWith(fence)) fence = null;
                continue;
            }
            const fenceMatch = FENCE_PATTERN.exec(line);
            if (fenceMatch !== null) {
                fence = fenceMatch[1];
                stack = [];
                continue;
            }
            const headingMatch = HEADING_PATTERN.exec(line);
            if (headingMatch !== null) {
                heading = (headingMatch[2] ?? "").trim();
                stack = [];
                continue;
            }
            if (line.trim().length === 0) {
                continue;
            }
            if (THEMATIC_BREAK_PATTERN.test(line)) {
                stack = [];
                continue;
            }
            const indent = this.indents[index];
            while (stack.length > 0 && this.indents[stack[stack.length - 1]] >= indent) {
                stack.pop();
            }
            this.parents[index] = stack.length > 0 ? stack[stack.length - 1] : -1;
            stack.push(index);
        }
    }

    private isTopLevelListItem(lineIndex: number): boolean {
        return this.indents[lineIndex] === 0 && isListItem(this.lines[lineIndex]);
    }

    // The line right before the list holding a top-level item, or through one blank line when it ends with a colon.
    private findListIntro(itemIndex: number): number {
        let index = itemIndex - 1;
        const limit = Math.max(0, itemIndex - LIST_START_MAX_LINES);
        // Up through the list: its items, their indented lines and blank lines between them.
        while (index >= limit && this.isListLine(index)) {
            index -= 1;
        }
        if (index < 0 || this.isBlank(index)) {
            const before = index - 1;
            return before >= 0 && this.isIntroCandidate(before) && endsWithColon(this.lines[before]) ? before : -1;
        }
        return this.isIntroCandidate(index) ? index : -1;
    }

    // For a line outside lists: the line above it ending with a colon, at most one blank line between.
    private findColonIntro(lineIndex: number): number {
        let index = lineIndex - 1;
        if (index >= 0 && this.isBlank(index)) index -= 1;
        return index >= 0 && this.isIntroCandidate(index) && endsWithColon(this.lines[index]) ? index : -1;
    }

    private isListLine(index: number): boolean {
        if (this.isBlank(index)) {
            // A blank line inside a loose list: the line above it still belongs to the list.
            return index > 0 && !this.isBlank(index - 1) && (isListItem(this.lines[index - 1]) || this.indents[index - 1] > 0);
        }
        return isListItem(this.lines[index]) || this.indents[index] > 0;
    }

    // A plain line of text: not a list item, heading, fence, thematic break or front matter line.
    private isIntroCandidate(index: number): boolean {
        const line = this.lines[index];
        return !this.isBlank(index)
            && !isListItem(line)
            && !HEADING_PATTERN.test(line)
            && !FENCE_PATTERN.test(line)
            && !THEMATIC_BREAK_PATTERN.test(line)
            && !/^(?:---|\.\.\.)\s*$/u.test(line);
    }

    private isBlank(index: number): boolean {
        return this.lines[index].trim().length === 0;
    }
}

function isListItem(line: string): boolean {
    return LIST_ITEM_PATTERN.test(line.replace(QUOTE_PREFIX_PATTERN, "").trimStart());
}

function endsWithColon(line: string): boolean {
    return /[:：]\s*$/u.test(line);
}

// Leading whitespace after quote markers, a tab counting as four spaces.
function getIndent(line: string): number {
    const content = line.replace(QUOTE_PREFIX_PATTERN, "");
    let indent = 0;
    for (const char of content) {
        if (char === " ") indent += 1;
        else if (char === "\t") indent += TAB_WIDTH;
        else break;
    }
    return indent;
}

// The line without quote markers and indentation, cut at a word boundary.
function getContextLineText(line: string): string {
    const text = line.replace(QUOTE_PREFIX_PATTERN, "").trim();
    if (text.length <= CONTEXT_LINE_MAX_CHARS) {
        return text;
    }
    const head = text.slice(0, CONTEXT_LINE_MAX_CHARS);
    const spaceIndex = head.search(/\s\S*$/u);
    return `${(spaceIndex > 0 ? head.slice(0, spaceIndex) : head).trimEnd()}${ELLIPSIS}`;
}
