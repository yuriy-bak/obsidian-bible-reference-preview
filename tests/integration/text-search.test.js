const assert = require("assert");
const { flush, importBible, startPlugin, stopPlugin, translationIdByLanguage, waitFor } = require("./helpers.js");
const { BIBLE_SEARCH_VIEW_TYPE } = require("../../.test-build/src/ui/BibleSearchView.js");
const { BIBLE_READER_VIEW_TYPE } = require("../../.test-build/src/ui/BibleReaderView.js");
const { REFERENCE_USAGE_VIEW_TYPE } = require("../../.test-build/src/ui/ReferenceUsagePaneView.js");

// Bible search: the command opens the panel, results by book open the chapter in the reader, the reader's
// button and its navigator open the search in the reader's translation.
module.exports = async function runTextSearchTests() {
  const { app, plugin } = await startPlugin();
  await importBible(plugin, "ru");
  await importBible(plugin, "en");
  const enId = translationIdByLanguage(plugin, "en");

  const searchView = () => app.workspace.getLeavesOfType(BIBLE_SEARCH_VIEW_TYPE)[0]?.view;
  const type = async (text) => {
    const inputEl = searchView().contentEl.querySelector(".bible-search-input");
    const statusEl = searchView().contentEl.querySelector(".bible-search-status");
    statusEl.textContent = "";
    inputEl.value = text;
    inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await waitFor(() => statusEl.textContent !== "" && !statusEl.textContent.startsWith("Reading"), 2000);
  };
  const resultTexts = () => Array.from(searchView().contentEl.querySelectorAll(".bible-search-result")).map((el) => el.textContent);

  plugin.commands.find((command) => command.id === "search-bible-text").callback();
  await waitFor(() => searchView() !== undefined);
  // Let the command finish revealing and refreshing the panel.
  await flush(10);
  assert.strictEqual(searchView().getIcon(), "search");
  assert.match(searchView().contentEl.querySelector(".bible-search-status").textContent, /prefix|beginning/);

  // Words by their beginning, all of them; highlighted; the main translation first.
  await type("бог мир");
  assert.deepStrictEqual(resultTexts(), ["Ин 3:16Ведь Бог так любит мир.", "Ин 3:17Бог послал Сына в мир."]);
  assert.deepStrictEqual(Array.from(searchView().contentEl.querySelectorAll(".bible-search-highlight")).map((el) => el.textContent), ["Бог", "мир", "Бог", "мир"]);
  assert.match(searchView().contentEl.querySelector(".bible-search-status").textContent, /2/);
  assert.match(searchView().contentEl.querySelector(".bible-search-group-title").textContent, /Иоанна\s*2/);
  await type("\"любит мир\"");
  assert.deepStrictEqual(resultTexts(), ["Ин 3:16Ведь Бог так любит мир."]);
  await type("нет такого слова");
  assert.deepStrictEqual(resultTexts(), []);
  assert.strictEqual(searchView().contentEl.querySelector(".bible-search-status").textContent, plugin.context.t("search.empty"));

  // Scope: the Old Testament has no John.
  await type("бог");
  assert.strictEqual(resultTexts().length, 3);
  const scopeEl = searchView().contentEl.querySelector(".bible-search-scope");
  scopeEl.value = "old";
  scopeEl.dispatchEvent(new Event("change"));
  await flush(20);
  assert.deepStrictEqual(resultTexts(), ["Быт 1:1В начале Бог сотворил небо и землю."]);

  // A result opens its chapter in the reader with the verse highlighted.
  searchView().contentEl.querySelector(".bible-search-result").click();
  await flush();
  const reader = () => app.workspace.getLeavesOfType(BIBLE_READER_VIEW_TYPE)[0]?.view;
  assert.deepStrictEqual(reader().getLocation().target, { book: 1, chapter: 1, highlightedRanges: [{ verseStart: 1, verseEnd: 1 }] });

  // The reader's search button opens the search in the reader's translation.
  const readerTranslationSelect = reader().containerEl.querySelector(".bible-reader-translation-select");
  readerTranslationSelect.value = enId;
  readerTranslationSelect.dispatchEvent(new Event("change"));
  await flush();
  const searchButton = reader().containerEl.querySelector(`.bible-reader-bar button[aria-label="${plugin.context.t("reader.searchTextAria")}"]`);
  assert(searchButton !== null, "no search button in the reader");
  searchButton.click();
  await flush(20);
  assert.strictEqual(searchView().contentEl.querySelector(".bible-search-translation").value, enId);
  await type("god world");
  assert.deepStrictEqual(resultTexts(), ["Joh 3:16For God loved the world so much.", "Joh 3:17For God sent his Son into the world."]);

  // Text typed in the navigator that names no book: the button and Enter search it.
  reader().containerEl.querySelector(".bible-reader-navigator-toggle").click();
  const navigatorEl = reader().containerEl.querySelector(".bible-reader-navigator");
  const searchEl = navigatorEl.querySelector("input");
  searchEl.value = "beginning";
  searchEl.dispatchEvent(new Event("input"));
  const bridge = navigatorEl.querySelector(".bible-reader-navigator-search-text");
  assert(bridge !== null, "no search button in the navigator");
  assert.match(bridge.textContent, /beginning/);
  searchEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await waitFor(() => searchView().contentEl.querySelector(".bible-search-input").value === "beginning");
  await waitFor(() => /found/.test(searchView().contentEl.querySelector(".bible-search-status").textContent), 2000);
  assert.strictEqual(navigatorEl.style.display, "none");
  assert.deepStrictEqual(resultTexts(), ["Ge 1:1In the beginning God created the heavens and the earth.", "Joh 1:1In the beginning was the Word."]);

  // The usages keep their own icon now that the magnifier searches the text.
  const usagesCreator = app.workspace.viewCreators.get(REFERENCE_USAGE_VIEW_TYPE);
  const usagesLeaf = app.workspace.getLeaf();
  assert.strictEqual(usagesCreator(usagesLeaf).getIcon(), "text-quote");

  stopPlugin(plugin);
};
