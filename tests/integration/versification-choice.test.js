const assert = require("assert");
const { Setting } = require("obsidian");
const {
  flush,
  importBible,
  noticeMessages,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
  waitFor,
} = require("./helpers.js");

// An import whose numbering scheme is not detected reliably asks for it, and the translation list in the
// settings shows the scheme and changes it.
module.exports = async function runVersificationChoiceTests() {
  const { plugin } = await startPlugin();

  // Cancelling the scheme choice cancels the import.
  await importBible(plugin, "ru", undefined, { versification: null });
  assert.strictEqual(plugin.context.hasImportedTranslations(), false);
  assert(noticeMessages().includes(plugin.context.t("notice.importCancelled")), "import cancelled notice");

  // The picked scheme is stored and replaces the "not detected reliably" warning.
  await importBible(plugin, "ru", undefined, { versification: "builtin:rsc" });
  const translationId = translationIdByLanguage(plugin, "ru");
  assert.strictEqual(plugin.context.v2Data.translations[translationId].versification, "builtin:rsc");
  const successNotice = noticeMessages().find((message) => message.includes("Verse numbering"));
  assert.match(successNotice ?? "", /Verse numbering: Russian Synodal/);
  assert.doesNotMatch(successNotice, /Warnings/);

  // The settings list offers every scheme with the stored one selected; a change is saved to the index.
  const select = renderTranslationListItem(plugin, translationId).querySelector("select");
  assert.strictEqual(select.value, "builtin:rsc");
  assert.deepStrictEqual(Array.from(select.options).map((option) => option.value).sort(),
    ["builtin:eng", "builtin:lxx", "builtin:org", "builtin:rsc", "builtin:vul"]);
  select.value = "builtin:eng";
  select.dispatchEvent(new Event("change"));
  await waitFor(() => plugin.context.v2Data.translations[translationId].versification === "builtin:eng");
  await flush();
  const repository = plugin.context.createRepository();
  await repository.load();
  assert.strictEqual(repository.getV2Data().translations[translationId].versification, "builtin:eng");

  stopPlugin(plugin);
};

function renderTranslationListItem(plugin, translationId) {
  const definitions = plugin.settingTabs[0].getSettingDefinitions();
  const list = definitions.find((definition) => definition.type === "list" && definition.items.some((item) => item.render !== undefined));
  const index = plugin.translations.getTranslationSettingsItems().findIndex((item) => item.id === translationId);
  const setting = new Setting(document.body.createDiv());
  list.items[index].render(setting);
  return setting.settingEl;
}
