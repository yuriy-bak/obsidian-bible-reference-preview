const { assert, BibleReferenceParser, createBookMapping, getBibleReferenceParserSignature } = require("../helpers");
const {
  createDefaultTranslationCode,
  isValidTranslationCode,
  normalizeTranslationCode,
  resolveTranslationCodes,
} = require("../../.test-build/src/translations/translationCodes.js");

// "Пс 22:1 (СП)": a code in brackets after a reference names the translation of the passage.
module.exports = async () => {
  assert.strictEqual(createDefaultTranslationCode("Синодальный перевод"), "СП");
  assert.strictEqual(createDefaultTranslationCode("World English Bible"), "WEB");
  assert.strictEqual(createDefaultTranslationCode("Перевод «Новый мир» (2021) (nwt-U)"), "NWT-U");
  assert.strictEqual(createDefaultTranslationCode("Bible (2021)"), "B");
  assert.strictEqual(createDefaultTranslationCode("2021"), "T");

  assert(isValidTranslationCode("СП"));
  assert(isValidTranslationCode("NWT-U"));
  assert(!isValidTranslationCode("С П"));
  assert(!isValidTranslationCode("-СП"));
  assert(!isValidTranslationCode("ABCDEFGHIJKLM"));
  assert.strictEqual(normalizeTranslationCode(" Ёж "), "еж");

  // The user's codes win; a default code already taken is numbered.
  const codes = resolveTranslationCodes([
    { id: "syn", name: "Синодальный перевод" },
    { id: "syn2", name: "Синодальный перевод" },
    { id: "nwt", name: "Новый мир" },
    { id: "bad", name: "Библия" },
  ], { nwt: "СП", bad: "a b" });
  assert.deepStrictEqual([...codes], [["syn", "СП2"], ["syn2", "СП3"], ["nwt", "СП"], ["bad", "Б"]]);

  const mapping = createBookMapping([{ id: 19, name: "псалом", abbreviation: "пс" }, { id: 43, name: "иоанна", abbreviation: "ин" }]);
  const parser = new BibleReferenceParser(mapping, new Map([["сп", "syn"], ["nwt-u", "nwt"]]));
  const [coded] = parser.parseMatches("См. Пс 22:1 (сп), там же.");
  assert.strictEqual(coded.text, "Пс 22:1 (сп)");
  assert.strictEqual(coded.translationId, "syn");
  assert.deepStrictEqual(coded.references, [{ book: 19, chapterStart: 22, verseStart: 1, chapterEnd: 22, verseEnd: 1 }]);
  assert.strictEqual(parser.parseMatches("Ин 3:16(NWT-U)")[0].translationId, "nwt");
  // An unknown code and other bracketed text stay text.
  for (const text of ["Пс 22:1 (KJV)", "Пс 22:1 (см. выше)", "Пс 22:1  (СП)"]) {
    const [match] = parser.parseMatches(text);
    assert.strictEqual(match.translationId, undefined, text);
    assert.strictEqual(match.text, "Пс 22:1", text);
  }
  // Codes change the parser signature, so notes are indexed again.
  assert.notStrictEqual(getBibleReferenceParserSignature(mapping, "сп=syn"), getBibleReferenceParserSignature(mapping, ""));
};
