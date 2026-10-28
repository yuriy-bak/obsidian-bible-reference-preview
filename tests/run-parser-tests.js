const assert = require("assert");
const {
  BibleReferenceParser,
} = require("../.test-build/src/parsing/BibleReferenceParser.js");
const {
  createBookMapping,
  removeChapterNumberFromAlias,
} = require("../.test-build/src/parsing/BookMapping.js");
const DEFAULT_TRANSLATION_ID = "newworld";
const { getBibleChapterTextBlock, getBibleTextBlocks } = require("../.test-build/src/application/getBibleTexts.js");
const {
  findAdjacentChapter,
  getChapterTargetFromReferences,
  isVerseInRanges,
} = require("../.test-build/src/application/BibleChapterNavigation.js");
const {
  backFromBiblePreviewChapter,
  isBiblePreviewChapterModeActive,
  navigateBiblePreviewChapter,
  isBiblePreviewChapterHighlightHidden,
  setBiblePreviewChapterHighlightHidden,
  openBiblePreviewChapter,
  trackShownBiblePreviewContent,
} = require("../.test-build/src/preview-navigation/BiblePreviewChapterFlow.js");
const {
  BiblePreviewAnalyzer,
} = require("../.test-build/src/application/BiblePreviewAnalyzer.js");
const {
  LazyBibleIndexV2,
} = require("../.test-build/src/infrastructure/v2/LazyBibleIndexV2.js");
const {
  createBookMappingFromBibleIndexV2Data,
} = require("../.test-build/src/infrastructure/v2/createBookMappingFromBibleIndexV2Data.js");
const { JSDOM } = require("jsdom");
global.DOMParser = new JSDOM("").window.DOMParser;
const {
  enrichBookTableFromNavigationDocument,
  extractBookNavigationAliasesFromDocument,
  extractBookTableFromDocument,
  extractVersesFromDocument,
} = require("../.test-build/src/infrastructure/sources/jw-epub/jwEpubHtml.js");
const {
  parseXhtmlDocument,
} = require("../.test-build/src/infrastructure/epub/MarkupDocument.js");
const extractBookTableFromHtml = (html) => extractBookTableFromDocument(parseXhtmlDocument(html));
const enrichBookTableFromNavigationHtml = (bookTable, path, html) =>
  enrichBookTableFromNavigationDocument(bookTable, path, parseXhtmlDocument(html));
const extractBookNavigationAliasesFromHtml = (html, bookTable) =>
  extractBookNavigationAliasesFromDocument(parseXhtmlDocument(html), bookTable);
const extractVersesFromHtml = (html) => extractVersesFromDocument(parseXhtmlDocument(html));
const {
  extractBibleTextFromCompactBook,
} = require("../.test-build/src/infrastructure/v2/extractBibleTextFromCompactBook.js");
const {
  formatBibleComparisonTextBlocks,
  formatBibleTextBlocks,
} = require("../.test-build/src/application/formatBibleTexts.js");
const {
  isCssColor,
  normalizeBibleReferenceLinkColor,
  normalizeFloatingPreviewBackgroundColor,
} = require("../.test-build/src/ui/cssColorValidation.js");
const {
  ReferenceUsageIndexService,
  REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES,
  REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
} = require("../.test-build/src/reference-usage/ReferenceUsageIndexService.js");
const {
  createChapterUsageQuery,
  groupReferenceUsagesByChapterVerses,
} = require("../.test-build/src/reference-usage/ReferenceUsageChapterGroups.js");
const { ensureLeafViewLoaded } = require("../.test-build/src/workspace/WorkspaceLeafViewLoading.js");
const JSZip = require("jszip");
const vm = require("vm");
const { readAndValidateEpubFile } = require("../.test-build/src/import/EpubFileValidation.js");
const {
  EPUB_IMPORT_LIMITS,
  normalizeZipPath,
  readContainerOpfPath,
  readZipText,
  resolveZipPath,
  validateZipArchive,
} = require("../.test-build/src/infrastructure/epub/EpubContainerReader.js");
const {
  getSpineXhtmlItems,
  parseOpfDocument,
} = require("../.test-build/src/infrastructure/epub/EpubOpfReader.js");
const {
  EpubImportError,
} = require("../.test-build/src/infrastructure/epub/EpubImportError.js");

