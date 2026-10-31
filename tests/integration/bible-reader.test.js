const assert = require("assert");
const {
  deleteTranslation,
  flush,
  importBible,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
} = require("./helpers.js");
const { BIBLE_READER_VIEW_TYPE } = require("../../.test-build/src/ui/BibleReaderView.js");

// The Bible reader: 📖 in the preview opens the chapter in the translation it stands at, in that translation's
// numbering; the reader navigates, finds usages in the active numbering and does not remember its translation.
module.exports = async function runBibleReaderTests() {
  const { app, plugin } = await startPlugin();
  await importBible(plugin, "ru", { withPsalms: true }, { versification: "builtin:rsc" });
  await importBible(plugin, "en", { withPsalms: true }, { versification: "builtin:eng" });
  const ruId = translationIdByLanguage(plugin, "ru");
  const enId = translationIdByLanguage(plugin, "en");
  assert.strictEqual(plugin.context.activeTranslationId, ruId);

  const readers = () => app.workspace.getLeavesOfType(BIBLE_READER_VIEW_TYPE).map((leaf) => leaf.view);
  const reader = () => {
    const [view] = readers();
    assert(view !== undefined, "no Bible reader open");
    return view;
  };
  const readerText = () => reader().containerEl.querySelector(".bible-reader-content").textContent;
  const highlightedVerses = () => Array.from(reader().containerEl.querySelectorAll(".bible-preview-verse-highlighted")).map((el) => el.textContent.trim());
  const openChapterButtons = () => Array.from(document.querySelectorAll(".bible-preview-floating-panel .bible-preview-open-chapter-button"));
  const showPreview = async (text) => {
    const content = await plugin.contentBuilder.analyze(text);
    assert(content !== null, `no preview for ${text}`);
    plugin.preview.show(content);
    await flush();
  };
  const navigationButton = (label) => Array.from(reader().containerEl.querySelectorAll(".bible-preview-chapter-navigation-button"))
    .find((button) => button.getAttribute("aria-label") === label);

  // Comparison: each translation's 📖 opens the chapter in that translation (Ps 22 Synodal = Ps 23 English).
  await plugin.settingsService.setPreviewComparisonEnabled(true);
  await plugin.translations.setComparisonTranslationEnabled(enId, true);
  await flush();
  await showPreview("Пс 22:1");
  assert.strictEqual(openChapterButtons().length, 2);
  openChapterButtons()[1].click();
  await flush();
  assert.strictEqual(readers().length, 1);
  assert.deepStrictEqual(reader().getLocation().target, { book: 19, chapter: 23, highlightedRanges: [{ verseStart: 1, verseEnd: 1 }] });
  assert.strictEqual(reader().getLocation().translationId, enId);
  assert.strictEqual(reader().getDisplayText(), "Ps 23");
  assert.match(reader().containerEl.querySelector(".bible-preview-header-title").textContent, /Test Bible/);
  // Compared translations keep their order; the same verse is highlighted in each numbering.
  assert.deepStrictEqual(highlightedVerses(), ["1 Пс 22:1.", "1 Ps 23:1."]);
  // The saved state keeps the chapter in the active numbering and no translation.
  assert.deepStrictEqual(reader().getState(), { book: 19, chapter: 22 });

  // The main translation's 📖 reuses the open reader.
  openChapterButtons()[0].click();
  await flush();
  assert.strictEqual(readers().length, 1);
  assert.strictEqual(reader().getLocation().translationId, ruId);
  assert.strictEqual(reader().getLocation().target.chapter, 22);

  // A translation code: the chapter opens in the coded translation, even without comparison.
  await plugin.settingsService.setPreviewComparisonEnabled(false);
  assert.strictEqual(await plugin.translations.setTranslationCode(enId, "Eng"), null);
  await showPreview("Пс 23:1 (ENG)");
  openChapterButtons()[0].click();
  await flush();
  assert.strictEqual(reader().getLocation().translationId, enId);
  assert.strictEqual(reader().getLocation().target.chapter, 23);

  // The active translation not compared: the shown translation is the first compared one, and 📖 follows it.
  await plugin.settingsService.setPreviewComparisonEnabled(true);
  await plugin.translations.setComparisonTranslationEnabled(ruId, false);
  await flush();
  await showPreview("Пс 22:1");
  assert.strictEqual(openChapterButtons().length, 1);
  openChapterButtons()[0].click();
  await flush();
  assert.strictEqual(reader().getLocation().translationId, enId);
  assert.strictEqual(reader().getLocation().target.chapter, 23);
  await plugin.translations.setComparisonTranslationEnabled(ruId, true);
  await plugin.settingsService.setPreviewComparisonEnabled(false);
  await flush();

  // Navigation: next and previous chapter in the reader's translation; the opened verses are highlighted again on return.
  await showPreview("Пс 22:1");
  openChapterButtons()[0].click();
  await flush();
  assert.deepStrictEqual(highlightedVerses(), ["1 Пс 22:1."]);
  navigationButton(plugin.context.t("preview.nextChapterAria")).click();
  await flush();
  assert.strictEqual(reader().getLocation().target.chapter, 23);
  assert.deepStrictEqual(highlightedVerses(), []);
  navigationButton(plugin.context.t("preview.previousChapterAria")).click();
  await flush();
  assert.deepStrictEqual(highlightedVerses(), ["1 Пс 22:1."]);

  // Usages of the chapter follow the active numbering whatever the reader's translation.
  const usageLocations = [];
  const countUsagesInChapter = plugin.referenceUsage.countUsagesInChapter.bind(plugin.referenceUsage);
  plugin.referenceUsage.countUsagesInChapter = (location) => {
    usageLocations.push(location);
    return countUsagesInChapter(location);
  };
  await reader().refresh();
  await plugin.reader.openChapter({ book: 19, chapter: 23, highlightedRanges: [] }, enId);
  await flush();
  assert.deepStrictEqual(usageLocations.slice(-1), [{ book: 19, chapter: 22 }]);
  plugin.referenceUsage.countUsagesInChapter = countUsagesInChapter;

  // Back shows the preview as it is now: the note and the floating window with the last reference.
  const noteView = app.workspace.openMarkdownView("note.md", "source");
  navigationButton(plugin.context.t("preview.chapterBackAria")).click();
  await flush();
  assert.strictEqual(app.workspace.activeLeaf, noteView.leaf);
  assert(plugin.preview.getCurrentContent() !== null);
  noteView.leaf.detach();

  // Restored by Obsidian with the saved state: the active translation, the chapter in its numbering.
  const restoredLeaf = app.workspace.getLeaf("tab");
  await restoredLeaf.setViewState({ type: BIBLE_READER_VIEW_TYPE, state: reader().getState() });
  await flush();
  assert.strictEqual(restoredLeaf.view.getLocation().translationId, ruId);
  assert.strictEqual(restoredLeaf.view.getLocation().target.chapter, 22);
  assert.strictEqual(restoredLeaf.view.getLocation().fromPreview, false);
  restoredLeaf.detach();

  // The command reveals the open reader (a reader opened from it has no Back); without one it opens the first chapter of the active translation.
  const command = plugin.commands.find((candidate) => candidate.id === "open-bible-reader");
  await command.callback();
  await flush();
  assert.strictEqual(readers().length, 1);
  for (const view of readers()) view.leaf.detach();
  await command.callback();
  await flush();
  assert.strictEqual(readers().length, 1);
  assert.strictEqual(reader().getLocation().translationId, ruId);
  assert.deepStrictEqual(reader().getLocation().target, { book: 1, chapter: 1, highlightedRanges: [] });
  assert.strictEqual(navigationButton(plugin.context.t("preview.chapterBackAria")), undefined);
  assert.match(readerText(), /В начале Бог сотворил небо и землю\./);

  // A first reader from the command opens with the book picker.
  const navigatorEl = () => reader().containerEl.querySelector(".bible-reader-navigator");
  const isNavigatorOpen = () => navigatorEl().style.display !== "none";
  const searchNavigator = (text) => {
    const searchEl = navigatorEl().querySelector("input");
    searchEl.value = text;
    searchEl.dispatchEvent(new Event("input"));
    searchEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  };
  const navigatorButton = (text) => Array.from(navigatorEl().querySelectorAll(".bible-reader-navigator-button"))
    .find((button) => button.textContent === text);
  assert(isNavigatorOpen());
  assert.deepStrictEqual(
    Array.from(navigatorEl().querySelectorAll(".bible-reader-navigator-section-title")).map((el) => el.textContent),
    [plugin.context.t("reader.navigator.oldTestament"), plugin.context.t("reader.navigator.newTestament")]
  );

  // A typed reference opens its chapter with the verse highlighted.
  searchNavigator("Ин 3:16");
  await flush();
  assert(!isNavigatorOpen());
  assert.deepStrictEqual(reader().getLocation().target, { book: 43, chapter: 3, highlightedRanges: [{ verseStart: 16, verseEnd: 16 }] });
  assert.deepStrictEqual(highlightedVerses(), ["16 Ведь Бог так любит мир."]);

  // The chapter title opens the navigator: a book, then a chapter from the grid.
  reader().containerEl.querySelector(".bible-reader-navigator-toggle").click();
  assert(isNavigatorOpen());
  assert(navigatorButton("Ин").classList.contains("is-current"));
  navigatorButton("Пс").click();
  assert(navigatorButton("22") !== undefined);
  navigatorButton("22").click();
  await flush();
  assert.deepStrictEqual(reader().getLocation().target, { book: 19, chapter: 22, highlightedRanges: [] });

  // The translation selector reads the same passage in another numbering; the default translation stays.
  reader().openNavigator();
  searchNavigator("Пс 22:1");
  await flush();
  const translationSelect = () => reader().containerEl.querySelector(".bible-reader-translation-select");
  assert.strictEqual(translationSelect().value, ruId);
  translationSelect().value = enId;
  translationSelect().dispatchEvent(new Event("change"));
  await flush();
  assert.strictEqual(reader().getLocation().translationId, enId);
  assert.deepStrictEqual(reader().getLocation().target, { book: 19, chapter: 23, highlightedRanges: [{ verseStart: 1, verseEnd: 1 }] });
  assert.deepStrictEqual(highlightedVerses(), ["1 Ps 23:1."]);
  assert.strictEqual(plugin.context.activeTranslationId, ruId);
  // Back to its first chapter in the reader's translation keeps the highlight in that numbering.
  navigationButton(plugin.context.t("preview.previousChapterAria")).click();
  await flush();
  assert.deepStrictEqual(highlightedVerses(), []);
  navigationButton(plugin.context.t("preview.nextChapterAria")).click();
  await flush();
  assert.deepStrictEqual(highlightedVerses(), ["1 Ps 23:1."]);

  // "Go to book and chapter" opens the navigator of the open reader.
  await plugin.commands.find((candidate) => candidate.id === "go-to-bible-chapter").callback();
  await flush();
  assert(isNavigatorOpen());
  navigatorEl().querySelector("input").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(!isNavigatorOpen());

  // The comparison button of the reader switches the shared setting and shows the compared text.
  await plugin.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  const comparisonButton = reader().containerEl.querySelectorAll(".bible-preview-header button")[1];
  comparisonButton.click();
  await flush();
  assert.strictEqual(plugin.context.settings.previewComparisonEnabled, true);
  assert.match(readerText(), /For God loved the world so much\./);
  // In the reader, 📖 stands only at the other translations and reads the chapter in that one.
  const readerChapterButtons = () => Array.from(reader().containerEl.querySelectorAll(".bible-preview-open-chapter-button"));
  assert.strictEqual(readerChapterButtons().length, 1);
  readerChapterButtons()[0].click();
  await flush();
  assert.strictEqual(reader().getLocation().translationId, enId);
  assert.strictEqual(reader().getLocation().target.chapter, 3);

  // Ctrl/Cmd-click in the preview opens another reader tab.
  await showPreview("Ин 3:16");
  openChapterButtons()[0].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
  await flush();
  assert.strictEqual(readers().length, 2);
  readers()[1].leaf.detach();

  // Deleting the reader's translation shows the active one.
  await plugin.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] }, enId);
  await flush();
  assert.strictEqual(reader().getLocation().translationId, enId);
  await deleteTranslation(plugin, "en");
  assert.strictEqual(reader().getLocation().translationId, ruId);
  assert.match(readerText(), /Ведь Бог так любит мир\./);

  stopPlugin(plugin);
};
