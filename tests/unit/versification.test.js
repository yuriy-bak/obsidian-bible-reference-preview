const assert = require("assert");
const { readFile } = require("fs/promises");
const { join } = require("path");
const { pathToFileURL } = require("url");
const {
  createBuiltinVersificationRegistry,
  DEFAULT_VERSIFICATION_KEY,
  isVersificationKey,
} = require("../../.test-build/src/versification/VersificationRegistry.js");
const { detectVersification } = require("../../.test-build/src/versification/detectVersification.js");
const { getBookIdByUsfmCode, getUsfmCodeByBookId } = require("../../.test-build/src/versification/UsfmBookCodes.js");
const { BibleIndexBuilder } = require("../../.test-build/src/infrastructure/sources/BibleIndexBuilder.js");
const { sanitizeBibleIndexV2Data } = require("../../.test-build/src/infrastructure/v2/BibleIndexV2Validation.js");
const { detectMissingVersifications } = require("../../.test-build/src/import/detectMissingVersifications.js");

const PSALMS = 19;
const MALACHI = 39;
const JOEL = 29;
const MATTHEW = 40;
const MARK = 41;
const JOHN = 43;
const ACTS = 44;
const ROMANS = 45;
const JAMES = 59;
const THIRD_JOHN = 64;
const REVELATION = 66;

const root = join(__dirname, "../..");
const registry = createBuiltinVersificationRegistry();

function map(book, chapter, verse, from, to) {
  return registry.mapVerse({ book, chapter, verse }, `builtin:${from}`, `builtin:${to}`);
}

// Verse counts as stored in an index: index 0 unused, then the last verse of every chapter.
function schemeCounts(id, books) {
  const scheme = registry.get(`builtin:${id}`);
  const counts = {};
  for (const book of books) {
    counts[book] = [0, ...scheme.getChapterVerseCounts(book)];
  }
  return counts;
}

const ALL_BOOKS = Array.from({ length: 66 }, (_unused, index) => index + 1);
const NEW_TESTAMENT = ALL_BOOKS.slice(39);

