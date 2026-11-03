/** The reader's share of the screen height under the note: default and limits. */
export const DEFAULT_READER_SPLIT_RATIO = 0.45;
export const MIN_READER_SPLIT_RATIO = 0.2;
export const MAX_READER_SPLIT_RATIO = 0.8;
/** Neither the note nor the reader gets smaller than this (px): the reader's bar and a few lines stay visible. */
export const MIN_READER_SPLIT_PANE_HEIGHT = 120;

export function clampReaderSplitRatio(ratio: number): number {
    if (!Number.isFinite(ratio)) return DEFAULT_READER_SPLIT_RATIO;
    return Math.min(MAX_READER_SPLIT_RATIO, Math.max(MIN_READER_SPLIT_RATIO, ratio));
}

/**
 * The reader's height in a container of that height: its share, but the note and the reader keep their minimum.
 * A container too small for both (the keyboard open in landscape) splits in half.
 */
export function getReaderSplitHeight(ratio: number, containerHeight: number, minPaneHeight = MIN_READER_SPLIT_PANE_HEIGHT): number {
    if (containerHeight <= 0) return 0;
    if (containerHeight < minPaneHeight * 2) return Math.round(containerHeight / 2);
    const height = Math.round(clampReaderSplitRatio(ratio) * containerHeight);
    return Math.min(containerHeight - minPaneHeight, Math.max(minPaneHeight, height));
}
