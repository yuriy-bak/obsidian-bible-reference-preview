const assert = require("assert");
const {
  flush,
  importBible,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
} = require("./helpers.js");

// References in notes follow the numbering of the active translation; a compared translation with another
// numbering shows the same passage under its own reference.
module.exports = async function runVersificationComparisonTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "en", { withPsalms: true }, { versification: "builtin:eng" });
  await importBible(plugin, "ru", { withPsalms: true }, { versification: "builtin:rsc" });
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

  // The chapter view of the Synodal Ps 9 shows Ps 9 and Ps 10 in English, highlighting the same verse.
  const chapter = await plugin.contentBuilder.buildChapter({ book: 19, chapter: 9, highlightedRanges: [{ verseStart: 22, verseEnd: 22 }] });
  const [ru, en] = chapter.blocks.find((block) => block.type === "comparison").translations;
  const highlighted = (translation) => translation.paragraphs.flatMap((paragraph) => paragraph.verses)
    .filter((verse) => verse.highlighted).map((verse) => verse.text);
  assert.deepStrictEqual(highlighted(ru), ["Пс 9:22."]);
  assert.match(en.referenceTitle, /Ps 9:1-20; 10:1-18|Ps 9:1-10:18/);
  assert.deepStrictEqual(highlighted(en), ["Ps 10:1."]);
  assert.strictEqual(en.paragraphs.flatMap((paragraph) => paragraph.verses).length, 38);

  stopPlugin(plugin);
};
