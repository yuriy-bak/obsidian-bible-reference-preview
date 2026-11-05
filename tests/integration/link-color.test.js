const assert = require("assert");
const { Text } = require("@codemirror/state");
const { createBibleReferenceLinkDecorations } = require("../../.test-build/src/editor/BibleReferenceLinkDecorations.js");
const { createEditor, editorLinkTexts, flush, importBible, startPlugin, stopPlugin, waitForEditorLinks } = require("./helpers.js");

// The link color is one CSS variable on the window's body: editor and reading mode links use it, carry no
// inline color, and a color change reaches links already shown.
module.exports = async function runLinkColorTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru");
  const color = () => document.body.style.getPropertyValue("--bible-reference-link-color");
  assert.strictEqual(color(), plugin.settingsService.getBibleReferenceLinkColor());

  const view = createEditor(plugin, "Читай Ин 3:16 сегодня");
  await waitForEditorLinks();
  assert.deepStrictEqual(editorLinkTexts(view), ["Ин 3:16"]);
  const editorLink = view.contentDOM.querySelector(".bible-reference-link");
  assert.strictEqual(editorLink.getAttribute("style"), null);

  const element = createDiv();
  element.createEl("p", { text: "Читай Ин 3:16" });
  for (const processor of plugin.markdownPostProcessors) processor(element, {});
  const readingLink = element.querySelector(".bible-reference-reading-link");
  assert.strictEqual(readingLink.style.getPropertyValue("--bible-reference-link-color"), "");

  await plugin.settingsService.setBibleReferenceLinkColor("#ff0000");
  await flush();
  assert.strictEqual(color(), "#ff0000");

  view.destroy();

  // A lot of visible text keeps its links: it is parsed in chunks of lines, a long line on its own.
  // (The test DOM has no layout, so the visible ranges are given directly.)
  const filler = "Просто текст без ссылок, только слова.\n".repeat(2000);
  const longLine = "слово ".repeat(5000);
  const doc = Text.of(`Ин 3:16\n${filler}${longLine}Ин 3:17\nИн 3:18`.split("\n"));
  const fakeView = { visibleRanges: [{ from: 0, to: doc.length }], state: { doc } };
  const decorations = createBibleReferenceLinkDecorations({
    view: fakeView,
    activeTranslationId: plugin.context.activeTranslationId,
    cache: new WeakMap(),
    shouldRunBiblePreviewForEditor: () => true,
    hasImportedTranslations: () => true,
    parseMatches: (text) => plugin.context.parseMatches(text),
  });
  const linked = [];
  decorations.between(0, doc.length, (from, to) => { linked.push(doc.sliceString(from, to)); });
  assert(doc.length > 100000);
  assert.deepStrictEqual(linked, ["Ин 3:16", "Ин 3:17", "Ин 3:18"]);

  await stopPlugin(plugin);
  // Unloading removes the variable.
  assert.strictEqual(color(), "");
};
