const assert = require("assert");
const {
  activateTranslation,
  createEditor,
  deleteTranslation,
  editorLinkTexts,
  floatingPreviewText,
  importBible,
  moveCursor,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
  waitForEditorLinks,
} = require("./helpers.js");

const floatingPanelText = () => document.querySelector(".bible-preview-floating-panel").textContent;

// Switching, re-importing and deleting translations reach the editor links, the parser and the open preview.
module.exports = async function runTranslationSwitchTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru");
  const editor = createEditor(plugin, "Читай Ин 3:16 и John 3:16");
  await waitForEditorLinks();
  assert.deepStrictEqual(editorLinkTexts(editor), ["Ин 3:16"]);
  await moveCursor(editor, 8);
  assert.match(floatingPanelText(), /Тестовая Библия.*Ин 3:16.*Ведь Бог так любит мир\.$/s);

  // Another import goes to the end of the list: the main translation, the links and the open preview stay.
  await importBible(plugin, "en");
  assert.deepStrictEqual(plugin.context.settings.translationOrder, ["ru", "en"].map((language) => translationIdByLanguage(plugin, language)));
  assert.deepStrictEqual(editorLinkTexts(editor), ["Ин 3:16"]);
  assert.match(floatingPanelText(), /Тестовая Библия.*Ин 3:16.*Ведь Бог так любит мир\.$/s);

  // Switching to it from the settings list: English book names, and the open preview follows.
  await activateTranslation(plugin, "en");
  assert.deepStrictEqual(editorLinkTexts(editor), ["John 3:16"]);
  assert.match(floatingPanelText(), /Test Bible.*Joh 3:16.*For God loved the world so much\.$/s);

  // Back to the Russian translation from the settings list.
  await activateTranslation(plugin, "ru");
  assert.deepStrictEqual(editorLinkTexts(editor), ["Ин 3:16"]);
  assert.match(floatingPanelText(), /Тестовая Библия.*Ин 3:16.*Ведь Бог так любит мир\.$/s);

  // A re-import replaces the text, not only the book names, and keeps the translation's place in the list.
  await importBible(plugin, "en");
  assert.deepStrictEqual(editorLinkTexts(editor), ["Ин 3:16"]);
  await importBible(plugin, "ru", { revised: true });
  assert.deepStrictEqual(plugin.context.settings.translationOrder, ["ru", "en"].map((language) => translationIdByLanguage(plugin, language)));
  assert.match(floatingPreviewText(), /Ведь Бог так любит мир\. \(rev\.\)$/);

  // Deleting another translation keeps the active one; deleting the last one turns everything off.
  await deleteTranslation(plugin, "en");
  assert.deepStrictEqual(editorLinkTexts(editor), ["Ин 3:16"]);
  assert.match(floatingPreviewText(), /\(rev\.\)$/);
  await deleteTranslation(plugin, "ru");
  await waitForEditorLinks();
  assert.strictEqual(plugin.context.hasImportedTranslations(), false);
  assert.deepStrictEqual(editorLinkTexts(editor), []);
  assert.strictEqual(floatingPreviewText(), null);

  editor.destroy();
  stopPlugin(plugin);
};
