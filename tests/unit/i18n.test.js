const assert = require("assert");

// Both interface languages have every message, with the same placeholders.
module.exports = async () => {
  const { messages } = require("../../.test-build/src/i18n/I18n.js");
  const placeholders = (text) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort().join(",");
  for (const key of Object.keys(messages.en)) {
    assert(typeof messages.ru[key] === "string", `ru misses ${key}`);
    assert.strictEqual(placeholders(messages.ru[key]), placeholders(messages.en[key]), `placeholders of ${key}`);
  }
  for (const key of Object.keys(messages.ru)) {
    assert(typeof messages.en[key] === "string", `en misses ${key}`);
  }
  // The shortcut hint names the command as the command palette shows it.
  assert(messages.ru["settings.hotkey.desc"].includes("«{command}»"));
  assert(!/Settings|Hotkeys/.test(messages.ru["settings.hotkey.desc"]));
};
