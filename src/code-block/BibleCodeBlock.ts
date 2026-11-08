/** The language of a fenced block whose lines are Bible references: ```bible. */
export const BIBLE_CODE_BLOCK_LANGUAGE = "bible";

export type BibleCodeBlockLine =
    | { type: "reference"; text: string }
    | { type: "unrecognized"; text: string };

/** The block's non-empty lines in order, each a reference line or text the parser does not recognize. */
export function parseBibleCodeBlockLines(source: string, hasReference: (line: string) => boolean): BibleCodeBlockLine[] {
    return source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => (hasReference(line) ? { type: "reference", text: line } : { type: "unrecognized", text: line }));
}
