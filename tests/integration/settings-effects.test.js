const assert = require("assert");
const { createEditor, editorLinkTexts, flush, floatingPreviewText, importBible, startPlugin, stopPlugin, waitForEditorLinks } = require("./helpers.js");

// Settings changes reach the services that subscribed to them (PluginContext.onSettingsChanged).
module.exports = async function runSettingsEffectsTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru");
  const view = createEditor(plugin, "Читай Ин 3:16");
  await waitForEditorLinks();
  assert.deepStrictEqual(editorLinkTexts(view), ["Ин 3:16"]);
  const content = await plugin.contentBuilder.analyze("Ин 3:16");
  plugin.preview.show(content);
  await flush();
  assert.notStrictEqual(floatingPreviewText(), null);

  // Turning the plugin off hides the preview, removes the links and updates the ribbon button.
  await plugin.settingsService.setPluginActive(false);
  await waitForEditorLinks();
  assert.strictEqual(floatingPreviewText(), null);
  assert.deepStrictEqual(editorLinkTexts(view), []);
  assert.strictEqual(plugin.pluginActiveRibbonIconEl.classList.contains("is-muted"), true);
  await plugin.settingsService.setPluginActive(true);
  await waitForEditorLinks();
  assert.deepStrictEqual(editorLinkTexts(view), ["Ин 3:16"]);
  assert.strictEqual(plugin.pluginActiveRibbonIconEl.classList.contains("is-active"), true);

  // The interface language reaches the open preview.
  await plugin.settingsService.setInterfaceLanguage("en");
  plugin.preview.show(content);
  await flush();
  const copyButton = document.querySelector(".bible-preview-floating-panel [aria-label]");
  assert(copyButton !== null);
  const labelsEn = Array.from(document.querySelectorAll(".bible-preview-floating-panel [aria-label]")).map((el) => el.getAttribute("aria-label")).join(" ");
  await plugin.settingsService.setInterfaceLanguage("ru");
  await flush();
  const labelsRu = Array.from(document.querySelectorAll(".bible-preview-floating-panel [aria-label]")).map((el) => el.getAttribute("aria-label")).join(" ");
  assert.notStrictEqual(labelsEn, labelsRu);
  assert.match(labelsRu, /[а-я]/);

  view.destroy();
  await stopPlugin(plugin);
};
