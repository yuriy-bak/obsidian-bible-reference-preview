const assert = require("assert");
const obsidian = require("obsidian");
const { activateTranslation, importBible, startPlugin, stopPlugin } = require("./helpers.js");

// PluginContext tells its listeners (editor links, reading views, usage index) only about a real parser change.
module.exports = async function runPluginContextTests() {
  const { plugin } = await startPlugin();
  const context = plugin.context;
  let notifications = 0;
  context.onBookMappingChanged(() => { notifications += 1; });

  await importBible(plugin, "ru");
  assert.strictEqual(notifications, 1, "the first import changes the parser");
  const russianSignature = context.parserSignature;

  context.updateBookMapping();
  assert.strictEqual(notifications, 1, "the same book names do not notify");
  await importBible(plugin, "ru");
  assert.strictEqual(notifications, 1, "re-importing the same translation does not notify");

  // Another translation goes to the end of the list: Russian names stay, the parser only learns its code.
  await importBible(plugin, "en");
  assert.strictEqual(notifications, 2, "the code of the new translation notifies once");
  assert.notStrictEqual(context.parserSignature, russianSignature);
  const withEnglishCodeSignature = context.parserSignature;

  await activateTranslation(plugin, "en");
  assert.strictEqual(notifications, 3, "another language notifies");
  assert.notStrictEqual(context.parserSignature, withEnglishCodeSignature);
  await activateTranslation(plugin, "ru");
  assert.strictEqual(notifications, 4);
  assert.strictEqual(context.parserSignature, withEnglishCodeSignature);
  await activateTranslation(plugin, "ru");
  assert.strictEqual(notifications, 4, "an order that keeps the active translation does not notify");

  // "Plugin settings" in the preview menus opens Obsidian settings on this plugin's tab.
  const settingCalls = [];
  plugin.app.setting = {
    open: () => settingCalls.push("open"),
    openTabById: (id) => settingCalls.push(`tab:${id}`),
  };
  const paneInput = plugin.preview.createPaneViewInput();
  const floatingInput = plugin.preview.createFloatingWindowInput();
  assert.strictEqual(paneInput.getOpenSettingsText(), "Plugin settings");
  assert.strictEqual(typeof floatingInput.onOpenSettings, "function");
  const menu = new obsidian.Menu();
  require("../../.test-build/src/ui/BiblePreviewHeader.js").addOpenSettingsMenuItem(menu, paneInput);
  assert.strictEqual(menu.items.length, 1);
  assert.strictEqual(menu.items[0].icon, "settings");
  menu.items[0].callback();
  assert.deepStrictEqual(settingCalls, ["open", `tab:${plugin.manifest.id}`]);

  delete plugin.app.setting;
  context.openPluginSettings();

  stopPlugin(plugin);
};
