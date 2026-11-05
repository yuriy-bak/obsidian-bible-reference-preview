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
  // The floating window is a named non-modal dialog; its text can take the keyboard focus but does not take it.
  const panel = document.querySelector(".bible-preview-floating-panel");
  assert.strictEqual(panel.getAttribute("role"), "dialog");
  assert.strictEqual(panel.getAttribute("aria-modal"), "false");
  assert(panel.getAttribute("aria-label").length > 0);
  assert(!/📖/.test(panel.getAttribute("aria-label")));
  assert.strictEqual(panel.querySelector(".bible-preview-floating-content").getAttribute("tabindex"), "0");
  assert(!panel.contains(document.activeElement));
  plugin.preview.hideFloating();
  await flush();
  assert.strictEqual(scrollDown.checkCallback(true), false, "hidden preview");

  for (const id of ["open-bible-reference-under-cursor", "find-reference-usages-under-cursor", "open-reference-usages-panel-under-cursor"]) {
    assert.strictEqual(typeof command(id).editorCallback, "function", id);
    assert.strictEqual(command(id).callback, undefined, id);
  }

  await stopPlugin(plugin);
};
