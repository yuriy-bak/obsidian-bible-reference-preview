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

  await importBible(plugin, "en");
  assert.strictEqual(notifications, 2, "another language notifies once per import");
  assert.notStrictEqual(context.parserSignature, russianSignature);
  const englishSignature = context.parserSignature;

  // Back to the Russian names; the signature now also covers the code of the English translation.
  await activateTranslation(plugin, "ru");
  assert.strictEqual(notifications, 3);
  assert.notStrictEqual(context.parserSignature, englishSignature);
  await activateTranslation(plugin, "ru");
  assert.strictEqual(notifications, 3, "an order that keeps the active translation does not notify");

  stopPlugin(plugin);
};
