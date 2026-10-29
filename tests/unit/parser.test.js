const {
  assert,
  syntheticMetadata,
  BibleReferenceParser,
  getBibleReferenceParserSignature,
  createBookMapping,
  removeChapterNumberFromAlias,
  getBibleTextBlocks,
  createBookMappingFromBibleIndexV2Data,
  DEFAULT_TRANSLATION_ID,
} = require("../helpers");

module.exports = async () => {
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

  const importedParser = new BibleReferenceParser(
    createBookMappingFromBibleIndexV2Data(syntheticMetadata, DEFAULT_TRANSLATION_ID)
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

  const aliases =
    syntheticMetadata.translations[DEFAULT_TRANSLATION_ID].books["1"].aliases;
  assert(
    !aliases.some(
      (alias) =>
        alias.startsWith("^") ||
        alias.includes(":") ||
        alias.includes(";") ||
        alias === "1"
    )
  );

  // Parser signature: same aliases give the same signature, other aliases a different one.
  const signatureBooks = [
    { id: 43, name: "Иоанна", abbreviation: "Ин", aliases: [], chapterCount: 21 },
    { id: 65, name: "Иуды", abbreviation: "Иуд", aliases: [], chapterCount: 1 },
  ];
  const signature = getBibleReferenceParserSignature(createBookMapping(signatureBooks));
  assert.strictEqual(signature, getBibleReferenceParserSignature(createBookMapping(signatureBooks.map((book) => ({ ...book })))));
  assert.notStrictEqual(signature, getBibleReferenceParserSignature(createBookMapping([
    { id: 43, name: "John", abbreviation: "Jn", aliases: [], chapterCount: 21 },
    { id: 65, name: "Jude", abbreviation: "Jud", aliases: [], chapterCount: 1 },
  ])));
  assert.notStrictEqual(signature, getBibleReferenceParserSignature(createBookMapping([
    ...signatureBooks,
    { id: 45, name: "Римлянам", abbreviation: "Рим", aliases: [], chapterCount: 16 },
  ])));
  assert.notStrictEqual(signature, getBibleReferenceParserSignature(createBookMapping([])));
};
