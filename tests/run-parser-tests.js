const assert = require("assert");
const {
  BibleReferenceParser,
} = require("../.test-build/src/parsing/BibleReferenceParser.js");
const { createBookMapping } = require("../.test-build/src/parsing/BookMapping.js");
const DEFAULT_TRANSLATION_ID = "newworld";
const { getBibleTextBlocks } = require("../.test-build/src/application/getBibleTexts.js");
const {
  LazyBibleIndexV2,
} = require("../.test-build/src/infrastructure/v2/LazyBibleIndexV2.js");
const {
  createBookMappingFromBibleIndexV2Data,
} = require("../.test-build/src/infrastructure/v2/createBookMappingFromBibleIndexV2Data.js");
const {
  enrichBookTableFromNavigationHtml,
  extractBookNavigationAliasesFromHtml,
  extractBookTableFromHtml,
  extractVersesFromHtml,
} = require("../.test-build/src/infrastructure/epub/htmlTextUtils.js");
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
const JSZip = require("jszip");
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

  const referenceUsageUpdateFile = createReferenceUsageTestFile("notes/update.md", 100, 6);
  referenceUsageApp.vault.cachedRead = async (file) => {
    referenceUsageApp.readPaths.push(file.path);
    return "Ин 3:17";
  };
  await referenceUsageService.updateFile(referenceUsageUpdateFile);
  assert.strictEqual(referenceUsageService.getStats().fileCount, 2);
  referenceUsageUpdateFile.stat.size = REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1;
  await referenceUsageService.updateFile(referenceUsageUpdateFile);
  assert.strictEqual(referenceUsageService.getStats().fileCount, 1);
  assert.strictEqual(
    referenceUsageService.findUsages([
      { book: 43, chapterStart: 3, verseStart: 17, chapterEnd: 3, verseEnd: 17 },
    ]).length,
    0
  );
  referenceUsageService.clearPendingSave();

  assert.strictEqual(referenceUsageService.removeFile("notes/one.md"), true);
  assert.strictEqual(referenceUsageService.removeFile("notes/one.md"), false);
  referenceUsageService.clearPendingSave();
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

  console.log("All parser/importer tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
