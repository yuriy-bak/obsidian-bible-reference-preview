// Runs the integration tests: the real plugin from main.ts against a stub of the `obsidian` module.
// A separate process from the unit tests, because it installs a global DOM.
const Module = require("module");
const path = require("path");
const { installDom } = require("./obsidian-stub/dom.js");

installDom();
const STUB_PATH = path.join(__dirname, "obsidian-stub", "obsidian.js");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === "obsidian" ? STUB_PATH : resolveFilename.call(this, request, ...rest);
};

const TEST_FILES = [
  "first-import",
  "translation-switch",
  "reference-usage",
  "plugin-context",
];

(async () => {
  for (const name of TEST_FILES) {
    await require(`./integration/${name}.test.js`)();
  }
  console.log("All integration tests passed.");
  // Timers left by the plugin (debounced saves, notices) must not keep the process alive.
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
