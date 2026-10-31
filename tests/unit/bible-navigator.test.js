const assert = require("assert");
const {
  createNavigatorBooks,
  filterNavigatorBooks,
  parseNavigatorQuery,
} = require("../../.test-build/src/reader/BibleNavigatorModel.js");

// The reader's navigator: books in the translation's order, filtering by typed text, typed references.
module.exports = async () => {
  const books = createNavigatorBooks([
    { id: 1, name: "Бытие", abbreviation: "Быт", aliases: ["Genesis"], chapterCount: 50 },
    { id: 19, name: "Псалтирь", abbreviation: "Пс", aliases: [], chapterCount: 150 },
    { id: 43, name: "От Иоанна", abbreviation: "Ин", aliases: ["Иоанна"], chapterCount: 21 },
    { id: 46, name: "1-е Коринфянам", abbreviation: "1 Кор", aliases: [], chapterCount: 16 },
    { id: 59, name: "Иакова", abbreviation: "Иак", aliases: [], chapterCount: 5 },
    { id: 62, name: "1-е Иоанна", abbreviation: "1 Ин", aliases: [], chapterCount: 5 },
    { id: 65, name: "Иуды", abbreviation: "Иуд", aliases: [], chapterCount: 1 },
  ], [1, 19, 43, 59, 46, 62, 65]);

  // The translation's own order (James after John here), testaments by book id, the abbreviation on the button.
  assert.deepStrictEqual(books.map((book) => book.id), [1, 19, 43, 59, 46, 62, 65]);
  assert.deepStrictEqual(books.map((book) => book.testament), ["old", "old", "new", "new", "new", "new", "new"]);
  assert.strictEqual(books[2].shortName, "Ин");

  const ids = (query) => filterNavigatorBooks(books, query).map((book) => book.id);
  assert.strictEqual(ids("").length, books.length);
  assert.deepStrictEqual(ids("Пс"), [19]);
  assert.deepStrictEqual(ids("и"), [43, 59, 65]);
  assert.deepStrictEqual(ids("1 кор"), [46]);
  assert.deepStrictEqual(ids("1кор 13"), [46]);
  assert.deepStrictEqual(ids("gen"), [1]);
  assert.deepStrictEqual(ids("xyz"), []);

  const parse = (query) => {
    const target = parseNavigatorQuery(books, query);
    return target === null ? null : { ...target, book: target.book.id };
  };
  // An exact abbreviation wins over the books it is a prefix of.
  assert.deepStrictEqual(parse("Ин"), { book: 43 });
  assert.deepStrictEqual(parse("Ин 3:16"), { book: 43, chapter: 3, verseStart: 16 });
  assert.deepStrictEqual(parse("ин3:16-18"), { book: 43, chapter: 3, verseStart: 16, verseEnd: 18 });
  assert.deepStrictEqual(parse("1 Ин 2"), { book: 62, chapter: 2 });
  assert.deepStrictEqual(parse("1 Кор 13"), { book: 46, chapter: 13 });
  assert.deepStrictEqual(parse("Пс 22"), { book: 19, chapter: 22 });
  assert.deepStrictEqual(parse("Быт."), { book: 1 });
  // A prefix of one book only is enough; a prefix of several is not.
  assert.deepStrictEqual(parse("Псал 23"), { book: 19, chapter: 23 });
  assert.strictEqual(parse("И 3"), null);
  assert.strictEqual(parse(""), null);
};
