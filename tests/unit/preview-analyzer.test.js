const {
  assert,
  BibleReferenceParser,
  createBookMapping,
  getBibleChapterTextBlock,
  getBibleTextBlocks,
  findAdjacentChapter,
  getChapterTargetFromReferences,
  isVerseInRanges,
  BiblePreviewAnalyzer,
  formatBibleComparisonTextBlocks,
  formatBibleTextBlocks,
} = require("../helpers");

module.exports = async () => {
  const judgesMapping = createBookMapping([
    { id: 7, name: "Судей", abbreviation: "Суд" },
  ]);
  const judgesParser = new BibleReferenceParser(judgesMapping);
  const judgesIndex = {
    async getBibleText(query) {
      const verseCount = query.chapter === 7 ? 25 : 35;
      return {
        translationId: query.translationId,
        book: query.book,
        bookName: "Судей",
        chapter: query.chapter,
        verses: Array.from({ length: verseCount }, (_, index) => ({
          number: index + 1,
          text: `${query.translationId} ${query.chapter}:${index + 1}`,
          footnotes: [],
          paragraphStart: true,
        })),
      };
    },
  };
  let judgesComparisonEnabled = true;
  const judgesAnalyzer = new BiblePreviewAnalyzer({
    hasImportedTranslations: () => true,
    getActiveTranslationId: () => "a",
    isPreviewComparisonEnabled: () => judgesComparisonEnabled,
    parseMatches: (text) => judgesParser.parseMatches(text),
    getBibleTextBlocks: (references, translationId, sourceText) =>
      getBibleTextBlocks(references, judgesIndex, translationId, sourceText),
    formatBibleTextBlocks: (blocks) => formatBibleTextBlocks(blocks, judgesMapping),
    formatBibleComparisonTextBlocks: (inputs) =>
      formatBibleComparisonTextBlocks(inputs),
    getComparisonTranslationIds: () => ["a", "b"],
    getTranslationPreviewTitle: (translationId) => translationId.toUpperCase(),
    getComparisonMapping: () => judgesMapping,
    mapReferences: (references) => references,
  });

  for (const [text, expected] of [
    [
      "Суд7:22;8:23",
      "[A]\n📖 Суд 7:22.\n22 a 7:22\n\n[B]\n📖 Суд 7:22.\n22 b 7:22\n\n"
        + "[A]\n📖 Суд 8:23.\n23 a 8:23\n\n[B]\n📖 Суд 8:23.\n23 b 8:23",
    ],
    [
      "Суд 7:24-8:1",
      "[A]\n📖 Суд 7:24-25.\n24 a 7:24\n\n25 a 7:25\n\n[B]\n📖 Суд 7:24-25.\n24 b 7:24\n\n25 b 7:25\n\n"
        + "[A]\n📖 Суд 8:1.\n1 a 8:1\n\n[B]\n📖 Суд 8:1.\n1 b 8:1",
    ],
  ]) {
    judgesComparisonEnabled = true;
    const openedInComparison = await judgesAnalyzer.analyzeParagraph(text);
    assert.strictEqual(openedInComparison.plainText, expected);
    assert.strictEqual(
      openedInComparison.blocks.filter((block) => block.type === "comparison").length,
      2
    );

    judgesComparisonEnabled = false;
    const openedInStandard = await judgesAnalyzer.analyzeParagraph(text);
    judgesComparisonEnabled = true;
    const toggledToComparison = await judgesAnalyzer.rebuildContent(openedInStandard);
    assert.strictEqual(toggledToComparison.plainText, openedInComparison.plainText);
  }

  // Chapter view: target from a preview block
  assert.deepStrictEqual(
    getChapterTargetFromReferences([
      { book: 7, chapterStart: 7, verseStart: 22, chapterEnd: 7, verseEnd: 22 },
      { book: 7, chapterStart: 7, verseStart: 24, chapterEnd: 7, verseEnd: 25 },
    ]),
    { book: 7, chapter: 7, highlightedRanges: [{ verseStart: 22, verseEnd: 22 }, { verseStart: 24, verseEnd: 25 }] }
  );
  assert.deepStrictEqual(
    getChapterTargetFromReferences([{ book: 7, chapterStart: 7, verseStart: 24, chapterEnd: 8, verseEnd: 1 }]),
    { book: 7, chapter: 7, highlightedRanges: [{ verseStart: 24, verseEnd: undefined }] }
  );
  assert.strictEqual(getChapterTargetFromReferences([]), null);
  assert.strictEqual(isVerseInRanges(23, [{ verseStart: 22, verseEnd: 22 }, { verseStart: 24, verseEnd: 25 }]), false);
  assert.strictEqual(isVerseInRanges(30, [{ verseStart: 24 }]), true);

  // Chapter view: adjacent chapters, across books and Bible edges
  const chapterCounts = new Map([[1, 50], [2, 40], [64, 1], [65, 1], [66, 22]]);
  const countedProbe = {
    getBookIds: () => [1, 2, 64, 65, 66],
    getChapterCount: (book) => chapterCounts.get(book),
    hasChapter: async () => { throw new Error("must not probe when chapter counts are known"); },
  };
  assert.deepStrictEqual(await findAdjacentChapter({ book: 1, chapter: 1 }, 1, countedProbe), { book: 1, chapter: 2 });
  assert.strictEqual(await findAdjacentChapter({ book: 1, chapter: 1 }, -1, countedProbe), null);
  assert.deepStrictEqual(await findAdjacentChapter({ book: 1, chapter: 50 }, 1, countedProbe), { book: 2, chapter: 1 });
  assert.deepStrictEqual(await findAdjacentChapter({ book: 2, chapter: 1 }, -1, countedProbe), { book: 1, chapter: 50 });
  assert.deepStrictEqual(await findAdjacentChapter({ book: 64, chapter: 1 }, 1, countedProbe), { book: 65, chapter: 1 });
  assert.deepStrictEqual(await findAdjacentChapter({ book: 65, chapter: 1 }, -1, countedProbe), { book: 64, chapter: 1 });
  assert.strictEqual(await findAdjacentChapter({ book: 66, chapter: 22 }, 1, countedProbe), null);
  assert.strictEqual(await findAdjacentChapter({ book: 3, chapter: 1 }, 1, countedProbe), null);

  const probedChapters = new Map([[1, 3], [2, 2]]);
  const probingProbe = {
    getBookIds: () => [1, 2],
    getChapterCount: () => undefined,
    hasChapter: async (book, chapter) => chapter >= 1 && chapter <= (probedChapters.get(book) ?? 0),
  };
  assert.deepStrictEqual(await findAdjacentChapter({ book: 1, chapter: 2 }, 1, probingProbe), { book: 1, chapter: 3 });
  assert.deepStrictEqual(await findAdjacentChapter({ book: 1, chapter: 3 }, 1, probingProbe), { book: 2, chapter: 1 });
  assert.deepStrictEqual(await findAdjacentChapter({ book: 2, chapter: 1 }, -1, probingProbe), { book: 1, chapter: 3 });
  assert.strictEqual(await findAdjacentChapter({ book: 2, chapter: 2 }, 1, probingProbe), null);

  // Chapter view: whole chapter content with highlighted verses
  const chapterIndex = {
    async getBibleText(query) {
      const verseCount = query.chapter === 7 ? 25 : query.chapter === 8 ? 35 : 0;
      if (verseCount === 0) return null;
      const verseEnd = query.verseEnd ?? verseCount;
      const verses = [];
      for (let number = query.verseStart; number <= Math.min(verseEnd, verseCount); number += 1) {
        verses.push({ number, text: `${query.translationId} ${query.chapter}:${number}`, footnotes: [], paragraphStart: number % 10 === 1 });
      }
      return { translationId: query.translationId, book: query.book, bookName: "Судей", chapter: query.chapter, verses };
    },
  };
  const wholeChapterBlock = await getBibleChapterTextBlock(7, 8, chapterIndex, "a");
  assert.deepStrictEqual(wholeChapterBlock.reference, { book: 7, chapterStart: 8, verseStart: 1, chapterEnd: 8, verseEnd: 35 });
  assert.strictEqual(wholeChapterBlock.parts[0].bibleText.verses.length, 35);
  assert.strictEqual(await getBibleChapterTextBlock(7, 9, chapterIndex, "a"), null);

  let chapterComparisonEnabled = false;
  const chapterAnalyzer = new BiblePreviewAnalyzer({
    hasImportedTranslations: () => true,
    getActiveTranslationId: () => "a",
    isPreviewComparisonEnabled: () => chapterComparisonEnabled,
    parseMatches: (text) => judgesParser.parseMatches(text),
    getBibleTextBlocks: (references, translationId, sourceText) =>
      getBibleTextBlocks(references, chapterIndex, translationId, sourceText),
    formatBibleTextBlocks: (blocks) => formatBibleTextBlocks(blocks, judgesMapping),
    formatBibleComparisonTextBlocks: (inputs) => formatBibleComparisonTextBlocks(inputs),
    getComparisonTranslationIds: () => ["b", "a"],
    getTranslationPreviewTitle: (translationId) => translationId.toUpperCase(),
    getComparisonMapping: () => judgesMapping,
    mapReferences: (references) => references,
    getBibleChapterTextBlock: (book, chapter, translationId) => getBibleChapterTextBlock(book, chapter, chapterIndex, translationId),
    getBookIds: () => [7],
    getChapterCount: () => undefined,
  });

  const referenceContent = await chapterAnalyzer.analyzeParagraph("Суд 7:22, 24");
  const referenceBlock = referenceContent.blocks.find((block) => block.type === "reference");
  const chapterTarget = getChapterTargetFromReferences(referenceBlock.references);
  assert.deepStrictEqual(chapterTarget, {
    book: 7,
    chapter: 7,
    highlightedRanges: [{ verseStart: 22, verseEnd: 22 }, { verseStart: 24, verseEnd: 24 }],
  });

  const chapterContent = await chapterAnalyzer.buildChapterContent(chapterTarget);
  assert.strictEqual(chapterContent.chapterView.title, "📖 Суд 7");
  assert.deepStrictEqual(chapterContent.chapterView.previous, { book: 7, chapter: 6 });
  assert.deepStrictEqual(chapterContent.chapterView.next, { book: 7, chapter: 8 });
  assert(chapterContent.plainText.startsWith("📖 Суд 7.\n1 a 7:1"));
  assert(chapterContent.plainText.includes("25 a 7:25"));
  const chapterVerses = chapterContent.blocks
    .filter((block) => block.type === "reference")
    .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.verses));
  assert.strictEqual(chapterVerses.length, 25);
  assert.deepStrictEqual(chapterVerses.filter((verse) => verse.highlighted).map((verse) => verse.number), [22, 24]);

  const nextChapterContent = await chapterAnalyzer.buildChapterContent({ book: 7, chapter: 8, highlightedRanges: [] });
  assert.deepStrictEqual(nextChapterContent.chapterView.previous, { book: 7, chapter: 7 });
  assert.strictEqual(nextChapterContent.chapterView.next, null);

  chapterComparisonEnabled = true;
  const comparisonChapterContent = await chapterAnalyzer.rebuildContent(chapterContent);
  assert.deepStrictEqual(comparisonChapterContent.chapterView, chapterContent.chapterView);
  const comparisonChapterBlock = comparisonChapterContent.blocks.find((block) => block.type === "comparison");
  assert.deepStrictEqual(
    comparisonChapterBlock.translations.map((translation) => [translation.translationName, translation.isMain, translation.referenceTitle]),
    [["B", false, "📖 Суд 7"], ["A", true, "📖 Суд 7"]]
  );
  assert.deepStrictEqual(
    comparisonChapterBlock.translations[0].paragraphs
      .flatMap((paragraph) => paragraph.verses)
      .filter((verse) => verse.highlighted)
      .map((verse) => verse.number),
    [22, 24]
  );
  const comparisonReferenceContent = await chapterAnalyzer.analyzeParagraph("Суд 7:22");
  assert.deepStrictEqual(
    comparisonReferenceContent.blocks[0].translations.map((translation) => translation.isMain),
    [false, true]
  );
  chapterComparisonEnabled = false;

  // Chapter in another translation (the Bible reader): that translation is the main one and titles the chapter
  const chapterInB = await chapterAnalyzer.buildChapterContent({ book: 7, chapter: 7, highlightedRanges: [] }, "b");
  assert.strictEqual(chapterInB.chapterView.translationId, "b");
  assert(chapterInB.plainText.includes("1 b 7:1"));
  assert.strictEqual(chapterContent.chapterView.translationId, "a");
  chapterComparisonEnabled = true;
  const comparisonChapterInB = await chapterAnalyzer.buildChapterContent({ book: 7, chapter: 7, highlightedRanges: [] }, "b");
  assert.deepStrictEqual(
    comparisonChapterInB.blocks.find((block) => block.type === "comparison").translations
      .map((translation) => [translation.translationId, translation.isMain]),
    [["b", true], ["a", false]]
  );
  // Each compared translation carries its passage, so its 📖 opens the chapter in that translation.
  assert.deepStrictEqual(
    comparisonReferenceContent.blocks[0].translations.map((translation) => [translation.translationId, translation.references]),
    [
      ["b", [{ book: 7, chapterStart: 7, verseStart: 22, chapterEnd: 7, verseEnd: 22 }]],
      ["a", [{ book: 7, chapterStart: 7, verseStart: 22, chapterEnd: 7, verseEnd: 22 }]],
    ]
  );
  chapterComparisonEnabled = false;
};
