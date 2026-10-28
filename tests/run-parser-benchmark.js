const assert = require("assert");
const { BibleReferenceParser } = require("../.test-build/src/parsing/BibleReferenceParser.js");
const { createBookMapping } = require("../.test-build/src/parsing/BookMapping.js");
const {
  BENCHMARK_BOOKS,
  MATCHES_PER_PARAGRAPH,
  PARAGRAPH,
  createBenchmarkText,
} = require("./fixtures/parser-benchmark.js");

// The editor parses up to 50k visible characters per update, so this size must stay well below a frame budget.
// The threshold is generous for slow CI machines: before the single-pass normalization it took ~200 ms.
const MAX_50K_PARSE_MS = 100;
const RUNS = 5;

const parser = new BibleReferenceParser(createBookMapping(BENCHMARK_BOOKS));

assert.strictEqual(parser.parseMatches(PARAGRAPH).length, MATCHES_PER_PARAGRAPH);

function measure(length) {
  const text = createBenchmarkText(length);
  const expectedMatchCount = parser.parseMatches(text).length;
  let best = Infinity;

  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    const matchCount = parser.parseMatches(text).length;
    best = Math.min(best, performance.now() - startedAt);
    assert.strictEqual(matchCount, expectedMatchCount);
  }

  return { best, matchCount: expectedMatchCount };
}

const paragraphCount = Math.floor(50000 / PARAGRAPH.length);
const results = [2000, 20000, 50000].map((length) => ({ length, ...measure(length) }));

for (const { length, best, matchCount } of results) {
  console.log(`Parser benchmark: ${length} chars, ${matchCount} matches, ${best.toFixed(1)} ms`);
}

const largest = results[results.length - 1];
assert.ok(largest.matchCount >= paragraphCount * MATCHES_PER_PARAGRAPH, `too few matches: ${largest.matchCount}`);
assert.ok(largest.best < MAX_50K_PARSE_MS, `parsing 50k chars took ${largest.best.toFixed(1)} ms (limit ${MAX_50K_PARSE_MS} ms)`);

console.log("Parser benchmark passed.");
