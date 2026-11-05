const assert = require("assert");
const { flush, importBible, startPlugin, stopPlugin } = require("./helpers.js");

// Commands are listed only where they work: scrolling while a preview or a reader is shown,
// the "under cursor" commands in a note editor.
module.exports = async function runCommandTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru");
  const command = (id) => plugin.commands.find((candidate) => candidate.id === id);

  const scrollDown = command("scroll-bible-preview-panel-page-down");
  assert.strictEqual(scrollDown.callback, undefined);
  assert.strictEqual(scrollDown.checkCallback(true), false, "nothing to scroll");

  const content = await plugin.contentBuilder.analyze("Ин 3:16");
  assert(content !== null);
  plugin.preview.show(content);
  await flush();
  assert.strictEqual(scrollDown.checkCallback(true), true, "the floating preview scrolls");
  plugin.preview.hideFloating();
  await flush();
  assert.strictEqual(scrollDown.checkCallback(true), false, "hidden preview");

  for (const id of ["open-bible-reference-under-cursor", "find-reference-usages-under-cursor", "open-reference-usages-panel-under-cursor"]) {
    assert.strictEqual(typeof command(id).editorCallback, "function", id);
    assert.strictEqual(command(id).callback, undefined, id);
  }

  await stopPlugin(plugin);
};
