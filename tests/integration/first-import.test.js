const assert = require("assert");
const {
  createEditor,
  editorLinkTexts,
  floatingPreviewText,
  importBible,
  moveCursor,
  noticeMessages,
  renderReadingMode,
  startPlugin,
  stopPlugin,
} = require("./helpers.js");

// The first import works without restarting Obsidian: the editor, the preview and the reading mode
// pick up the new translation (bug 1 of the first analysis: the editor kept the startup snapshot).
module.exports = async function runFirstImportTests() {
  const { app, plugin } = await startPlugin({
    beforeLayoutReady: (testApp) => {
      testApp.vault.setMarkdown("note.md", "Читай Ин 3:16 сегодня");
      testApp.workspace.openMarkdownView("note.md", "preview");
    },
  });
  const readingView = app.workspace.getLeavesOfType("markdown")[0].view;
  const editor = createEditor(plugin, "Читай Ин 3:16 сегодня");

  assert.strictEqual(plugin.context.hasImportedTranslations(), false);
  assert.deepStrictEqual(editorLinkTexts(editor), []);
  assert.deepStrictEqual(renderReadingMode(plugin, "Читай Ин 3:16 сегодня"), []);
  await moveCursor(editor, 8);
  assert.strictEqual(floatingPreviewText(), null);
  assert.deepStrictEqual(readingView.previewMode.rerenderCalls, []);

  await importBible(plugin, "ru");

  assert.strictEqual(plugin.context.hasImportedTranslations(), true);
  assert(noticeMessages().some((message) => message.includes("Тестовая Библия")), "import success notice");
  assert.deepStrictEqual(editorLinkTexts(editor), ["Ин 3:16"]);
  await moveCursor(editor, 9);
  assert.match(floatingPreviewText() ?? "", /Ин 3:16.*Ведь Бог так любит мир\./s);
  assert.deepStrictEqual(renderReadingMode(plugin, "Читай Ин 3:16 сегодня"), ["Ин 3:16"]);
  // One redraw of the open reading view for the whole import (data, order and active translation change in a row).
  assert.deepStrictEqual(readingView.previewMode.rerenderCalls, [true]);

  editor.destroy();
  stopPlugin(plugin);
};
