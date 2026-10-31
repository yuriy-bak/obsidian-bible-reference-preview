const assert = require("assert");
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

  stopPlugin(plugin);
};
