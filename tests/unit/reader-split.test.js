const assert = require("assert");
const {
  DEFAULT_READER_SPLIT_RATIO,
  MAX_READER_SPLIT_RATIO,
  MIN_READER_SPLIT_RATIO,
  clampReaderSplitRatio,
  getReaderSplitHeight,
} = require("../../.test-build/src/reader/ReaderSplitGeometry.js");

// The height of the reader under the note: its share of the container, the note and the reader keep a minimum.
module.exports = async () => {
  assert.strictEqual(clampReaderSplitRatio(0.5), 0.5);
  assert.strictEqual(clampReaderSplitRatio(0), MIN_READER_SPLIT_RATIO);
  assert.strictEqual(clampReaderSplitRatio(1), MAX_READER_SPLIT_RATIO);
  assert.strictEqual(clampReaderSplitRatio(Number.NaN), DEFAULT_READER_SPLIT_RATIO);

  assert.strictEqual(getReaderSplitHeight(0.45, 800), 360);
  // The share is clamped before the minimum applies.
  assert.strictEqual(getReaderSplitHeight(0.95, 1000), 800);
  // The keyboard leaves little room: the reader keeps its minimum, and the note too.
  assert.strictEqual(getReaderSplitHeight(0.2, 400), 120);
  assert.strictEqual(getReaderSplitHeight(0.8, 400), 280);
  // Too small for both minimums: half each.
  assert.strictEqual(getReaderSplitHeight(0.45, 200), 100);
  assert.strictEqual(getReaderSplitHeight(0.45, 0), 0);
};
