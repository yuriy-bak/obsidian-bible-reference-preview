const {
  assert,
  BibleReferenceParser,
  createBookMapping,
  createCombinedBookMappingFromBibleIndexV2Data,
} = require("../helpers");

// Book names of every imported translation are recognized; the main translation keeps priority.
module.exports = async () => {
  const russian = [
    { id: 19, name: "Псалтирь", abbreviation: "Пс", aliases: [], chapterCount: 150 },
    { id: 23, name: "Исаия", abbreviation: "Ис", aliases: [], chapterCount: 66 },
    { id: 30, name: "Амос", abbreviation: "Ам", aliases: [], chapterCount: 9 },
    { id: 43, name: "Иоанна", abbreviation: "Ин", aliases: [], chapterCount: 21 },
    { id: 65, name: "Иуды", abbreviation: "Иуд", aliases: [], chapterCount: 1 },
  ];
  const english = [
    { id: 19, name: "Psalms", abbreviation: "Ps", aliases: [], chapterCount: 150 },
    { id: 23, name: "Isaiah", abbreviation: "Is", aliases: [], chapterCount: 66 },
    { id: 30, name: "Amos", abbreviation: "Am", aliases: [], chapterCount: 9 },
    { id: 43, name: "John", abbreviation: "Jn", aliases: [], chapterCount: 21 },
    { id: 65, name: "Jude", abbreviation: "Jud", aliases: [], chapterCount: 1 },
    { id: 67, name: "Tobit", abbreviation: "Tob", aliases: [], chapterCount: 14 },
  ];
  const ids = (parser, text) => parser.parse(text).map((reference) => reference.book);

  const combined = createBookMapping(russian, [english]);
  const parser = new BibleReferenceParser(combined);
  assert.deepStrictEqual(ids(parser, "Пс 22:1; Ps 23:1"), [19, 19]);
  assert.deepStrictEqual(ids(parser, "Is 53:5"), [23]);
  assert.deepStrictEqual(ids(parser, "Am 5:24"), [30]);
  assert.deepStrictEqual(ids(parser, "John 3:16, Jn 1:1"), [43, 43]);
  assert.deepStrictEqual(ids(parser, "Ин 3:16"), [43]);
  // One-chapter book by the other translation's name: "Jude 6" is a verse.
  assert.deepStrictEqual(parser.parse("Jude 6").map((r) => [r.book, r.chapterStart, r.verseStart]), [[65, 1, 6]]);
  // Generated prefixes come from the main translation only.
  assert.deepStrictEqual(ids(parser, "Псал 22:1"), [19]);
  assert.deepStrictEqual(ids(parser, "Psal 23:1"), []);
  // Displayed names stay the main translation's; a book missing there gets the other one's.
  assert.strictEqual(combined.idToDisplayName.get(19), "Пс");
  assert.strictEqual(combined.idToDisplayName.get(67), "Tob");
  assert.deepStrictEqual(ids(parser, "Tob 1:1"), [67]);

  // A clash with the main translation: the main one wins.
  const clash = new BibleReferenceParser(createBookMapping(
    [{ id: 1, name: "Бытие", abbreviation: "Быт", aliases: ["Ge"], chapterCount: 50 }],
    [[{ id: 66, name: "Genesis-like", abbreviation: "Ge", aliases: [], chapterCount: 22 }]],
  ));
  assert.deepStrictEqual(ids(clash, "Ge 1:1"), [1]);

  // A clash between two other translations: dropped from both, the rest still works.
  const otherClash = new BibleReferenceParser(createBookMapping(
    [{ id: 43, name: "Иоанна", abbreviation: "Ин", aliases: [], chapterCount: 21 }],
    [
      [{ id: 7, name: "Richter", abbreviation: "Ri", aliases: [], chapterCount: 21 }],
      [{ id: 8, name: "Ruth", abbreviation: "Ri", aliases: [], chapterCount: 4 }],
    ],
  ));
  assert.deepStrictEqual(ids(otherClash, "Ri 1:1"), []);
  assert.deepStrictEqual(ids(otherClash, "Richter 1:1; Ruth 1:1; Ин 1:1"), [7, 8, 43]);

  // Without other translations nothing changes.
  assert.deepStrictEqual(
    [...createBookMapping(russian).nameToId.entries()].sort(),
    [...createBookMapping(russian, []).nameToId.entries()].sort(),
  );

  // From the index: rebuilt from the translations left after one is removed.
  const toV2Books = (books) => Object.fromEntries(books.map((book) => [String(book.id), {
    name: book.name, abbreviation: book.abbreviation, aliases: book.aliases, path: "", chapterCount: book.chapterCount,
  }]));
  const data = {
    version: 2,
    translations: {
      rst: { name: "RST", language: "ru", importedAt: "", books: toV2Books(russian) },
      kjv: { name: "KJV", language: "en", importedAt: "", books: toV2Books(english) },
    },
  };
  assert.deepStrictEqual(ids(new BibleReferenceParser(createCombinedBookMappingFromBibleIndexV2Data(data, "rst")), "Ps 23:1"), [19]);
  assert.deepStrictEqual(ids(new BibleReferenceParser(createCombinedBookMappingFromBibleIndexV2Data(data, "kjv")), "Пс 22:1; Ps 23:1"), [19, 19]);
  delete data.translations.kjv;
  assert.deepStrictEqual(ids(new BibleReferenceParser(createCombinedBookMappingFromBibleIndexV2Data(data, "rst")), "Ps 23:1"), []);
};
