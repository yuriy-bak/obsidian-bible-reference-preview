const {
  assert,
  getBibleIndexDataDirectoryPath,
  getBiblePluginLocaleForLanguage,
  getPluginDirectoryPath,
  normalizeBiblePluginLocale,
} = require("../helpers");

module.exports = async () => {
  // Default interface language follows Obsidian: Russian only for Russian, English otherwise.
  assert.strictEqual(getBiblePluginLocaleForLanguage("ru"), "ru");
  assert.strictEqual(getBiblePluginLocaleForLanguage("ru-RU"), "ru");
  assert.strictEqual(getBiblePluginLocaleForLanguage("en"), "en");
  assert.strictEqual(getBiblePluginLocaleForLanguage("uk"), "en");
  assert.strictEqual(getBiblePluginLocaleForLanguage("be"), "en");
  assert.strictEqual(getBiblePluginLocaleForLanguage("zh-TW"), "en");
  assert.strictEqual(getBiblePluginLocaleForLanguage(""), "en");
  assert.strictEqual(normalizeBiblePluginLocale("ru", "en"), "ru");
  assert.strictEqual(normalizeBiblePluginLocale("en", "ru"), "en");
  assert.strictEqual(normalizeBiblePluginLocale(undefined, "en"), "en");
  assert.strictEqual(normalizeBiblePluginLocale("de", "ru"), "ru");

  // Plugin folder: manifest.dir when Obsidian sets it, otherwise inside the vault configuration folder.
  assert.strictEqual(getPluginDirectoryPath({ id: "bible-reference-preview", dir: ".obsidian/plugins/brp" }, ".config"), ".obsidian/plugins/brp");
  assert.strictEqual(getPluginDirectoryPath({ id: "bible-reference-preview" }, ".config"), ".config/plugins/bible-reference-preview");
  assert.strictEqual(getBibleIndexDataDirectoryPath({ id: "bible-reference-preview" }, ".obsidian"), ".obsidian/plugins/bible-reference-preview/data");
};
