const assert = require("assert");
const { formatBibleTextMarkdown, getAlternativeInsertFormat, toSuperscript } = require("../../.test-build/src/insertion/BibleTextMarkdown.js");
const { findReferenceAtCursor, findSuggestTrigger, insertBlockAfterParagraph, insertBlockAtCursor } = require("../../.test-build/src/insertion/EditorInsertion.js");
const { getReferenceSuggestions } = require("../../.test-build/src/insertion/ReferenceSuggestions.js");
const { createNavigatorBooks } = require("../../.test-build/src/application/BibleNavigatorModel.js");
const { createFakeEditor } = require("../fake-editor.js");

// Bible text written into a note: Markdown formats, where the block goes, the "--" trigger, the suggestions.
module.exports = async () => {
  const content = {
    plainText: "",
    blocks: [
      {
        type: "reference",
        title: "📖 Ин 3:16-17",
        references: [],
        paragraphs: [
          { heading: "Заголовок", verses: [{ number: 16, text: "Ведь Бог так любит мир." }] },
          { verses: [{ number: 17, numberEnd: 18, text: "Бог послал Сына." }] },
        ],
      },
      { type: "footnote", text: "* Сноска." },
    ],
  };
  const options = (overrides) => ({
    format: "callout", verseNumbers: true, footnotes: false, activeTranslationId: "ru", getTranslationCode: () => undefined, ...overrides,
  });

  assert.strictEqual(formatBibleTextMarkdown(content, options()), [
    "> [!bible] Ин 3:16-17",
    "> *Заголовок*",
    "> ¹⁶ Ведь Бог так любит мир.",
    ">",
    "> ¹⁷⁻¹⁸ Бог послал Сына.",
  ].join("\n"));
  assert.strictEqual(formatBibleTextMarkdown(content, options({ format: "quote", verseNumbers: false, footnotes: true })), [
    "> Ин 3:16-17",
    "> *Заголовок*",
    "> Ведь Бог так любит мир.",
    ">",
    "> Бог послал Сына.",
    ">",
    "> * Сноска.",
  ].join("\n"));
  assert.strictEqual(formatBibleTextMarkdown(content, options({ format: "code-block" })), "```bible\nИн 3:16-17\n```");
  // A collapsed callout: "-" after the type; the third suggestion is the other callout.
  assert.ok(formatBibleTextMarkdown(content, options({ format: "callout-collapsed" })).startsWith("> [!bible]- Ин 3:16-17\n> *Заголовок*"));
  assert.strictEqual(getAlternativeInsertFormat("callout"), "callout-collapsed");
  assert.strictEqual(getAlternativeInsertFormat("quote"), "callout-collapsed");
  assert.strictEqual(getAlternativeInsertFormat("callout-collapsed"), "callout");
  // A reader's chapter names its translation when it is not the main one.
  const chapter = { ...content, blocks: [{ ...content.blocks[0], title: "📖 Ин 3" }], chapterView: { translationId: "en", title: "Ин 3" } };
  assert.ok(formatBibleTextMarkdown(chapter, options({ getTranslationCode: () => "ENG" })).startsWith("> [!bible] Ин 3 (ENG)\n"));
  assert.ok(formatBibleTextMarkdown(chapter, options({ activeTranslationId: "en", getTranslationCode: () => "ENG" })).startsWith("> [!bible] Ин 3\n"));
  assert.strictEqual(formatBibleTextMarkdown({ plainText: "", blocks: [] }, options()), "");
  assert.strictEqual(toSuperscript("120-121"), "¹²⁰⁻¹²¹");

  // Another translation than the main one keeps its code, so the reference opens it again; no code: its name.
  const comparison = {
    plainText: "",
    blocks: [{
      type: "comparison",
      title: "Ин 3:16",
      references: [],
      translations: [
        { translationId: "en", translationName: "Test Bible", referenceTitle: "Joh 3:16", references: [], paragraphs: [{ verses: [{ number: 16, text: "For God loved." }] }], footnotes: [] },
        { translationId: "ru", translationName: "Тестовая", referenceTitle: "Ин 3:16", references: [], paragraphs: [{ verses: [{ number: 16, text: "Ведь Бог." }] }], footnotes: [] },
        { translationId: "x", translationName: "Other", referenceTitle: "Jn 3:16", references: [], paragraphs: [{ verses: [{ number: 16, text: "Other." }] }], footnotes: [] },
      ],
    }],
  };
  const codes = options({ getTranslationCode: (id) => ({ en: "ENG" })[id] });
  assert.strictEqual(formatBibleTextMarkdown(comparison, codes), [
    "> [!bible] Joh 3:16 (ENG)\n> ¹⁶ For God loved.",
    "> [!bible] Ин 3:16\n> ¹⁶ Ведь Бог.",
    "> [!bible] Jn 3:16 — Other\n> ¹⁶ Other.",
  ].join("\n\n"));
  assert.strictEqual(formatBibleTextMarkdown(comparison, { ...codes, format: "code-block" }), "```bible\nJoh 3:16 (ENG)\nИн 3:16\nJn 3:16 — Other\n```");

  // The reference under the cursor; the block after its paragraph, with empty lines around it.
  const parse = (text) => [...text.matchAll(/Ин \d+:\d+/g)].map((match) => ({ from: match.index, to: match.index + match[0].length, text: match[0] }));
  let editor = createFakeEditor("Читай Ин 3:16\nи дальше\n\nДругой абзац", { line: 0, ch: 8 });
  assert.deepStrictEqual(findReferenceAtCursor(editor, parse), { line: 0, text: "Ин 3:16" });
  insertBlockAfterParagraph(editor, 0, "> [!bible] Ин 3:16\n> текст");
  assert.strictEqual(editor.getValue(), "Читай Ин 3:16\nи дальше\n\n> [!bible] Ин 3:16\n> текст\n\nДругой абзац");
  assert.deepStrictEqual(editor.getCursor(), { line: 4, ch: 7 });
  editor = createFakeEditor("Нет ссылки", { line: 0, ch: 2 });
  assert.strictEqual(findReferenceAtCursor(editor, parse), null);

  // At the cursor: an empty line between paragraphs gets empty lines around the block; a line with text inserts after its paragraph.
  editor = createFakeEditor("Абзац\n\nДальше", { line: 1, ch: 0 });
  editor = createFakeEditor("Абзац\n\nДальше", { line: 1, ch: 0 });
  insertBlockAtCursor(editor, "> блок");
  assert.strictEqual(editor.getValue(), "Абзац\n\n> блок\n\nДальше");
  editor = createFakeEditor("Абзац\nещё", { line: 0, ch: 1 });
  insertBlockAtCursor(editor, "> блок");
  assert.strictEqual(editor.getValue(), "Абзац\nещё\n\n> блок");
  editor = createFakeEditor("", { line: 0, ch: 0 });
  insertBlockAtCursor(editor, "> блок");
  assert.strictEqual(editor.getValue(), "> блок");

  // The trigger: at the line start or after a space, followed by a letter (or "1 Кор").
  assert.deepStrictEqual(findSuggestTrigger("--Ин 3:16", "--"), { start: 0, query: "Ин 3:16" });
  assert.deepStrictEqual(findSuggestTrigger("Читай --1 Кор", "--"), { start: 6, query: "1 Кор" });
  assert.strictEqual(findSuggestTrigger("---", "--"), null);
  assert.strictEqual(findSuggestTrigger("слово -- тире", "--"), null);
  assert.strictEqual(findSuggestTrigger("a--Ин", "--"), null);
  assert.strictEqual(findSuggestTrigger("--1", "--"), null);
  assert.strictEqual(findSuggestTrigger("--Ин", ""), null);
  assert.strictEqual(findSuggestTrigger("Ин 3:16", "--"), null);

  // Suggestions: books by prefix without repeats; a complete reference gives the reference (and with its text).
  const books = createNavigatorBooks([
    { id: 43, name: "От Иоанна", abbreviation: "Ин", aliases: ["Иоанна"] },
    { id: 59, name: "Иакова", abbreviation: "Иак", aliases: [] },
  ], []);
  const suggest = (query, withText = true) => getReferenceSuggestions(query, [...books, ...books], parse, { withText });
  assert.deepStrictEqual(suggest("И").map((item) => item.book.shortName), ["Ин", "Иак"]);
  assert.deepStrictEqual(suggest("Ин 3:16"), [{ kind: "reference", text: "Ин 3:16" }, { kind: "reference-with-text", text: "Ин 3:16" }]);
  assert.deepStrictEqual(suggest("Ин 3:16", false), [{ kind: "reference", text: "Ин 3:16" }]);
  assert.deepStrictEqual(getReferenceSuggestions("Ин 3:16", books, parse, { withText: true, alternativeFormat: "callout-collapsed" }), [
    { kind: "reference", text: "Ин 3:16" },
    { kind: "reference-with-text", text: "Ин 3:16" },
    { kind: "reference-with-text", text: "Ин 3:16", format: "callout-collapsed" },
  ]);
  assert.deepStrictEqual(suggest("Ин 3:1x"), []);
  assert.deepStrictEqual(suggest("Ин 3"), []);
  assert.deepStrictEqual(suggest(" "), []);

};