module.exports = async () => {
  // The bundled data is generated from the .vrs files and must not drift from them.
  const { generateVersificationData } = await import(pathToFileURL(join(root, "scripts/generate-versification-data.mjs")).href);
  assert.strictEqual(
    await readFile(join(root, "src/versification/builtinVersificationData.ts"), "utf8"),
    await generateVersificationData(),
    "builtinVersificationData.ts is out of date: run npm run generate:versification",
  );

  assert.strictEqual(getBookIdByUsfmCode("MAT"), MATTHEW);
  assert.strictEqual(getBookIdByUsfmCode("jas"), JAMES);
  assert.strictEqual(getBookIdByUsfmCode("TOB"), null);
  assert.strictEqual(getUsfmCodeByBookId(REVELATION), "REV");

  assert(isVersificationKey(DEFAULT_VERSIFICATION_KEY));
  assert(isVersificationKey("user:my-scheme"));
  assert(!isVersificationKey("eng"));
  assert(!isVersificationKey("builtin:../x"));

  assert.deepStrictEqual(registry.getAll().map((scheme) => scheme.key), [
    "builtin:eng", "builtin:rsc", "builtin:org", "builtin:vul", "builtin:lxx",
  ]);
  for (const scheme of registry.getAll()) {
    for (const book of ALL_BOOKS) {
      if (scheme.key === "builtin:lxx" && book === 16) {
        continue; // The Septuagint has Nehemiah as 2 Esdras 11–23.
      }
      assert(scheme.getChapterVerseCounts(book) !== null, `${scheme.key} has book ${book}`);
    }
  }
  assert.strictEqual(registry.get("builtin:eng").getVerseCount(PSALMS, 9), 20);
  assert.strictEqual(registry.get("builtin:rsc").getVerseCount(PSALMS, 9), 39);
  assert.strictEqual(registry.get("builtin:org").getVerseCount(MALACHI, 4), 0);
  assert.strictEqual(registry.get("builtin:eng").getVerseCount(MALACHI, 4), 6);

  // Known differences between the Russian Synodal and English numbering.
  assert.deepStrictEqual(map(PSALMS, 22, 1, "rsc", "eng"), { book: PSALMS, chapter: 23, verse: 1 });
  assert.deepStrictEqual(map(PSALMS, 23, 1, "eng", "rsc"), { book: PSALMS, chapter: 22, verse: 1 });
  assert.deepStrictEqual(map(PSALMS, 9, 22, "rsc", "eng"), { book: PSALMS, chapter: 10, verse: 1 });
  assert.deepStrictEqual(map(PSALMS, 9, 21, "rsc", "eng"), { book: PSALMS, chapter: 9, verse: 20 });
  assert.deepStrictEqual(map(PSALMS, 50, 3, "rsc", "eng"), { book: PSALMS, chapter: 51, verse: 1 });
  assert.deepStrictEqual(map(ROMANS, 14, 24, "rsc", "eng"), { book: ROMANS, chapter: 16, verse: 25 });
  assert.deepStrictEqual(map(MATTHEW, 5, 3, "rsc", "eng"), { book: MATTHEW, chapter: 5, verse: 3 });
  // English and Original (Hebrew).
  assert.deepStrictEqual(map(MALACHI, 4, 1, "eng", "org"), { book: MALACHI, chapter: 3, verse: 19 });
  assert.deepStrictEqual(map(MALACHI, 3, 19, "org", "eng"), { book: MALACHI, chapter: 4, verse: 1 });
  assert.deepStrictEqual(map(JOEL, 2, 28, "eng", "org"), { book: JOEL, chapter: 3, verse: 1 });
  // A psalm title is verse 1 in the Synodal and the Original numbering but no verse (0) in English.
  assert.deepStrictEqual(map(PSALMS, 3, 1, "rsc", "eng"), { book: PSALMS, chapter: 3, verse: 0 });
  assert.deepStrictEqual(map(PSALMS, 3, 1, "eng", "rsc"), { book: PSALMS, chapter: 3, verse: 2 });
  // Same scheme or an unknown key: unchanged.
  assert.deepStrictEqual(map(PSALMS, 22, 1, "rsc", "rsc"), { book: PSALMS, chapter: 22, verse: 1 });
  assert.deepStrictEqual(
    registry.mapVerse({ book: PSALMS, chapter: 22, verse: 1 }, "builtin:rsc", "user:missing"),
    { book: PSALMS, chapter: 22, verse: 1 },
  );

  // Ranges: a whole Synodal Psalm 9 is two English psalms; the title (verse 0) is dropped.
  assert.deepStrictEqual(
    registry.mapChapterVerseRange({ book: PSALMS, chapter: 9, verseStart: 1 }, "builtin:rsc", "builtin:eng"),
    [
      { book: PSALMS, chapter: 9, verseStart: 1, verseEnd: 20 },
      { book: PSALMS, chapter: 10, verseStart: 1, verseEnd: 18 },
    ],
  );
  assert.deepStrictEqual(
    registry.mapChapterVerseRange({ book: PSALMS, chapter: 10, verseStart: 1 }, "builtin:eng", "builtin:rsc"),
    [{ book: PSALMS, chapter: 9, verseStart: 22, verseEnd: 39 }],
  );
  assert.deepStrictEqual(
    registry.mapChapterVerseRange({ book: ROMANS, chapter: 16, verseStart: 25, verseEnd: 27 }, "builtin:eng", "builtin:rsc"),
    [{ book: ROMANS, chapter: 14, verseStart: 24, verseEnd: 26 }],
  );
  assert.deepStrictEqual(
    registry.mapChapterVerseRange({ book: MATTHEW, chapter: 5, verseStart: 3, verseEnd: 4 }, "builtin:eng", "builtin:eng"),
    [{ book: MATTHEW, chapter: 5, verseStart: 3, verseEnd: 4 }],
  );

  // Detection: NWT follows English except where it omits verses (Mark 16:9–20, John 7:53, ...).
  const nwtCounts = schemeCounts("eng", ALL_BOOKS);
  nwtCounts[MARK][16] = 8;
  nwtCounts[JOHN][7] = 52;
  nwtCounts[THIRD_JOHN][1] = 14;
  nwtCounts[REVELATION][12] = 17;
  const nwt = detectVersification(nwtCounts, registry);
  assert.strictEqual(nwt.key, "builtin:eng");
  assert.strictEqual(nwt.confident, true);
  assert.strictEqual(nwt.totalChapters, 1189);
  assert.strictEqual(nwt.scores[0].matchedChapters, 1185);

  const synodal = detectVersification(schemeCounts("rsc", ALL_BOOKS), registry);
  assert.strictEqual(synodal.key, "builtin:rsc");
  assert.strictEqual(synodal.confident, true);

  // A New Testament alone hardly differs between English and Synodal: ask instead of guessing.
  const synodalNewTestament = detectVersification(schemeCounts("rsc", NEW_TESTAMENT), registry);
  assert.strictEqual(synodalNewTestament.key, "builtin:rsc");
  assert.strictEqual(synodalNewTestament.confident, false);

  const empty = detectVersification({}, registry);
  assert.strictEqual(empty.key, null);
  assert.strictEqual(empty.confident, false);

  // The import stores the detected scheme and the book order the source gave.
  const builder = new BibleIndexBuilder({
    translationId: "test",
    translationName: "Test",
    language: "ru",
    sourceFileName: "test.epub",
  });
  builder.setBooks([
    { id: ACTS, name: "Деяния", abbreviation: "Деян" },
    { id: JAMES, name: "Иакова", abbreviation: "Иак" },
    { id: ROMANS, name: "Римлянам", abbreviation: "Рим" },
  ]);
  await builder.appendVerses(ROMANS, [{ chapter: 1, verse: 1, text: "Павел", footnotes: [] }]);
  const built = builder.build();
  const builtTranslation = built.bibleIndexV2Data.translations.test;
  assert.deepStrictEqual(builtTranslation.bookOrder, [ACTS, JAMES, ROMANS]);
  assert(isVersificationKey(builtTranslation.versification));
  assert(
    built.warnings.some((warning) => warning.startsWith("Versification was not detected reliably")),
    "One chapter is not enough to detect the scheme",
  );

  // Stored fields that are not valid are dropped, the rest of the translation is kept.
  const book = (id) => ({ name: `B${id}`, abbreviation: `B${id}`, aliases: [], path: `translations/t/books/${id}.json` });
  const sanitized = sanitizeBibleIndexV2Data({
    version: 2,
    translations: {
      good: { name: "G", language: "ru", importedAt: "", versification: "builtin:rsc", bookOrder: [2, 1], books: { 1: { ...book(1), path: "translations/good/books/1.json" }, 2: { ...book(2), path: "translations/good/books/2.json" } } },
      bad: { name: "B", language: "ru", importedAt: "", versification: "../eng", bookOrder: [1, 1], books: { 1: { ...book(1), path: "translations/bad/books/1.json" } } },
      partial: { name: "P", language: "ru", importedAt: "", bookOrder: [1], books: { 1: { ...book(1), path: "translations/partial/books/1.json" }, 2: { ...book(2), path: "translations/partial/books/2.json" } } },
    },
  });
  assert.strictEqual(sanitized.translations.good.versification, "builtin:rsc");
  assert.deepStrictEqual(sanitized.translations.good.bookOrder, [2, 1]);
  assert.strictEqual("versification" in sanitized.translations.bad, false);
  assert.strictEqual("bookOrder" in sanitized.translations.bad, false);
  assert.strictEqual("bookOrder" in sanitized.translations.partial, false);

  // Translations imported before 0.3.0 get their scheme detected once from the stored books.
  const synodalBooks = {};
  for (const bookId of ALL_BOOKS) {
    const counts = registry.get("builtin:rsc").getChapterVerseCounts(bookId);
    synodalBooks[bookId] = { chapters: [null, ...counts.map((count) => [null, ...Array.from({ length: count }, () => "v")])] };
  }
  let v2Data = {
    version: 2,
    translations: {
      old: { name: "Old", language: "ru", importedAt: "", books: Object.fromEntries(ALL_BOOKS.map((id) => [id, book(id)])) },
      current: { name: "New", language: "en", importedAt: "", versification: "builtin:eng", bookOrder: [1], books: { 1: book(1) } },
    },
  };
  const updates = [];
  const repository = {
    getV2Data: () => v2Data,
    loadBook: async (translationId, bookId) => (translationId === "old" ? synodalBooks[bookId] : null),
    updateTranslationVersification: async (translationId, fields) => {
      updates.push(translationId);
      v2Data = { ...v2Data, translations: { ...v2Data.translations, [translationId]: { ...v2Data.translations[translationId], ...fields } } };
    },
  };
  assert.strictEqual(await detectMissingVersifications(repository), true);
  assert.deepStrictEqual(updates, ["old"]);
  assert.strictEqual(v2Data.translations.old.versification, "builtin:rsc");
  assert.deepStrictEqual(v2Data.translations.old.bookOrder, ALL_BOOKS);
  assert.strictEqual(await detectMissingVersifications(repository), false);
};
