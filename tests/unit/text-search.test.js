const assert = require("assert");
const {
  createSearchableVerse,
  getTextSearchHighlights,
  normalizeForTextSearch,
  normalizeWordsForTextSearch,
  parseTextSearchQuery,
  searchVerses,
} = require("../../.test-build/src/search/BibleTextSearch.js");

// Bible text search: words by their beginning, phrases in quotes as whole words, accents and case ignored.
module.exports = async () => {
  assert.deepStrictEqual(parseTextSearchQuery("  Любов  «так возлюбил» Бог! "), [
    { text: "так возлюбил", phrase: true },
    { text: "любов", phrase: false },
    { text: "бог", phrase: false },
  ]);
  assert.deepStrictEqual(parseTextSearchQuery("\"in the beginning\""), [{ text: "in the beginning", phrase: true }]);
  assert.deepStrictEqual(parseTextSearchQuery(" , ; "), []);

  // Words separated by single spaces; ё is е, accents go, й stays.
  assert.strictEqual(normalizeForTextSearch("Ибо так, возлюбил — Бог  мир!").text, "ибо так возлюбил бог мир");
  assert.strictEqual(normalizeForTextSearch("Всё мой Café").text, "все мой cafe");
  // The fast form for reading a translation gives the same words.
  for (const text of ["Ибо так, возлюбил — Бог  мир!", "Всё мой Café", "¹⁶ В нача́ле… «Слово»", "Ἐν ἀρχῇ ἦν ὁ λόγος", " 1Кор 13:4 "]) {
    assert.strictEqual(normalizeWordsForTextSearch(text), normalizeForTextSearch(text).text, text);
  }

  const verses = [
    { book: 43, chapter: 3, verse: 16, text: "Ибо так возлюбил Бог мир, что отдал Сына Своего." },
    { book: 1, chapter: 1, verse: 1, text: "В начале сотворил Бог небо и землю." },
    { book: 62, chapter: 4, verse: 8, text: "Кто не любит, тот не познал Бога, потому что Бог есть любовь." },
    { book: 46, chapter: 13, verse: 4, verseEnd: 5, text: "Любовь долготерпит, милосердствует." },
  ].map(createSearchableVerse);
  const find = (query, scope = "all") => searchVerses(verses, parseTextSearchQuery(query), scope).map((verse) => `${verse.book}:${verse.chapter}:${verse.verse}`);

  // A word matches at a word start: "бог" finds Бог and Бога, not "убогий"; all words must occur.
  assert.deepStrictEqual(find("бог"), ["43:3:16", "1:1:1", "62:4:8"]);
  assert.deepStrictEqual(find("любов"), ["62:4:8", "46:13:4"]);
  assert.deepStrictEqual(find("бог любов"), ["62:4:8"]);
  assert.deepStrictEqual(find("огу"), []);
  // A phrase: in a row, whole words, punctuation ignored.
  assert.deepStrictEqual(find("\"возлюбил бог мир\""), ["43:3:16"]);
  assert.deepStrictEqual(find("\"возлюбил бо\""), []);
  assert.deepStrictEqual(find("\"мир что\""), ["43:3:16"]);
  // Scope: Old Testament (books 1–39), New Testament, one book.
  assert.deepStrictEqual(find("бог", "old"), ["1:1:1"]);
  assert.deepStrictEqual(find("бог", "new"), ["43:3:16", "62:4:8"]);
  assert.deepStrictEqual(find("бог", 62), ["62:4:8"]);
  assert.deepStrictEqual(find(""), []);

  // Highlights point into the original text: the whole word for a prefix, the phrase as typed.
  const highlight = (text, query) => getTextSearchHighlights(text, parseTextSearchQuery(query)).map(([start, end]) => text.slice(start, end));
  assert.deepStrictEqual(highlight("Кто не любит, тот не познал Бога, потому что Бог есть любовь.", "бог любов"), ["Бога", "Бог", "любовь"]);
  assert.deepStrictEqual(highlight("Ибо так возлюбил Бог мир, что отдал", "\"Бог мир что\""), ["Бог мир, что"]);
  assert.deepStrictEqual(highlight("Всё в Нём", "все нем"), ["Всё", "Нём"]);
};