(async () => {
  assert.strictEqual(isCssColor("#7c3aed"), true);
  assert.strictEqual(isCssColor("var(--link-color)"), true);
  assert.strictEqual(
    isCssColor("color-mix(in srgb, var(--background-primary) 92%, black 8%)"),
    true
  );
  assert.strictEqual(isCssColor("url(https://example.com/a.png)"), false);
  assert.strictEqual(isCssColor("javascript:alert(1)"), false);
  assert.strictEqual(isCssColor("#7c3aed; color: red"), false);
  assert.strictEqual(isCssColor("{ color: red }"), false);
  assert.strictEqual(isCssColor("#" + "a".repeat(200)), false);
  assert.strictEqual(
    normalizeBibleReferenceLinkColor("url(https://example.com/a.png)"),
    "var(--link-color)"
  );
  assert.strictEqual(
    normalizeFloatingPreviewBackgroundColor("url(https://example.com/a.png)"),
    "color-mix(in srgb, var(--background-primary) 92%, black 8%)"
  );

  const mapping = createBookMapping([
    { id: 43, name: "иоанна", abbreviation: "ин" },
    { id: 45, name: "римлянам", abbreviation: "рим" },
    { id: 41, name: "марка", abbreviation: "мк" },
    {
      id: 46,
      name: "1коринфянам",
      abbreviation: "1кор",
      aliases: ["1 коринфянам", "1 кор"],
    },
    { id: 65, name: "иуды", abbreviation: "иуд", chapterCount: 1 },
  ]);
  const parser = new BibleReferenceParser(mapping);
  assert.strictEqual(parser.parse("Ин3:16").length, 1);
  assert.strictEqual(parser.parse("1 Кор 13:4").length, 1);
  assert.deepStrictEqual(parser.parse("Иуд6"), [
    { book: 65, chapterStart: 1, verseStart: 6, chapterEnd: 1, verseEnd: 6 },
  ]);
  // One-chapter books also accept "1:N"; another chapter number is not a reference.
  const judeVerses = (...ranges) => ranges.map(([verseStart, verseEnd]) => ({
    book: 65, chapterStart: 1, verseStart, chapterEnd: 1, verseEnd,
  }));
  assert.deepStrictEqual(parser.parse("Иуд 1:5"), judeVerses([5, 5]));
  assert.deepStrictEqual(parser.parse("Иуды 1:5-7"), judeVerses([5, 7]));
  assert.deepStrictEqual(parser.parse("Иуд 1:3,5"), judeVerses([3, 3], [5, 5]));
  assert.deepStrictEqual(parser.parse("Иуд 1:3;1:5"), judeVerses([3, 3], [5, 5]));
  assert.deepStrictEqual(parser.parse("Иуд 5"), judeVerses([5, 5]));
  assert.deepStrictEqual(parser.parse("Иуд 2:3"), []);
  assert.deepStrictEqual(parser.parse("Иуд 12:3"), []);
  const englishJudeParser = new BibleReferenceParser(
    createBookMapping([{ id: 65, name: "jude", abbreviation: "jude", chapterCount: 1 }])
  );
  assert.deepStrictEqual(englishJudeParser.parse("Jude 1:5"), judeVerses([5, 5]));

  const twoChapterJudeParser = new BibleReferenceParser(
    createBookMapping([
      { id: 65, name: "иуды", abbreviation: "иуд", chapterCount: 2 },
    ])
  );
  assert.strictEqual(twoChapterJudeParser.parse("Иуд6").length, 0);

  const conflictingAliasParser = new BibleReferenceParser(
    createBookMapping([
      { id: 43, name: "иоанна", abbreviation: "ин", aliases: ["общ"] },
      { id: 45, name: "римлянам", abbreviation: "рим", aliases: ["общ"] },
    ])
  );
  assert.strictEqual(conflictingAliasParser.parse("общ 1:1").length, 0);

  const matchSample = "Смотри Ин. 3:16-18 и Рим 8:28.";
  const matches = parser.parseMatches(matchSample);
  assert.strictEqual(matches.length, 2);
  assert.strictEqual(matches[0].text, "Ин. 3:16-18");
  assert.strictEqual(
    matchSample.slice(matches[0].from, matches[0].to),
    "Ин. 3:16-18"
  );
  assert.strictEqual(matches[1].text, "Рим 8:28");
  assert.strictEqual(
    matchSample.slice(matches[1].from, matches[1].to),
    "Рим 8:28"
  );
  const index = {
    async getBibleText() {
      return {
        translationId: DEFAULT_TRANSLATION_ID,
        book: 43,
        bookName: "Ин",
        chapter: 3,
        verses: [{ number: 16, text: "Текст Ин 3:16", footnotes: [] }],
      };
    },
  };
  const blocks = await getBibleTextBlocks(
    parser.parse("Ин 3:16"),
    index,
    DEFAULT_TRANSLATION_ID
  );
  assert.strictEqual(blocks.length, 1);

  const metadata = {
    version: 2,
    translations: {
      [DEFAULT_TRANSLATION_ID]: {
        name: "synthetic",
        language: "ru",
        sourceFileName: "synthetic.epub",
        importedAt: "2026-01-01T00:00:00.000Z",
        books: {
          1: {
            name: "Бытие",
            abbreviation: "Бт",
            aliases: ["Бытие", "Бт", "Быт"],
            path: "translations/newworld/books/1.json",
          },
          43: {
            name: "Иоанна",
            abbreviation: "Ин",
            aliases: ["Иоанна", "Ин", "Иоан"],
            path: "translations/newworld/books/43.json",
            chapterCount: 21,
          },
          19: {
            name: "Псалмы",
            abbreviation: "Пс",
            aliases: ["Псалмы", "Пс"],
            path: "translations/newworld/books/19.json",
            chapterCount: 150,
          },
          23: {
            name: "Исайя",
            abbreviation: "Иса",
            aliases: ["Исайя", "Иса"],
            path: "translations/newworld/books/23.json",
            chapterCount: 66,
          },
          46: {
            name: "1 Коринфянам",
            abbreviation: "1Кор",
            aliases: ["1 Коринфянам", "1Кор", "1 Кр"],
            path: "translations/newworld/books/46.json",
            chapterCount: 16,
          },
          65: {
            name: "Иуды",
            abbreviation: "Иуд",
            aliases: ["Иуды", "Иуд"],
            path: "translations/newworld/books/65.json",
            chapterCount: 1,
          },
          66: {
            name: "Откровение",
            abbreviation: "Отк",
            aliases: ["Откровение", "Отк"],
            path: "translations/newworld/books/66.json",
            chapterCount: 22,
          },
        },
      },
    },
  };
  const importedParser = new BibleReferenceParser(
    createBookMappingFromBibleIndexV2Data(metadata, DEFAULT_TRANSLATION_ID)
  );

  for (const sample of [
    "Ин1:2",
    "Ин 1:2",
    "Иоан1:2",
    "Иоан.1:2",
    "1Кор1:1",
    "1 Кор1:1",
    "1Кр1:1",
    "1 Кр1:1",
    "Быт1:1",
    "Бт1:1",
    "Отк21:4",
    "Иуд6",
  ]) {
    assert(
      importedParser.parse(sample).length > 0,
      `Expected parser to recognize ${sample}`
    );
  }
  
  assert.deepStrictEqual(importedParser.parse("Псалом 23:1"), [
    { book: 19, chapterStart: 23, verseStart: 1, chapterEnd: 23, verseEnd: 1 },
  ]);

  assert.deepStrictEqual(importedParser.parse("Исаия 53:5"), [
    { book: 23, chapterStart: 53, verseStart: 5, chapterEnd: 53, verseEnd: 5 },
  ]);

  // Navigation links "<book> <chapter>" must not become aliases: "Иов 14:1" != "Иов 1" + "4:1".
  assert.deepStrictEqual(
    ["Иов", "Иов 1", "Иов12", "1 Цар", "1 Цар 1", "Eyüp 1", "أيوب ١"].map(removeChapterNumberFromAlias),
    ["Иов", "Иов", "Иов", "1 Цар", "1 Цар", "Eyüp", "أيوب"]
  );
  const chapterAliasParser = new BibleReferenceParser(
    createBookMapping([
      { id: 18, name: "Иов", abbreviation: "Иов", aliases: ["Иов", "Иов 1", "Иов 2"], chapterCount: 42 },
      { id: 9, name: "1 Царств", abbreviation: "1Цар", aliases: ["1 Царств", "1Цар", "1 Цар 1"], chapterCount: 31 },
      { id: 65, name: "Иуды", abbreviation: "Иуд", aliases: ["Иуды", "Иуд", "Иуд 1"], chapterCount: 1 },
      { id: 19, name: "Псалмы", abbreviation: "Пс", aliases: ["Пс", "Psalm 1"], chapterCount: 150 },
    ])
  );
  // Real index entry: the chapter number also ended up in the book name.
  const chapterNameParser = new BibleReferenceParser(
    createBookMapping([
      { id: 18, name: "Иов 1", abbreviation: "Иов", aliases: ["Иов 1", "Иов"], chapterCount: 42 },
    ])
  );
  assert.deepStrictEqual(chapterNameParser.parse("Иов 14:1"), [
    { book: 18, chapterStart: 14, verseStart: 1, chapterEnd: 14, verseEnd: 1 },
  ]);
  const singleVerse = (book, chapter, verse) => [
    { book, chapterStart: chapter, verseStart: verse, chapterEnd: chapter, verseEnd: verse },
  ];
  assert.deepStrictEqual(chapterAliasParser.parse("Иов 14:1"), singleVerse(18, 14, 1));
  assert.deepStrictEqual(chapterAliasParser.parse("Иов14:1"), singleVerse(18, 14, 1));
  assert.deepStrictEqual(chapterAliasParser.parse("Иов 1:5"), singleVerse(18, 1, 5));
  assert.deepStrictEqual(chapterAliasParser.parse("Иов 21:3"), singleVerse(18, 21, 3));
  assert.deepStrictEqual(chapterAliasParser.parse("1 Цар 15:22"), singleVerse(9, 15, 22));
  assert.deepStrictEqual(chapterAliasParser.parse("Иуд 14"), singleVerse(65, 1, 14));
  assert.deepStrictEqual(chapterAliasParser.parse("Иуд 1:14"), singleVerse(65, 1, 14));
  assert.deepStrictEqual(chapterAliasParser.parse("Psalm 14:1"), singleVerse(19, 14, 1));

  let loadCount = 0;
  const lazy = new LazyBibleIndexV2(metadata, {
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
  const rangeIndex = new LazyBibleIndexV2(metadata, {
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

  const nonRussianRows = Array.from({ length: 66 }, (_unused, index) => {
    const bookNumber = String(index + 1).padStart(2, "0");
    return `<tr><td><a href="10010611${bookNumber}.xhtml">Kitap ${
      index + 1
    }</a></td><td></td><td>K${index + 1}</td></tr>`;
  }).join("");
  const nonRussianBookTable = extractBookTableFromHtml(
    `<table>${nonRussianRows}</table>`
  );
  assert(
    nonRussianBookTable !== null,
    "Expected non-Russian 66-book table to be accepted"
  );
  assert.strictEqual(nonRussianBookTable.books[0].name, "Kitap 1");

  const oldBibleNavigationHtml = `<p>${Array.from(
    { length: 66 },
    (_unused, index) => {
      const bookId = String(index + 1).padStart(2, "0");
      return `<a href="BIBLE_${bookId}.xhtml">B${bookId}</a>`;
    }
  ).join(" ")}</p>`;
  const oldBibleNavigationTable = extractBookTableFromHtml(
    oldBibleNavigationHtml
  );
  assert(
    oldBibleNavigationTable !== null,
    "Expected old BIBLE_00 navigation without hardcoded book names to be accepted"
  );
  assert.strictEqual(oldBibleNavigationTable.books.length, 66);
  assert.strictEqual(oldBibleNavigationTable.hrefToBookId["BIBLE_01.xhtml"], 1);
  enrichBookTableFromNavigationHtml(
    oldBibleNavigationTable,
    "OEBPS/BIBLE_01.xhtml",
    "<html><head><title>First Book From EPUB (Navigation)</title></head><body><a href='05_BOOK.xhtml#chapter1_verse1'>1</a></body></html>"
  );
  assert.strictEqual(
    oldBibleNavigationTable.books[0].name,
    "First Book From EPUB"
  );
  assert.strictEqual(oldBibleNavigationTable.hrefToBookId["05_BOOK.xhtml"], 1);

  enrichBookTableFromNavigationHtml(
    oldBibleNavigationTable,
    "OEBPS/BIBLE_66.xhtml",
    "<html><head><title>Last Book From EPUB (Navigation)</title></head><body><a href='05_BOOK.xhtml#chapter1_verse1'>1</a></body></html>"
  );
  assert.strictEqual(oldBibleNavigationTable.hrefToBookId["05_BOOK.xhtml"], 1);

  const scriptureReferenceAliases = extractBookNavigationAliasesFromHtml(
    "<p><a href='05_BOOK.xhtml#chapter3_verse34'>Иоанн 3:34-4:1</a></p>",
    oldBibleNavigationTable
  );
  assert.deepStrictEqual(scriptureReferenceAliases, {});

  const aliases =
    metadata.translations[DEFAULT_TRANSLATION_ID].books["1"].aliases;
  assert(
    !aliases.some(
      (alias) =>
        alias.startsWith("^") ||
        alias.includes(":") ||
        alias.includes(";") ||
        alias === "1"
    )
  );

  const paragraphHtml = `
        <p><span id="chapter2_verse7"></span><strong><sup>7</sup></strong>Первый<span id="footnotesource1"></span><a epub:type="noteref" href="#footnote1">*</a>. <span id="chapter2_verse8"></span><strong><sup>8</sup></strong>Второй.</p>
        <p><span id="chapter2_verse9"></span><strong><sup>9</sup></strong>Третий.</p>
        <p><span id="chapter2_verse10"></span><strong><sup>10</sup></strong>Строка 1<br/>Строка 2</p>
        <div class="groupFootnote"><div id="footnote1"><p><a href="#footnotesource1">^ Быт. 2:7</a> Сноска.</p></div></div>
    `;
  const extractedVerses = extractVersesFromHtml(paragraphHtml);
  assert.strictEqual(extractedVerses[0].paragraphStart, true);
  assert.strictEqual(extractedVerses[1].paragraphStart, false);
  assert.strictEqual(extractedVerses[2].paragraphStart, true);
  assert.strictEqual(extractedVerses[0].text, "Первый*.");
  assert.deepStrictEqual(extractedVerses[0].footnotes, ["Сноска."]);
  assert.strictEqual(extractedVerses[3].text, "Строка 1\nСтрока 2");

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

  const formatterMapping = createBookMapping([
    { id: 1, name: "Бытие", abbreviation: "Бт" },
    { id: 43, name: "Иоанна", abbreviation: "Ин" },
  ]);
  const formattedInline = formatBibleTextBlocks(
    [
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 7,
          chapterEnd: 2,
          verseEnd: 9,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 9 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [
                {
                  number: 7,
                  text: "Первый",
                  footnotes: ["Сноска 7"],
                  paragraphStart: true,
                },
                {
                  number: 8,
                  text: "Второй",
                  footnotes: [],
                  paragraphStart: false,
                },
                {
                  number: 9,
                  text: "Третий",
                  footnotes: [],
                  paragraphStart: true,
                },
              ],
            },
          },
        ],
        sourceText: "Бт 2:7-9",
      },
    ],
    formatterMapping
  );
  assert(
    formattedInline.plainText.includes(
      "📖 Бт 2:7-9.\n7 Первый 8 Второй\n\n9 Третий"
    )
  );
  assert(formattedInline.plainText.includes("^Бт 2:7 Сноска 7"));

  const formattedSameChapter = formatBibleTextBlocks(
    [
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 1,
          chapterEnd: 2,
          verseEnd: 5,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 1, verseEnd: 5 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [1, 2, 3, 4, 5].map((number) => ({
                number,
                text: `t${number}`,
                footnotes: [],
                paragraphStart: true,
              })),
            },
          },
        ],
        sourceText: "Бт 2:1-5, 7, 8, 12-15",
      },
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 7,
          chapterEnd: 2,
          verseEnd: 8,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 8 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [7, 8].map((number) => ({
                number,
                text: `t${number}`,
                footnotes: [],
                paragraphStart: true,
              })),
            },
          },
        ],
        sourceText: "Бт 2:1-5, 7, 8, 12-15",
      },
    ],
    formatterMapping
  );
  assert(
    formattedSameChapter.plainText.startsWith("📖 Бт 2:1-5, 7, 8, 12-15.\n")
  );

  const formattedDifferentBooks = formatBibleTextBlocks(
    [
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 7,
          chapterEnd: 2,
          verseEnd: 7,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 7 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [
                {
                  number: 7,
                  text: "Бытие",
                  footnotes: [],
                  paragraphStart: true,
                },
              ],
            },
          },
        ],
      },
      {
        reference: {
          book: 43,
          chapterStart: 3,
          verseStart: 16,
          chapterEnd: 3,
          verseEnd: 16,
        },
        parts: [
          {
            range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 43,
              bookName: "Иоанна",
              chapter: 3,
              verses: [
                {
                  number: 16,
                  text: "Иоанна",
                  footnotes: [],
                  paragraphStart: true,
                },
              ],
            },
          },
        ],
      },
    ],
    formatterMapping
  );
  assert(formattedDifferentBooks.plainText.includes("__________"));

  assert.deepStrictEqual(parser.parse("Мк 4:12, 14-16"), [
    { book: 41, chapterStart: 4, verseStart: 12, chapterEnd: 4, verseEnd: 12 },
    { book: 41, chapterStart: 4, verseStart: 14, chapterEnd: 4, verseEnd: 16 },
  ]);

  const proseDashMatches = parser.parseMatches("Мк12:30 - 4 понятия.");
  assert.strictEqual(proseDashMatches.length, 1);
  assert.strictEqual(proseDashMatches[0].text, "Мк12:30");
  assert.deepStrictEqual(proseDashMatches[0].references, [
    {
      book: 41,
      chapterStart: 12,
      verseStart: 30,
      chapterEnd: 12,
      verseEnd: 30,
    },
  ]);

  const turkishFormatterMapping = createBookMapping([
    { id: 43, name: "Yuhanna", abbreviation: "Yhn" },
  ]);

  const comparisonContent = formatBibleComparisonTextBlocks(
    [
      {
        title: "Ин 3:16",
        references: [
          {
            book: 43,
            chapterStart: 3,
            verseStart: 16,
            chapterEnd: 3,
            verseEnd: 16,
          },
        ],
        translations: [
          {
            translationName: "Translation A",
            mapping: formatterMapping,
            blocks: [
              {
                reference: {
                  book: 43,
                  chapterStart: 3,
                  verseStart: 16,
                  chapterEnd: 3,
                  verseEnd: 16,
                },
                parts: [
                  {
                    range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 },
                    bibleText: {
                      translationId: "a",
                      book: 43,
                      bookName: "Иоанна",
                      chapter: 3,
                      verses: [
                        {
                          number: 16,
                          text: "Text A",
                          footnotes: ["Footnote A"],
                          paragraphStart: true,
                        },
                      ],
                    },
                  },
                ],
                sourceText: "Ин 3:16",
              },
            ],
          },
          {
            translationName: "Translation B",
            mapping: turkishFormatterMapping,
            blocks: [
              {
                reference: {
                  book: 43,
                  chapterStart: 3,
                  verseStart: 16,
                  chapterEnd: 3,
                  verseEnd: 16,
                },
                parts: [
                  {
                    range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 },
                    bibleText: {
                      translationId: "b",
                      book: 43,
                      bookName: "Иоанна",
                      chapter: 3,
                      verses: [
                        {
                          number: 16,
                          text: "Text B",
                          footnotes: [],
                          paragraphStart: true,
                        },
                      ],
                    },
                  },
                ],
                sourceText: "Ин 3:16",
              },
            ],
          },
        ],
      },
    ],
    formatterMapping
  );
  assert(comparisonContent.plainText.includes("📖 Ин 3:16."));
  assert(comparisonContent.plainText.includes("[Translation A]\n📖 Ин 3:16.\n16 Text A"));
  assert(comparisonContent.plainText.includes("^Ин 3:16 Footnote A"));
  assert(comparisonContent.plainText.includes("[Translation B]\n📖 Yhn 3:16.\n16 Text B"));

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
      formatBibleComparisonTextBlocks(inputs, judgesMapping),
    getComparisonTranslationIds: () => ["a", "b"],
    getTranslationPreviewTitle: (translationId) => translationId.toUpperCase(),
    getComparisonMapping: () => judgesMapping,
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
    formatBibleComparisonTextBlocks: (inputs) => formatBibleComparisonTextBlocks(inputs, judgesMapping),
    getComparisonTranslationIds: () => ["b", "a"],
    getTranslationPreviewTitle: (translationId) => translationId.toUpperCase(),
    getComparisonMapping: () => judgesMapping,
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

  // Chapter view: open, navigate, go back
  let chapterState = null;
  const shownContents = [];
  const chapterFlowInput = {
    getState: () => chapterState,
    setState: (state) => { chapterState = state; },
    buildChapterContent: (target) => chapterAnalyzer.buildChapterContent(target),
    showBiblePreviewContent: (content) => {
      chapterState = trackShownBiblePreviewContent(chapterState, content);
      shownContents.push(content);
    },
  };
  await openBiblePreviewChapter(chapterFlowInput, chapterTarget, referenceContent, 120);
  const openedChapter = shownContents[shownContents.length - 1];
  assert.strictEqual(openedChapter.chapterView.chapter, 7);
  assert(isBiblePreviewChapterModeActive(chapterState, openedChapter));
  assert(!isBiblePreviewChapterModeActive(chapterState, referenceContent));
  assert.strictEqual(isBiblePreviewChapterHighlightHidden(chapterState), false);
  setBiblePreviewChapterHighlightHidden(chapterFlowInput, true);
  assert.strictEqual(isBiblePreviewChapterHighlightHidden(chapterState), true);

  await navigateBiblePreviewChapter(chapterFlowInput, openedChapter.chapterView.next);
  assert.strictEqual(isBiblePreviewChapterHighlightHidden(chapterState), true);
  const navigatedChapter = shownContents[shownContents.length - 1];
  assert.strictEqual(navigatedChapter.chapterView.chapter, 8);
  assert.deepStrictEqual(navigatedChapter.chapterView.highlightedRanges, []);
  assert(isBiblePreviewChapterModeActive(chapterState, navigatedChapter));

  await navigateBiblePreviewChapter(chapterFlowInput, navigatedChapter.chapterView.previous);
  assert.deepStrictEqual(shownContents[shownContents.length - 1].chapterView.highlightedRanges, chapterTarget.highlightedRanges);
  assert.strictEqual(isBiblePreviewChapterHighlightHidden(chapterState), true);

  backFromBiblePreviewChapter(chapterFlowInput);
  const returnedContent = shownContents[shownContents.length - 1];
  assert.strictEqual(returnedContent.plainText, referenceContent.plainText);
  assert.strictEqual(returnedContent.scrollTop, 120);
  assert.strictEqual(chapterState, null);

  assert.strictEqual(isBiblePreviewChapterHighlightHidden(chapterState), false);
  setBiblePreviewChapterHighlightHidden(chapterFlowInput, true);
  assert.strictEqual(chapterState, null);

  await openBiblePreviewChapter(chapterFlowInput, chapterTarget, referenceContent, 0);
  assert.strictEqual(isBiblePreviewChapterHighlightHidden(chapterState), false);
  chapterFlowInput.showBiblePreviewContent(referenceContent);
  assert.strictEqual(chapterState, null);

  global.window = global.window || global;

  function createReferenceUsageTestFile(path, size, mtime) {
    const extension = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : "";
    return { path, extension, stat: { size, mtime } };
  }

  function createReferenceUsageTestApp(fileContents) {
    const writes = new Map();
    const directories = new Set();
    const readPaths = [];
    return {
      writes,
      directories,
      readPaths,
      vault: {
        async cachedRead(file) {
          readPaths.push(file.path);
          return fileContents[file.path] || "";
        },
        adapter: {
          async exists(path) {
            return writes.has(path) || directories.has(path);
          },
          async read(path) {
            return writes.get(path) || "";
          },
          async write(path, content) {
            writes.set(path, content);
          },
          async mkdir(path) {
            directories.add(path);
          },
        },
      },
    };
  }

  function createReferenceUsageTestParseMatches(text) {
    const definitions = [
      { sourceText: "Ин 3:16", book: 43, chapter: 3, verse: 16 },
      { sourceText: "Ин 3:17", book: 43, chapter: 3, verse: 17 },
      { sourceText: "Рим 8:28", book: 45, chapter: 8, verse: 28 },
    ];
    return definitions.flatMap((definition) => {
      const from = text.indexOf(definition.sourceText);
      if (from < 0) {
        return [];
      }
      return [
        {
          text: definition.sourceText,
          from,
          to: from + definition.sourceText.length,
          references: [
            {
              book: definition.book,
              chapterStart: definition.chapter,
              verseStart: definition.verse,
              chapterEnd: definition.chapter,
              verseEnd: definition.verse,
            },
          ],
        },
      ];
    });
  }

  const referenceUsageFiles = [
    createReferenceUsageTestFile("notes/one.md", 100, 1),
    createReferenceUsageTestFile("notes/large.md", REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1, 2),
    createReferenceUsageTestFile("archive/old.md", 100, 3),
    createReferenceUsageTestFile("data/bible/reference.md", 100, 4),
    createReferenceUsageTestFile("notes/plain.txt", 100, 5),
  ];
  const referenceUsageApp = createReferenceUsageTestApp({
    "notes/one.md": "Intro\nИн 3:16 and Рим 8:28",
    "notes/large.md": "Ин 3:17",
    "archive/old.md": "Ин 3:17",
    "data/bible/reference.md": "Ин 3:17",
    "notes/plain.txt": "Ин 3:17",
  });
  const referenceUsageService = new ReferenceUsageIndexService(
    referenceUsageApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => ["archive"]
  );
  const referenceUsageBuildResult = await referenceUsageService.build(referenceUsageFiles, true);
  assert.strictEqual(referenceUsageBuildResult.fileCount, 1);
  assert.strictEqual(referenceUsageBuildResult.referenceCount, 2);
  assert.strictEqual(referenceUsageBuildResult.updatedFileCount, 1);
  assert.strictEqual(referenceUsageBuildResult.skippedLargeFileCount, 1);
  assert.strictEqual(
    referenceUsageBuildResult.maxFileSizeBytes,
    REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES
  );
  assert.deepStrictEqual(referenceUsageApp.readPaths, ["notes/one.md"]);
  assert(referenceUsageApp.writes.has("data/bible/reference-usage-index.json"));

  const referenceUsageMobileLimitApp = createReferenceUsageTestApp({
    "notes/mobile-small.md": "Ин 3:16",
    "notes/mobile-large.md": "Ин 3:17",
  });
  const referenceUsageMobileLimitService = new ReferenceUsageIndexService(
    referenceUsageMobileLimitApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => [],
    {
      maxMarkdownFileSizeBytes: REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
      buildYieldEveryFiles: 1,
    }
  );
  const referenceUsageMobileLimitResult = await referenceUsageMobileLimitService.build([
    createReferenceUsageTestFile("notes/mobile-small.md", REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES, 7),
    createReferenceUsageTestFile("notes/mobile-large.md", REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1, 8),
  ], true);
  assert.strictEqual(referenceUsageMobileLimitResult.fileCount, 1);
  assert.strictEqual(referenceUsageMobileLimitResult.skippedLargeFileCount, 1);
  assert.strictEqual(
    referenceUsageMobileLimitResult.maxFileSizeBytes,
    REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES
  );
  assert.deepStrictEqual(referenceUsageMobileLimitApp.readPaths, ["notes/mobile-small.md"]);

  const referenceUsageStats = referenceUsageService.getStats();
  assert.strictEqual(referenceUsageStats.fileCount, 1);
  assert.strictEqual(referenceUsageStats.referenceCount, 2);
  assert.strictEqual(referenceUsageStats.indexPath, "data/bible/reference-usage-index.json");

  const referenceUsageResults = referenceUsageService.findUsages([
    { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 },
  ]);
  assert.strictEqual(referenceUsageResults.length, 1);
  assert.strictEqual(referenceUsageResults[0].filePath, "notes/one.md");
  assert.strictEqual(referenceUsageResults[0].sourceText, "Ин 3:16");
  assert.strictEqual(referenceUsageResults[0].line, 2);
  assert.strictEqual(referenceUsageResults[0].excerpt, "Ин 3:16 and Рим 8:28");

  const referenceUsageOpenNoteApp = createReferenceUsageTestApp({});
  const referenceUsageOpenNoteService = new ReferenceUsageIndexService(
    referenceUsageOpenNoteApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => ["archive"]
  );
  const referenceUsageOpenNoteFile = createReferenceUsageTestFile("notes/open.md", 100, 9);
  const referenceUsageJohn316Query = [{ book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 }];
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft"), false);
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft Ин 3:16"), true);
  assert.strictEqual(referenceUsageOpenNoteService.findUsages(referenceUsageJohn316Query).length, 1);
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft Ин 3:16"), false);
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft"), true);
  assert.strictEqual(referenceUsageOpenNoteService.findUsages(referenceUsageJohn316Query).length, 0);
  assert.strictEqual(
    referenceUsageOpenNoteService.syncOpenFileContent(createReferenceUsageTestFile("archive/open.md", 100, 10), "Ин 3:16"),
    false
  );
  assert.deepStrictEqual(referenceUsageOpenNoteApp.readPaths, []);
  referenceUsageOpenNoteService.clearPendingSave();

  const referenceUsageExcerptPrefix = "012345678901234567890123456789abcdef";
  const referenceUsageExcerptSuffix = "0123456789".repeat(16);
  referenceUsageApp.vault.cachedRead = async (file) => {
    referenceUsageApp.readPaths.push(file.path);
    if (file.path === "notes/excerpt.md") {
      return `${referenceUsageExcerptPrefix} Ин 3:16 ${referenceUsageExcerptSuffix}`;
    }
    return "Ин 3:17";
  };
  await referenceUsageService.updateFile(createReferenceUsageTestFile("notes/excerpt.md", 100, 9));
  const referenceUsageExcerptResults = referenceUsageService.findUsages([
    { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 },
  ]);
  const referenceUsageExcerptResult = referenceUsageExcerptResults.find((result) => result.filePath === "notes/excerpt.md");
  assert(referenceUsageExcerptResult !== undefined);
  assert.strictEqual(
    referenceUsageExcerptResult.excerpt,
    `…78901234567890123456789abcdef Ин 3:16 ${referenceUsageExcerptSuffix.slice(0, 139)}…`
  );

  const referenceUsageUpdateFile = createReferenceUsageTestFile("notes/update.md", 100, 6);
  referenceUsageApp.vault.cachedRead = async (file) => {
    referenceUsageApp.readPaths.push(file.path);
    return "Ин 3:17";
  };
  await referenceUsageService.updateFile(referenceUsageUpdateFile);
  assert.strictEqual(referenceUsageService.getStats().fileCount, 3);
  referenceUsageUpdateFile.stat.size = REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1;
  await referenceUsageService.updateFile(referenceUsageUpdateFile);
  assert.strictEqual(referenceUsageService.getStats().fileCount, 2);
  assert.strictEqual(
    referenceUsageService.findUsages([
      { book: 43, chapterStart: 3, verseStart: 17, chapterEnd: 3, verseEnd: 17 },
    ]).length,
    0
  );
  referenceUsageService.clearPendingSave();

  // A file picked in another window returns an ArrayBuffer from that realm; JSZip must still accept it.
  const foreignZipBytes = await new JSZip().file("a.txt", "x").generateAsync({ type: "uint8array" });
  const foreignBuffer = vm.runInNewContext("new ArrayBuffer(length)", { length: foreignZipBytes.byteLength });
  new Uint8Array(foreignBuffer).set(foreignZipBytes);
  assert(!(foreignBuffer instanceof ArrayBuffer));
  const foreignFile = { name: "foreign.epub", size: foreignBuffer.byteLength, arrayBuffer: async () => foreignBuffer };
  const realmContent = await readAndValidateEpubFile(foreignFile, (key) => key);
  assert(realmContent instanceof ArrayBuffer);
  assert((await JSZip.loadAsync(realmContent)).file("a.txt") !== null);

  // On unload a scheduled save is written right away, not dropped.
  referenceUsageApp.writes.clear();
  assert.strictEqual(referenceUsageService.removeFile("notes/one.md"), true);
  assert.strictEqual(referenceUsageService.removeFile("notes/one.md"), false);
  referenceUsageService.flushPendingSave();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(referenceUsageApp.writes.get("data/bible/reference-usage-index.json").length > 0);
  await referenceUsageService.clear();
  assert.deepStrictEqual(referenceUsageService.getStats(), {
    fileCount: 0,
    referenceCount: 0,
    updatedAt: referenceUsageService.getStats().updatedAt,
    indexPath: "data/bible/reference-usage-index.json",
  });

  function assertEpubImportError(action, expectedMessagePart) {
    assert.throws(action, (error) => {
      assert(error instanceof EpubImportError);
      assert(error.message.includes(expectedMessagePart));
      return true;
    });
  }

  async function assertEpubImportErrorAsync(action, expectedMessagePart) {
    await assert.rejects(action, (error) => {
      assert(error instanceof EpubImportError);
      assert(error.message.includes(expectedMessagePart));
      return true;
    });
  }

  assert.strictEqual(normalizeZipPath("OPS/./Text//chapter.xhtml"), "OPS/Text/chapter.xhtml");
  assertEpubImportError(() => normalizeZipPath("../evil.xhtml"), "path traversal");
  assertEpubImportError(() => normalizeZipPath("/evil.xhtml"), "must not be absolute");
  assertEpubImportError(() => normalizeZipPath("C:/evil.xhtml"), "must not be absolute");
  assertEpubImportError(() => normalizeZipPath("OPS\\evil.xhtml"), "backslash");
  assert.strictEqual(
    resolveZipPath("OPS/content.opf", "Text/chapter.xhtml"),
    "OPS/Text/chapter.xhtml"
  );
  assert.strictEqual(
    resolveZipPath("OPS/package/content.opf", "../Text/chapter.xhtml"),
    "OPS/Text/chapter.xhtml"
  );
  assertEpubImportError(() => resolveZipPath("OPS/content.opf", "../../evil.xhtml"), "escapes archive root");
  assertEpubImportError(() => resolveZipPath("OPS/content.opf", "/evil.xhtml"), "must be relative");
  assertEpubImportError(() => resolveZipPath("OPS/content.opf", "OPS\\evil.xhtml"), "backslash");

  const zipEntryLimitFiles = {};
  for (let index = 0; index < EPUB_IMPORT_LIMITS.maxZipEntries + 1; index += 1) {
    zipEntryLimitFiles[`file-${index}.xhtml`] = { name: `file-${index}.xhtml` };
  }
  assertEpubImportError(
    () => validateZipArchive({ files: zipEntryLimitFiles }),
    "too many entries"
  );
  assertEpubImportError(
    () => validateZipArchive({ files: { bad: { name: "OPS\\bad.xhtml" } } }),
    "backslash"
  );

  const validZip = new JSZip();
  validZip.file(
    "META-INF/container.xml",
    "<container><rootfiles><rootfile full-path='OPS/content.opf' /></rootfiles></container>"
  );
  validZip.file("OPS/content.opf", "<package><metadata><dc:title>Test</dc:title></metadata></package>");
  validateZipArchive(validZip);
  assert.strictEqual(await readContainerOpfPath(validZip), "OPS/content.opf");
  assert((await readZipText(validZip, "OPS/content.opf")).includes("package"));

  const missingContainerRootZip = new JSZip();
  missingContainerRootZip.file("META-INF/container.xml", "<container></container>");
  await assertEpubImportErrorAsync(
    () => readContainerOpfPath(missingContainerRootZip),
    "does not contain OPF rootfile path"
  );
  await assertEpubImportErrorAsync(
    () => readZipText(new JSZip(), "OPS/missing.opf"),
    "file not found"
  );
  await assertEpubImportErrorAsync(
    () => readZipText(
      {
        file() {
          return {
            _data: { uncompressedSize: EPUB_IMPORT_LIMITS.maxXmlTextBytes + 1 },
            async() {
              return "";
            },
          };
        },
      },
      "OPS/large.opf"
    ),
    "file is too large"
  );
  await assertEpubImportErrorAsync(
    () => readZipText(
      {
        file() {
          return {
            async() {
              return "a".repeat(EPUB_IMPORT_LIMITS.maxXmlTextBytes + 1);
            },
          };
        },
      },
      "OPS/large-after-decompression.opf"
    ),
    "too large after decompression"
  );

  const parsedOpf = parseOpfDocument(
    "<package><manifest>\u003citem id='nav' href='nav.xhtml' media-type='application/xhtml+xml' /\u003e\u003citem id='style' href='style.css' media-type='text/css' /\u003e</manifest><spine><itemref idref='nav' /><itemref idref='missing' /></spine></package>"
  );
  assert.strictEqual(parsedOpf.manifestItems.length, 2);
  assert.strictEqual(parsedOpf.spineItems.length, 2);
  assert.deepStrictEqual(getSpineXhtmlItems(parsedOpf), [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml" },
  ]);
  assert.deepStrictEqual(parseOpfDocument("<package></package>"), {
    manifestItems: [],
    spineItems: [],
  });


  // XHTML parsed as XML: self-closing markers, namespaces, entities and footnotes behave as in HTML.
  const xhtmlVerses = extractVersesFromHtml(`<?xml version="1.0" encoding="utf-8" ?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Test</title></head><body>
<p><span id="chapter2_verse7"/><strong><sup>7</sup></strong>Первый<span id="footnotesource1"/><a epub:type="noteref" href="#footnote1">*</a>. <span id="chapter2_verse8"/><strong><sup>8</sup></strong>Второй&#x2014;&#160;&amp; «третий».</p>
<p><span id="chapter2_verse9"/><span class="w_ch"><strong>2</strong> </span>Строка 1<br/>Строка 2</p>
<div class="groupFootnote"><aside epub:type="footnote"><div epub:type="footnote" id="footnote1"><p><a href="#footnotesource1">^ <span class="footnoteref">Быт. 2:7</span></a> Сноска &amp; текст.</p></div></aside></div>
</body></html>`);
  assert.deepStrictEqual(xhtmlVerses, [
    { chapter: 2, verse: 7, text: "Первый*.", footnotes: ["Сноска & текст."], paragraphStart: true },
    { chapter: 2, verse: 8, text: "Второй— & «третий».", footnotes: [], paragraphStart: false },
    { chapter: 2, verse: 9, text: "Строка 1\nСтрока 2", footnotes: [], paragraphStart: true },
  ]);

  const {
    JwEpubBibleSource,
  } = require("../.test-build/src/infrastructure/sources/jw-epub/JwEpubBibleSource.js");
  const {
    selectBibleSource,
    createBibleSources,
  } = require("../.test-build/src/infrastructure/sources/BibleSourceRegistry.js");
  const {
    isBibleImportAbortError,
  } = require("../.test-build/src/infrastructure/sources/BibleImportCancellation.js");

  async function createJwLikeEpub(spineHrefs) {
    const zip = new JSZip();
    zip.file("META-INF/container.xml", `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    const manifest = spineHrefs.map((href, index) => `<item id="doc${index}" href="${href}" media-type="application/xhtml+xml"/>`).join("");
    const spine = spineHrefs.map((_href, index) => `<itemref idref="doc${index}"/>`).join("");
    zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test &amp; Bible</dc:title><dc:language>en_US</dc:language></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
    const rows = Array.from({ length: 66 }, (_unused, index) =>
      `<tr><td><a href="${index + 1}.xhtml">Book ${index + 1}</a></td><td></td><td>Bk${index + 1}</td></tr>`).join("");
    zip.file("OEBPS/table.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><table>${rows}</table></body></html>`);
    const verseDocument = (text) => `<html xmlns="http://www.w3.org/1999/xhtml"><body><p><span id="chapter1_verse1"/><strong><sup>1</sup></strong>${text}</p></body></html>`;
    zip.file("OEBPS/1.xhtml", verseDocument("From 1."));
    zip.file("OEBPS/1-split2.xhtml", verseDocument("From split."));
    return zip.generateAsync({ type: "arraybuffer" });
  }

  const jwSource = new JwEpubBibleSource();
  const spineFirstOrderEpub = await createJwLikeEpub(["1-split2.xhtml", "1.xhtml"]);
  assert.strictEqual(selectBibleSource(createBibleSources(), "test.epub", spineFirstOrderEpub).id, "jw-epub");
  assert.throws(() => selectBibleSource(createBibleSources(), "test.txt", new TextEncoder().encode("text").buffer), /Unsupported Bible file format/);
  assert.deepStrictEqual(await jwSource.readMetadata(spineFirstOrderEpub), { title: "Test & Bible", language: "en-us" });

  const importJwLikeEpub = (content, options) => jwSource.importBible({
    fileName: "test.epub",
    content,
    translationId: "en-test",
    translationName: "",
    language: "",
  }, options);
  const spineFirstOrderResult = await importJwLikeEpub(spineFirstOrderEpub);
  assert.strictEqual(spineFirstOrderResult.translationName, "Test & Bible");
  assert.strictEqual(spineFirstOrderResult.language, "en-us");
  assert.strictEqual(spineFirstOrderResult.books.length, 66);
  assert.deepStrictEqual(
    spineFirstOrderResult.compactBooks["translations/en-test/books/1.json"].chapters[1][1],
    { text: "From 1.", footnotes: [], paragraphStart: true }
  );
  const spineLastOrderResult = await importJwLikeEpub(await createJwLikeEpub(["1.xhtml", "1-split2.xhtml"]));
  assert.strictEqual(
    spineLastOrderResult.compactBooks["translations/en-test/books/1.json"].chapters[1][1].text,
    "From split."
  );
  assert.strictEqual(spineLastOrderResult.report.verses, 1);
  assert.strictEqual(spineLastOrderResult.bibleIndexV2Data.translations["en-test"].books["1"].chapterCount, 1);

  const abortedImportController = new AbortController();
  abortedImportController.abort();
  await assert.rejects(
    importJwLikeEpub(spineFirstOrderEpub, { signal: abortedImportController.signal }),
    (error) => isBibleImportAbortError(error)
  );

  const {
    sanitizeBibleIndexV2Data,
  } = require("../.test-build/src/infrastructure/v2/BibleIndexV2Validation.js");
  const {
    ObsidianBibleIndexV2Repository,
  } = require("../.test-build/src/infrastructure/v2/ObsidianBibleIndexV2Repository.js");
  const validIndexBook = (path) => ({ name: "Book", abbreviation: "Bk", aliases: ["Book"], path });
  const untrustedIndex = {
    version: 2,
    translations: {
      "ru-nwt": {
        name: "NWT",
        language: "ru",
        importedAt: "2026-01-01T00:00:00.000Z",
        books: {
          "1": validIndexBook("translations/ru-nwt/books/1.json"),
          "2": validIndexBook("translations/ru-nwt/books/../../../evil.json"),
          "3": validIndexBook("translations/other/books/3.json"),
          "4": validIndexBook("/etc/passwd"),
          "5": { ...validIndexBook("translations/ru-nwt/books/5.json"), aliases: [1] },
          "x": validIndexBook("translations/ru-nwt/books/x.json"),
        },
      },
      "../..": { name: "Evil", language: "ru", importedAt: "", books: {} },
      "en-nwt": { name: "Broken", language: "en" },
    },
  };
  const indexRepositoryFiles = new Map([["data/bibles-index.json", JSON.stringify(untrustedIndex)]]);
  const indexRepository = new ObsidianBibleIndexV2Repository({
    exists: async (path) => indexRepositoryFiles.has(path),
    read: async (path) => indexRepositoryFiles.get(path),
  }, "data");
  const indexWarnings = [];
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => indexWarnings.push(args.join(" "));
  let sanitizedIndex;
  try {
    sanitizedIndex = sanitizeBibleIndexV2Data(untrustedIndex);
    await indexRepository.load();
  } finally {
    console.warn = originalConsoleWarn;
  }
  assert.deepStrictEqual(Object.keys(sanitizedIndex.translations), ["ru-nwt"]);
  assert.deepStrictEqual(Object.keys(sanitizedIndex.translations["ru-nwt"].books), ["1"]);
  assert.strictEqual(indexWarnings.length, 14);
  assert.deepStrictEqual(indexRepository.getV2Data(), sanitizedIndex);
  assert.strictEqual(await indexRepository.loadBook("ru-nwt", 2), null);

  const chapterUsageResult = (filePath, chapterStart, verseStart, chapterEnd, verseEnd) => ({
    filePath,
    book: 43,
    chapterStart,
    verseStart,
    chapterEnd,
    verseEnd,
  });
  const formatChapterUsageSpan = (span) => span.verseStart === 1 && span.verseEnd === null
    ? "whole"
    : `${span.verseStart}-${span.verseEnd ?? "end"}`;
  assert.deepStrictEqual(createChapterUsageQuery({ book: 43, chapter: 3 }), {
    book: 43,
    chapterStart: 3,
    verseStart: 1,
    chapterEnd: 3,
    verseEnd: Number.MAX_SAFE_INTEGER,
  });
  const chapterUsageGroups = groupReferenceUsagesByChapterVerses([
    chapterUsageResult("a.md", 3, 16, 3, 16),
    chapterUsageResult("b.md", 3, 5, 3, 7),
    chapterUsageResult("c.md", 2, 23, 3, 2),
    chapterUsageResult("d.md", 3, 16, 3, 16),
    chapterUsageResult("e.md", 3, 30, 4, 2),
    chapterUsageResult("f.md", 2, 1, 4, 1),
    chapterUsageResult("g.md", 3, 5, 3, 5),
  ], { book: 43, chapter: 3 }, formatChapterUsageSpan);
  assert.deepStrictEqual(
    chapterUsageGroups.map((group) => [group.title, group.results.map((result) => result.filePath)]),
    [
      ["whole", ["f.md"]],
      ["1-2", ["c.md"]],
      ["5-5", ["g.md"]],
      ["5-7", ["b.md"]],
      ["16-16", ["a.md", "d.md"]],
      ["30-end", ["e.md"]],
    ]
  );

  class FakeUsageView {}
  const createFakeLeaf = (initialView, viewOnLoad) => {
    const calls = [];
    const leaf = {
      view: initialView,
      async loadIfDeferred() {
        calls.push("loadIfDeferred");
        if (viewOnLoad !== undefined) {
          leaf.view = viewOnLoad;
        }
      },
      async setViewState(state) {
        calls.push(`setViewState:${state.type}:${state.active}`);
        leaf.view = new FakeUsageView();
      },
    };
    return { leaf, calls };
  };
  const isFakeUsageView = (view) => view instanceof FakeUsageView;

  const deferredLeaf = createFakeLeaf({ deferred: true }, new FakeUsageView());
  const loadedDeferredView = await ensureLeafViewLoaded({
    leaf: deferredLeaf.leaf,
    viewType: "usage",
    active: true,
    isExpectedView: isFakeUsageView,
  });
  assert.ok(loadedDeferredView instanceof FakeUsageView);
  assert.strictEqual(loadedDeferredView, deferredLeaf.leaf.view);
  assert.deepStrictEqual(deferredLeaf.calls, ["loadIfDeferred"]);

  const placeholderLeaf = createFakeLeaf({ placeholder: true });
  const replacedView = await ensureLeafViewLoaded({
    leaf: placeholderLeaf.leaf,
    viewType: "usage",
    active: false,
    isExpectedView: isFakeUsageView,
  });
  assert.ok(replacedView instanceof FakeUsageView);
  assert.deepStrictEqual(placeholderLeaf.calls, ["loadIfDeferred", "setViewState:usage:false"]);

  const loadedLeaf = createFakeLeaf(new FakeUsageView());
  const existingUsageView = loadedLeaf.leaf.view;
  assert.strictEqual(await ensureLeafViewLoaded({
    leaf: loadedLeaf.leaf,
    viewType: "usage",
    active: true,
    isExpectedView: isFakeUsageView,
  }), existingUsageView);
  assert.deepStrictEqual(loadedLeaf.calls, ["loadIfDeferred"]);

  console.log("All parser/importer tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
