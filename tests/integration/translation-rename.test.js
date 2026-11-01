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

// The pencil after a translation's name in the settings list renames it in place; the id and the code stay.
module.exports = async function runTranslationRenameTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru");
  const translationId = translationIdByLanguage(plugin, "ru");
  const oldName = plugin.context.v2Data.translations[translationId].name;
  const oldCode = plugin.context.getTranslationCodes().get(translationId);
  assert.strictEqual(plugin.context.settings.translationCodes[translationId], undefined);

  // Escape cancels: nothing is saved.
  let nameInput = startRename(plugin, translationId);
  assert.strictEqual(nameInput.value, oldName);
  nameInput.value = "Другое";
  nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await flush();
  assert.strictEqual(plugin.context.v2Data.translations[translationId].name, oldName);

  // An empty name is refused with a notice.
  nameInput = startRename(plugin, translationId);
  nameInput.value = "   ";
  nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await waitFor(() => noticeMessages().includes(plugin.context.t("settings.translations.nameRequired")));
  assert.strictEqual(plugin.context.v2Data.translations[translationId].name, oldName);

  // Enter saves the trimmed name to the index; the id stays and the old code is kept for the notes.
  nameInput = startRename(plugin, translationId);
  nameInput.value = "  Мой   перевод ";
  nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await waitFor(() => plugin.context.v2Data.translations[translationId]?.name === "Мой перевод");
  await flush();
  const repository = plugin.context.createRepository();
  await repository.load();
  assert.strictEqual(repository.getV2Data().translations[translationId].name, "Мой перевод");
  assert.strictEqual(plugin.context.settings.translationCodes[translationId], oldCode);
  assert.strictEqual(plugin.context.getTranslationCodes().get(translationId), oldCode);
  assert.strictEqual(plugin.translations.getTranslationSettingsItems()[0].name, "Мой перевод");
  assert.strictEqual(plugin.translations.getActiveTranslationPreviewTitle(), "Мой перевод");

  // Leaving the field saves too; a code the user set is left as it is.
  await plugin.translations.setTranslationCode(translationId, "МП");
  nameInput = startRename(plugin, translationId);
  nameInput.value = "Ещё одно";
  nameInput.dispatchEvent(new Event("blur"));
  await waitFor(() => plugin.context.v2Data.translations[translationId]?.name === "Ещё одно");
  assert.strictEqual(plugin.context.settings.translationCodes[translationId], "МП");

  stopPlugin(plugin);
};

function startRename(plugin, translationId) {
  const definitions = plugin.settingTabs[0].getSettingDefinitions();
  const list = definitions.find((definition) => definition.type === "list" && definition.items.some((item) => item.render !== undefined));
  const index = plugin.translations.getTranslationSettingsItems().findIndex((item) => item.id === translationId);
  const setting = new Setting(document.body.createDiv());
  setting.setName(list.items[index].name);
  list.items[index].render(setting);
  const button = setting.nameEl.querySelector(".bible-translation-rename");
  assert(button, "rename button");
  assert.strictEqual(button.dataset.icon, "pencil");
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const input = setting.nameEl.querySelector("input.bible-translation-name-input");
  assert(input, "name input");
  return input;
}
