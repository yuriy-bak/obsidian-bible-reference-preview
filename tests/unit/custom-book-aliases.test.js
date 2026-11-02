const { assert, BibleReferenceParser, createBookMapping, createCombinedBookMappingFromBibleIndexV2Data } = require("../helpers");
const {
  findCustomBookAliasConflicts,
  getBookIndexAliases,
  normalizeCustomBookAliases,
  parseCustomBookAliasesInput,
} = require("../../.test-build/src/parsing/customBookAliases.js");

// Book names the user adds to a translation (issue #55).
module.exports = async () => {
  const ids = (mapping, text) => new BibleReferenceParser(mapping).parse(text).map((reference) => reference.book);
  const russian = [
    { id: 1, name: "Бытие", abbreviation: "Быт", aliases: [], chapterCount: 50 },
    { id: 23, name: "Исаия", abbreviation: "Ис", aliases: [], chapterCount: 66 },
    { id: 43, name: "Иоанна", abbreviation: "Ин", aliases: [], chapterCount: 21 },
    { id: 65, name: "Иуды", abbreviation: "Иуд", aliases: [], chapterCount: 1 },
  ];
  const withCustom = (books, custom) => books.map((book) => (custom[book.id] === undefined ? book : { ...book, customAliases: custom[book.id] }));

  // The input: commas or semicolons, trimmed, no chapter number, one per normalized form, at least one letter.
  assert.deepStrictEqual(parseCustomBookAliasesInput(" Йн ,  Иоан.; йн, Ин 3 ,, 12 "), ["Йн", "Иоан.", "Ин"]);
  assert.deepStrictEqual(normalizeCustomBookAliases(["1  Йн", "1Йн", "x".repeat(41)]), ["1 Йн", "1Йн"]);

  // The main translation's names are recognized as the book's own.
  assert.deepStrictEqual(ids(createBookMapping(russian), "Йн 3:16"), []);
  assert.deepStrictEqual(ids(createBookMapping(withCustom(russian, { 43: ["Йн", "1Иоан"] })), "Йн 3:16; Йн. 1:1; 1 Иоан 2:1"), [43, 43, 43]);
  // A one-chapter book: "Юд 3" is a verse.
  assert.deepStrictEqual(
    new BibleReferenceParser(createBookMapping(withCustom(russian, { 65: ["Юд"] }))).parse("Юд 3").map((r) => [r.book, r.chapterStart, r.verseStart]),
    [[65, 1, 3]],
  );
  // They take the place of a generated prefix ("Иса" of Исаия)...
  assert.deepStrictEqual(ids(createBookMapping(russian), "Иса 53:5"), [23]);
  assert.deepStrictEqual(ids(createBookMapping(withCustom(russian, { 1: ["Иса"] })), "Иса 1:1; Исаия 53:5"), [1, 23]);
  // ...and of another translation's name.
  const english = [{ id: 23, name: "Isaiah", abbreviation: "Is", aliases: [], chapterCount: 66 }, { id: 43, name: "John", abbreviation: "Jn", aliases: [], chapterCount: 21 }];
  assert.deepStrictEqual(ids(createBookMapping(withCustom(russian, { 1: ["Jn"] }), [english]), "Jn 1:1"), [1]);

  // Another translation's names count as its own: added where the main one has nothing.
  assert.deepStrictEqual(ids(createBookMapping(russian, [withCustom(english, { 43: ["Jhn"] })]), "Jhn 3:16"), [43]);
  assert.deepStrictEqual(ids(createBookMapping(russian, [withCustom(english, { 43: ["Ин", "Быт"] })]), "Быт 1:1"), [1]);

  // Conflicts within the translation: another book's own name or the user's name of another book.
  const books = withCustom(russian, { 23: ["Исайя"] });
  assert.deepStrictEqual(findCustomBookAliasConflicts(books, 43, ["Йн", "быт.", "ИСАЙЯ"]), [{ alias: "быт.", bookId: 1 }, { alias: "ИСАЙЯ", bookId: 23 }]);
  // A book's own names, a generated prefix and the edited book's old names are not conflicts.
  assert.deepStrictEqual(findCustomBookAliasConflicts(books, 43, ["Ин", "Иса", "Иоан"]), []);
  assert.deepStrictEqual(findCustomBookAliasConflicts(books, 23, ["Исайя"]), []);
  // "1 Ин" and "1Ин" are one name.
  assert.deepStrictEqual(findCustomBookAliasConflicts([{ id: 62, name: "1 Иоанна", abbreviation: "1Ин", aliases: [] }], 43, ["1 Ин"]), [{ alias: "1 Ин", bookId: 62 }]);

  // Chips of a book: its names without chapter numbers, once each.
  assert.deepStrictEqual(getBookIndexAliases({ id: 18, name: "Иов", abbreviation: "Иов", aliases: ["Иов 1", "Job"] }), ["Иов", "Job"]);

  // From the index: the user's names of every translation, by translation id.
  const toV2Books = (list) => Object.fromEntries(list.map((book) => [String(book.id), {
    name: book.name, abbreviation: book.abbreviation, aliases: book.aliases, path: "", chapterCount: book.chapterCount,
  }]));
  const data = {
    version: 2,
    translations: {
      rst: { name: "RST", language: "ru", importedAt: "", books: toV2Books(russian) },
      kjv: { name: "KJV", language: "en", importedAt: "", books: toV2Books(english) },
    },
  };
  const custom = { rst: { 43: ["Йн"] }, kjv: { 43: ["Jhn"] } };
  assert.deepStrictEqual(ids(createCombinedBookMappingFromBibleIndexV2Data(data, "rst", custom), "Йн 1:1; Jhn 1:1"), [43, 43]);
  assert.deepStrictEqual(ids(createCombinedBookMappingFromBibleIndexV2Data(data, "kjv", custom), "Йн 1:1; Jhn 1:1"), [43, 43]);
  assert.deepStrictEqual(ids(createCombinedBookMappingFromBibleIndexV2Data(data, "rst"), "Йн 1:1"), []);
};
