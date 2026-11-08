const assert = require("assert");
const { activateTranslation, deleteTranslation, flush, importBible, startPlugin, stopPlugin, translationIdByLanguage } = require("./helpers.js");
const { BIBLE_READER_VIEW_TYPE } = require("../../.test-build/src/ui/BibleReaderView.js");

// A ```bible block renders the passages of its lines from the imported translations and follows the main translation.
module.exports = async function runCodeBlockTests() {
  const { app, plugin } = await startPlugin();
  const handler = plugin.markdownCodeBlockProcessors.get("bible");
  assert(handler !== undefined, "no ```bible processor");

  const renderBlock = async (source) => {
    const el = createDiv();
    document.body.appendChild(el);
    const children = [];
    handler(source, el, { addChild: (child) => { children.push(child); child.load(); } });
    await flush();
    return { el, unload: () => children.forEach((child) => child.unload()) };
  };

  // Without translations the block says where to import one.
  const before = await renderBlock("Ин 3:16");
  assert.match(before.el.textContent, /Import a Bible translation/);
  before.unload();

  await importBible(plugin, "ru");
  await importBible(plugin, "en");
  // Comparison in the preview does not reach the block: one translation per line.
  await plugin.settingsService.setPreviewComparisonEnabled(true);

  const block = await renderBlock("Ин 3:16-17\nне ссылка\nJohn 1:1");
  assert(block.el.classList.contains("bible-code-block"));
  const passages = block.el.querySelectorAll(".bible-code-block-passage");
  // Each line is a passage of its own, in the main translation whatever language the line is in.
  assert.strictEqual(passages.length, 2);
  assert.match(passages[0].textContent, /Ин 3:16-17.*Ведь Бог так любит мир\..*Бог послал Сына в мир\./s);
  assert.match(passages[1].textContent, /Ин 1:1.*В начале было Слово\./s);
  assert.strictEqual(block.el.querySelectorAll(".bible-preview-comparison-block").length, 0);
  assert.deepStrictEqual(Array.from(block.el.querySelectorAll(".bible-code-block-unrecognized")).map((el) => el.textContent), ["не ссылка"]);

  // 📖 opens the chapter in the reader.
  block.el.querySelector(".bible-preview-open-chapter-button").click();
  await flush();
  const [reader] = app.workspace.getLeavesOfType(BIBLE_READER_VIEW_TYPE).map((leaf) => leaf.view);
  assert(reader !== undefined, "no Bible reader open");
  assert.strictEqual(reader.getLocation().target.chapter, 3);

  // Another main translation renders the block again in it.
  await activateTranslation(plugin, "en");
  await flush();
  assert.match(block.el.querySelector(".bible-code-block-passage").textContent, /Joh 3:16-17.*For God loved the world so much\./s);

  // An unloaded block is no longer rendered.
  block.unload();
  const textAfterUnload = block.el.textContent;
  await activateTranslation(plugin, "ru");
  await flush();
  assert.strictEqual(block.el.textContent, textAfterUnload);

  // A translation code shows the line in that translation.
  assert.strictEqual(await plugin.translations.setTranslationCode(translationIdByLanguage(plugin, "en"), "Eng"), null);
  const coded = await renderBlock("Ин 3:16 (ENG)");
  assert.match(coded.el.textContent, /Test Bible.*For God loved the world so much\./s);
  coded.unload();

  // An empty block shows a hint.
  const empty = await renderBlock("\n");
  assert.match(empty.el.textContent, /one per line/);
  empty.unload();

  await deleteTranslation(plugin, "en");
  await deleteTranslation(plugin, "ru");
  stopPlugin(plugin);
};
