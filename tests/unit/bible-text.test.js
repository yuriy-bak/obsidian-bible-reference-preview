const {
  assert,
  syntheticMetadata,
  BibleReferenceParser,
  createBookMapping,
  getBibleTextBlocks,
  LazyBibleIndexV2,
  extractBibleTextFromCompactBook,
  formatBibleTextBlocks,
  DEFAULT_TRANSLATION_ID,
} = require("../helpers");

module.exports = async () => {
  let loadCount = 0;
  const lazy = new LazyBibleIndexV2(syntheticMetadata, {
    async loadBook() {
      loadCount += 1;
      return {
        chapters: [
          null,
          [
            null,
            "В начале Бог создал небо и землю.",
            ["Земля была безлика и пуста.", ["Или «сила»."]],
          ],
        ],
      };
    },
  });
  const text = await lazy.getBibleText({
    translationId: DEFAULT_TRANSLATION_ID,
    book: 1,
    chapter: 1,
    verseStart: 1,
    verseEnd: 2,
  });
  await lazy.getBibleText({
    translationId: DEFAULT_TRANSLATION_ID,
    book: 1,
    chapter: 1,
    verseStart: 1,
    verseEnd: 1,
  });
  assert.strictEqual(loadCount, 1);
  assert.strictEqual(text.verses.length, 2);

  // Ranges are capped by the last verse of the chapter and the last chapter of the book.
  const createSyntheticChapter = (verseCount) => [null, ...Array.from({ length: verseCount }, (_unused, index) => `Стих ${index + 1}`)];
  const rangeIndex = new LazyBibleIndexV2(syntheticMetadata, {
    async loadBook(_translationId, bookId) {
      if (bookId === 43) {
        return { chapters: [null, ...Array.from({ length: 21 }, (_unused, index) => createSyntheticChapter(index === 2 ? 36 : 3))] };
      }
      // Genesis has no chapterCount metadata (old import).
      return bookId === 1 ? { chapters: [null, createSyntheticChapter(3), createSyntheticChapter(3)] } : null;
    },
  });
  const rangeMapping = createBookMapping([
    { id: 1, name: "Бытие", abbreviation: "Быт" },
    { id: 43, name: "Иоанна", abbreviation: "Ин" },
  ]);
  const rangeParser = new BibleReferenceParser(rangeMapping);
  const getRangeBlocks = (reference) => getBibleTextBlocks(rangeParser.parse(reference), rangeIndex, DEFAULT_TRANSLATION_ID);
  const formatRange = (blocks) => formatBibleTextBlocks(blocks, rangeMapping, "MISSING").plainText;

  const hugeRangeStartedAt = Date.now();
  const hugeVerseRange = await getRangeBlocks("Ин 3:1-2000000");
  const hugeVerseRangeText = formatRange(hugeVerseRange);
  assert(Date.now() - hugeRangeStartedAt < 500, "Huge verse range must be capped");
  assert.strictEqual(hugeVerseRange[0].parts[0].bibleText.verses.length, 36);
  assert(!hugeVerseRangeText.includes("MISSING"));
  assert(hugeVerseRangeText.includes("Стих 36"));

  const pastChapterEndText = formatRange(await getRangeBlocks("Ин 3:16-180"));
  assert(!pastChapterEndText.includes("MISSING"));
  assert(pastChapterEndText.includes("Стих 16") && pastChapterEndText.includes("Стих 36"));

  const hugeChapterRange = await getRangeBlocks("Ин 20:2-2000000:1");
  assert.deepStrictEqual(hugeChapterRange[0].parts.map((part) => [part.range.chapter, part.range.verseEnd]), [[20, undefined], [21, undefined]]);
  assert.strictEqual(hugeChapterRange[0].parts[1].bibleText.verses.length, 3);
  assert.strictEqual((await getRangeBlocks("Ин 22:1-30:1")).length, 0);

  const oldImportChapterRange = await getRangeBlocks("Быт 1:2-500:1");
  assert.deepStrictEqual(oldImportChapterRange[0].parts.map((part) => part.range.chapter), [1, 2]);

  const compactStringText = extractBibleTextFromCompactBook({
    translationId: DEFAULT_TRANSLATION_ID,
    book: 1,
    bookName: "Бытие",
    chapter: 1,
    verseStart: 1,
    verseEnd: 1,
    data: { chapters: [null, [null, "Старый текст"]] },
  });
  assert.strictEqual(compactStringText.verses[0].paragraphStart, true);

  const compactTupleText = extractBibleTextFromCompactBook({
    translationId: DEFAULT_TRANSLATION_ID,
    book: 1,
    bookName: "Бытие",
    chapter: 1,
    verseStart: 1,
    verseEnd: 1,
    data: { chapters: [null, [null, ["Старый текст", ["Сноска"]]]] },
  });
  assert.strictEqual(compactTupleText.verses[0].paragraphStart, true);
  assert.deepStrictEqual(compactTupleText.verses[0].footnotes, ["Сноска"]);

  const compactObjectText = extractBibleTextFromCompactBook({
    translationId: DEFAULT_TRANSLATION_ID,
    book: 1,
    bookName: "Бытие",
    chapter: 1,
    verseStart: 1,
    verseEnd: 2,
    data: {
      chapters: [
        null,
        [
          null,
          { text: "Первый", paragraphStart: true },
          { text: "Второй", paragraphStart: false },
        ],
      ],
    },
  });
  assert.strictEqual(compactObjectText.verses[1].paragraphStart, false);
};
