const assert = require("assert");
const { Setting } = require("obsidian");
const {
  deleteTranslation,
  flush,
  findModal,
  importBible,
  noticeMessages,
  renderReadingMode,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
  waitFor,
} = require("./helpers.js");

// "Book names" in a translation's row of the settings: the user's names are recognized in references,
// a name another book has is refused, a re-import keeps them and deleting the translation removes them.
module.exports = async function runBookNamesTests() {
  const { plugin } = await startPlugin();
  await importBible(plugin, "ru");
  const ruId = translationIdByLanguage(plugin, "ru");
  assert.deepStrictEqual(renderReadingMode(plugin, "Йн 3:16"), []);

  let modal = openBookNames(plugin, ruId);
  assert.strictEqual(modal.titleEl.textContent, plugin.context.t("modal.bookAliases.title", { translationName: plugin.context.v2Data.translations[ruId].name }));
  let row = bookRow(modal, 43);
  assert.deepStrictEqual(chips(row), ["Иоанна", "Ин"]);

  // Escape cancels.
  let input = startEdit(row);
  input.value = "Йн";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await flush();
  assert.deepStrictEqual(plugin.context.settings.bookAliases, {});

  // A name of another book is refused with a notice; the field stays open.
  input = startEdit(bookRow(modal, 43));
  input.value = "Йн, Быт";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  const conflict = plugin.context.t("modal.bookAliases.conflict", { alias: "Быт", book: "Бытие" });
  await waitFor(() => noticeMessages().includes(conflict));
  assert.deepStrictEqual(plugin.context.settings.bookAliases, {});
  assert(bookRow(modal, 43).querySelector("input.bible-book-aliases-input.mod-error"), "the field stays open");

  // Fixed: saved, shown as the user's chips, recognized at once.
  input.value = "Йн, Иоан.";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await waitFor(() => chips(bookRow(modal, 43), ".mod-custom").length === 2);
  row = bookRow(modal, 43);
  assert.deepStrictEqual(chips(row, ".mod-custom"), ["Йн", "Иоан."]);
  assert.deepStrictEqual(renderReadingMode(plugin, "Йн 3:16; Иоан 1:1"), ["Йн 3:16", "Иоан 1:1"]);
  assert.strictEqual(plugin.savedData.bookAliases[ruId][43].join(","), "Йн,Иоан.");

  // The search finds a book by its names, the user's too.
  const search = modal.contentEl.querySelector(".bible-book-aliases-search");
  search.value = "йн";
  search.dispatchEvent(new Event("input"));
  assert.deepStrictEqual(Array.from(modal.contentEl.querySelectorAll(".bible-book-aliases-row")).map((el) => el.dataset.bookId), ["43"]);
  modal.close();
  assert.strictEqual(plugin.translations.getTranslationSettingsItems()[0].customBookAliasCount, 2);

  // A re-import of the translation keeps them.
  await importBible(plugin, "ru", { revised: true });
  assert.deepStrictEqual(renderReadingMode(plugin, "Йн 3:16"), ["Йн 3:16"]);

  // An empty field removes them.
  modal = openBookNames(plugin, ruId);
  input = startEdit(bookRow(modal, 43));
  input.value = "";
  input.dispatchEvent(new Event("blur"));
  await waitFor(() => plugin.context.settings.bookAliases[ruId] === undefined);
  await flush();
  assert.deepStrictEqual(renderReadingMode(plugin, "Йн 3:16"), []);
  modal.close();

  // Deleting the translation removes its names.
  await plugin.translations.setCustomBookAliases(ruId, 43, ["Йн"]);
  await importBible(plugin, "en");
  await deleteTranslation(plugin, "ru");
  assert.strictEqual(plugin.context.settings.bookAliases[ruId], undefined);

  stopPlugin(plugin);

  // Saved settings are cleaned when loaded: by translation and book, empty entries dropped.
  const { plugin: reloaded } = await startPlugin({
    savedData: { interfaceLanguage: "en", bookAliases: { rst: { 43: [" Йн ", "йн", 5], abc: ["x"], 0: ["y"], 1: [] }, kjv: "bad", empty: {} } },
  });
  assert.deepStrictEqual(reloaded.context.settings.bookAliases, { rst: { 43: ["Йн"] } });
  stopPlugin(reloaded);
};

function openBookNames(plugin, translationId) {
  const definitions = plugin.settingTabs[0].getSettingDefinitions();
  const list = definitions.find((definition) => definition.type === "list" && definition.items.some((item) => item.render !== undefined));
  const index = plugin.translations.getTranslationSettingsItems().findIndex((item) => item.id === translationId);
  const setting = new Setting(document.body.createDiv());
  list.items[index].render(setting);
  const button = setting.infoEl.querySelector(".bible-translation-book-names");
  assert(button, "book names button");
  button.click();
  const modal = findModal("BookAliasesModal");
  assert(modal, "book names window");
  return modal;
}

function bookRow(modal, bookId) {
  const row = modal.contentEl.querySelector(`.bible-book-aliases-row[data-book-id="${bookId}"]`);
  assert(row, `row of book ${bookId}`);
  return row;
}

function chips(row, modifier = ":not(.mod-custom)") {
  return Array.from(row.querySelectorAll(`.bible-book-alias-chip${modifier}`)).map((el) => el.textContent);
}

function startEdit(row) {
  row.querySelector(".bible-book-aliases-edit").click();
  const input = row.querySelector("input.bible-book-aliases-input");
  assert(input, "edit field");
  return input;
}
