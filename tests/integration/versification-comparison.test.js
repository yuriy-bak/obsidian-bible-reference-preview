const assert = require("assert");
const {
  flush,
  importBible,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
} = require("./helpers.js");
const { normalizePluginSettings } = require("../../.test-build/src/settings/PluginSettings.js");

// References in notes follow the numbering of the active translation; a compared translation with another
// numbering shows the same passage under its own reference.
module.exports = async function runVersificationComparisonTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru", { withPsalms: true }, { versification: "builtin:rsc" });
  await importBible(plugin, "en", { withPsalms: true }, { versification: "builtin:eng" });
  const ruId = translationIdByLanguage(plugin, "ru");
  const enId = translationIdByLanguage(plugin, "en");
  assert.strictEqual(plugin.context.activeTranslationId, ruId);
  await plugin.settingsService.setPreviewComparisonEnabled(true);
  await plugin.translations.setComparisonTranslationEnabled(enId, true);
  await flush();

  const translations = async (text) => {
    const content = await plugin.contentBuilder.analyze(text);
    assert(content !== null, `no preview for ${text}`);
    return content.blocks
      .filter((block) => block.type === "comparison")
      .flatMap((block) => block.translations)
      .map((translation) => [translation.referenceTitle, translation.paragraphs.flatMap((paragraph) => paragraph.verses.map((verse) => verse.text)).join(" ")]);
  };

  // Ps 22 of the Synodal numbering is Ps 23 in English.
  assert.deepStrictEqual(await translations("Пс 22:1-2"), [
    ["📖 Пс 22:1-2", "Пс 22:1. Пс 22:2."],
    ["📖 Ps 23:1-2", "Ps 23:1. Ps 23:2."],
  ]);
  // The second half of the Synodal Ps 9 is Ps 10 in English; its first verse is the title, verse 0 in English.
  assert.deepStrictEqual(await translations("Пс 9:22-23"), [
    ["📖 Пс 9:22-23", "Пс 9:22. Пс 9:23."],
    ["📖 Ps 10:1-2", "Ps 10:1. Ps 10:2."],
  ]);
  // Books with the same numbering keep the reference.
  assert.deepStrictEqual((await translations("Ин 3:16")).map(([title]) => title), ["📖 Ин 3:16", "📖 Joh 3:16"]);

  // The Bible reader shows one translation; switching it maps the chapter and its highlights:
  // the second half of the Synodal Ps 9 is Ps 10 in English.
  const ruChapterId = translationIdByLanguage(plugin, "ru");
  const chapter = await plugin.contentBuilder.buildChapter({ book: 19, chapter: 9, highlightedRanges: [{ verseStart: 22, verseEnd: 22 }] }, ruChapterId);
  assert.strictEqual(chapter.blocks.some((block) => block.type === "comparison"), false);
  assert.deepStrictEqual(
    chapter.blocks.flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.verses).filter((verse) => verse.highlighted).map((verse) => verse.text),
    ["Пс 9:22."]
  );
  assert.deepStrictEqual(
    plugin.contentBuilder.mapChapterTarget({ book: 19, chapter: 9, highlightedRanges: [{ verseStart: 22, verseEnd: 22 }] }, ruId, enId),
    { book: 19, chapter: 9, highlightedRanges: [] }
  );
  assert.deepStrictEqual(
    plugin.contentBuilder.mapChapterTarget({ book: 19, chapter: 22, highlightedRanges: [{ verseStart: 1, verseEnd: 2 }] }, ruId, enId),
    { book: 19, chapter: 23, highlightedRanges: [{ verseStart: 1, verseEnd: 2 }] }
  );

  // A translation code names the numbering of the reference: Ps 23 of the English text is shown first,
  // then the Synodal Ps 22; anything else works with the active numbering.
  assert.strictEqual(await plugin.translations.setTranslationCode(enId, "a b"), "invalid");
  const ruCode = plugin.context.getTranslationCodes().get(ruId);
  assert.strictEqual(await plugin.translations.setTranslationCode(enId, ruCode.toLowerCase()), "taken");
  assert.strictEqual(await plugin.translations.setTranslationCode(enId, "Eng"), null);
  assert.strictEqual(plugin.context.getTranslationCodes().get(enId), "Eng");
  assert.strictEqual(plugin.translations.getTranslationSettingsItems().find((item) => item.id === enId).code, "Eng");
  assert.deepStrictEqual(await translations("Пс 23:1 (ENG)"), [
    ["📖 Ps 23:1", "Ps 23:1."],
    ["📖 Пс 22:1", "Пс 22:1."],
  ]);
  const [coded] = plugin.context.parseMatches("Пс 23:1 (ENG)");
  assert.deepStrictEqual(coded.references, [{ book: 19, chapterStart: 22, verseStart: 1, chapterEnd: 22, verseEnd: 1 }]);
  // The code of the active translation adds nothing; an unknown code is plain text.
  assert.deepStrictEqual((await translations(`Пс 22:1 (${ruCode})`)).map(([title]) => title), ["📖 Пс 22:1", "📖 Ps 23:1"]);
  assert.deepStrictEqual((await translations("Пс 22:1 (XYZ)")).map(([title]) => title), ["📖 Пс 22:1", "📖 Ps 23:1"]);
  // Coded and plain references of one paragraph keep their own blocks.
  assert.deepStrictEqual((await translations("Пс 22:1 и Пс 23:2 (ENG)")).map(([title]) => title), ["📖 Пс 22:1", "📖 Ps 23:1", "📖 Ps 23:2", "📖 Пс 22:2"]);
  assert.deepStrictEqual(normalizePluginSettings({ translationCodes: { a: "СП", b: "a b", c: 5 } }).translationCodes, { a: "СП" });
  // An empty code brings back the default one.
  assert.strictEqual(await plugin.translations.setTranslationCode(enId, " "), null);
  assert.notStrictEqual(plugin.context.getTranslationCodes().get(enId), "Eng");

  stopPlugin(plugin);
};
