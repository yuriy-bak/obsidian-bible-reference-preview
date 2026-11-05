const assert = require("assert");
const path = require("path");
const { flush, importBible, startPlugin, stopPlugin, translationIdByLanguage } = require("./helpers.js");
const { BIBLE_READER_VIEW_TYPE } = require("../../.test-build/src/ui/BibleReaderView.js");
const { BIBLE_PREVIEW_VIEW_TYPE } = require("../../.test-build/src/ui/BiblePreviewPaneView.js");
const { normalizePluginSettings } = require("../../.test-build/src/settings/PluginSettings.js");

const { Platform } = require(path.join(__dirname, "..", "obsidian-stub", "obsidian.js"));

// Obsidian's phone layout: the workspace row and the navbar in the app container.
function createPhoneLayout() {
  const appContainerEl = document.body.createDiv({ cls: "app-container" });
  appContainerEl.createDiv({ cls: "horizontal-main-container" });
  appContainerEl.createDiv({ cls: "mobile-navbar" });
  return appContainerEl;
}

function createMenu() {
  const items = [];
  return {
    items,
    addItem(build) {
      const item = { title: "", onClickCallback: null };
      const builder = {
        setTitle(title) { item.title = title; return builder; },
        setIcon() { return builder; },
        setSection() { return builder; },
        onClick(callback) { item.onClickCallback = callback; return builder; },
      };
      build(builder);
      items.push(item);
      return this;
    },
  };
}

// The Bible reader under the note on a phone: where it opens, what it remembers, how it closes.
module.exports = async function runReaderSplitTests() {
  // Saved settings: unknown values fall back, the share is clamped, the panel state keeps only what it can open.
  const defaults = normalizePluginSettings({});
  assert.strictEqual(defaults.phoneReaderPlacement, "tab");
  assert.deepStrictEqual(defaults.readerSplit, { open: false });
  assert.strictEqual(normalizePluginSettings({ phoneReaderPlacement: "side" }).phoneReaderPlacement, "tab");
  assert.strictEqual(normalizePluginSettings({ readerSplitRatio: 5 }).readerSplitRatio, 0.8);
  assert.deepStrictEqual(normalizePluginSettings({ readerSplit: { open: true, book: 1, chapter: 0, translationId: "x" } }).readerSplit, { open: true, translationId: "x" });
  assert.deepStrictEqual(normalizePluginSettings({ readerSplit: { open: "yes", book: 1, chapter: 1 } }).readerSplit, { open: false, book: 1, chapter: 1 });

  Platform.isPhone = true;
  try {
    await runOnPhone();
  } finally {
    Platform.isPhone = false;
  }
  await runOnDesktop();
};

async function runOnPhone() {
  createPhoneLayout();
  const { app, plugin } = await startPlugin();
  await importBible(plugin, "ru", { withPsalms: true }, { versification: "builtin:rsc" });
  await importBible(plugin, "en", { withPsalms: true }, { versification: "builtin:eng" });
  const ruId = translationIdByLanguage(plugin, "ru");
  const enId = translationIdByLanguage(plugin, "en");

  const readers = () => app.workspace.getLeavesOfType(BIBLE_READER_VIEW_TYPE).map((leaf) => leaf.view);
  const splitEl = () => document.querySelector(".bible-reader-split");
  const splitText = () => splitEl().querySelector(".bible-reader-content").textContent;
  const splitButton = (label) => Array.from(splitEl().querySelectorAll(".bible-reader-bar button"))
    .find((button) => button.getAttribute("aria-label") === label);
  const command = (id) => plugin.commands.find((item) => item.id === id);
  const t = (key) => plugin.context.t(key);

  // In a tab by default: nothing changes for those who do not choose the panel.
  assert.strictEqual(plugin.context.settings.phoneReaderPlacement, "tab");
  await plugin.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  assert.strictEqual(readers().length, 1);
  assert.strictEqual(splitEl(), null);
  readers()[0].leaf.detach();

  // Under the note: right after the workspace, above the navbar; no reader tab.
  await plugin.settingsService.setPhoneReaderPlacement("below");
  await plugin.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [{ verseStart: 16, verseEnd: 16 }] });
  await flush();
  assert.strictEqual(readers().length, 0);
  assert(splitEl() !== null, "the reader is not open under the note");
  assert(splitEl().previousElementSibling.classList.contains("horizontal-main-container"));
  assert(splitEl().nextElementSibling.classList.contains("mobile-navbar"));
  assert(document.body.classList.contains("bible-reader-split-open"));
  assert.match(splitText(), /Ведь Бог так любит мир\./);
  assert.strictEqual(splitEl().querySelectorAll(".bible-preview-verse-highlighted").length, 1);
  assert(splitEl().querySelector(".bible-reader-split-handle") !== null);
  // What the panel shows is remembered for the next start, in its own translation.
  assert.deepStrictEqual(plugin.savedData.readerSplit, { open: true, book: 43, chapter: 3, translationId: ruId });

  // 📖 in the side panel preview: on a phone the panel is a drawer over the note; it hides so the chapter is seen
  // (the preview stays in it). A chapter opening in a tab leaves the drawer to Obsidian.
  const previewLeaf = app.workspace.getRightLeaf(false);
  await previewLeaf.setViewState({ type: BIBLE_PREVIEW_VIEW_TYPE });
  app.workspace.rightSplit = { collapsed: false, collapse() { this.collapsed = true; }, expand() { this.collapsed = false; } };
  plugin.preview.createPaneViewInput().onOpenChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  assert.strictEqual(app.workspace.rightSplit.collapsed, true);
  assert.strictEqual(app.workspace.getLeavesOfType(BIBLE_PREVIEW_VIEW_TYPE).length, 1);
  app.workspace.rightSplit.expand();
  plugin.preview.createPaneViewInput().onOpenChapter({ book: 43, chapter: 3, highlightedRanges: [] }, undefined, true);
  await flush();
  assert.strictEqual(app.workspace.rightSplit.collapsed, false);
  assert.strictEqual(readers().length, 1);
  // The placement is the setting, whatever else is open: a reader tab does not take the chapters from the panel.
  await plugin.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  assert.strictEqual(readers().length, 1);
  assert.strictEqual(readers()[0].getLocation().target.book, 43);
  readers()[0].leaf.detach();
  previewLeaf.detach();
  delete app.workspace.rightSplit;

  // Another chapter goes to the same panel, in the translation it was shown in.
  await plugin.reader.openChapter({ book: 19, chapter: 23, highlightedRanges: [] }, enId);
  await flush();
  assert.strictEqual(document.querySelectorAll(".bible-reader-split").length, 1);
  assert.strictEqual(splitEl().querySelector(".bible-reader-translation-select").value, enId);
  assert.deepStrictEqual(plugin.savedData.readerSplit, { open: true, book: 19, chapter: 23, translationId: enId });

  // Close: the note takes the whole height again; the command brings back the last chapter.
  splitButton(t("reader.split.closeAria")).click();
  await flush();
  assert.strictEqual(splitEl(), null);
  assert(!document.body.classList.contains("bible-reader-split-open"));
  assert.deepStrictEqual(plugin.savedData.readerSplit, { open: false, book: 19, chapter: 23, translationId: enId });
  assert.strictEqual(command("toggle-bible-reader-below").checkCallback(true), true);
  command("toggle-bible-reader-below").checkCallback(false);
  await flush();
  assert(splitEl() !== null);
  assert.strictEqual(splitEl().querySelector(".bible-reader-translation-select").value, enId);
  assert.match(splitEl().querySelector(".bible-reader-navigator-toggle").textContent, /Ps 23/);

  // A restart opens the panel again at its chapter.
  const savedData = plugin.savedData;
  stopPlugin(plugin);
  createPhoneLayout();
  const restarted = await startPlugin({ app, savedData });
  await flush();
  assert(splitEl() !== null, "the reader under the note did not come back after a restart");
  assert.match(splitEl().querySelector(".bible-reader-navigator-toggle").textContent, /Ps 23/);

  // Open in a tab: the panel closes, the tab shows its chapter.
  const plugin2 = restarted.plugin;
  splitButton(plugin2.context.t("reader.split.openInTabAria")).click();
  await flush();
  assert.strictEqual(splitEl(), null);
  assert.strictEqual(readers().length, 1);
  assert.deepStrictEqual(readers()[0].getLocation().target, { book: 19, chapter: 23, highlightedRanges: [] });
  assert.strictEqual(readers()[0].getLocation().translationId, enId);
  // The move is remembered like the setting: the next chapter opens in a tab too, even after the tab closes.
  assert.strictEqual(plugin2.context.settings.phoneReaderPlacement, "tab");
  assert.strictEqual(plugin2.savedData.phoneReaderPlacement, "tab");
  await plugin2.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  assert.strictEqual(splitEl(), null);
  assert.strictEqual(readers().length, 1);

  // From a tab: "Open under the note" moves the chapter, closes the tab and switches the setting;
  // chapters open under the note from now on.
  const menu = createMenu();
  readers()[0].onPaneMenu(menu, "more-options");
  const openBelowItem = menu.items.find((item) => item.title === plugin2.context.t("reader.split.openBelow"));
  assert(openBelowItem !== undefined);
  openBelowItem.onClickCallback();
  await flush();
  assert.strictEqual(readers().length, 0);
  assert(splitEl() !== null);
  assert.match(splitEl().querySelector(".bible-reader-navigator-toggle").textContent, /Ин 3/);
  assert.strictEqual(plugin2.savedData.phoneReaderPlacement, "below");
  await plugin2.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  assert.strictEqual(readers().length, 0);
  assert.match(splitText(), /Ведь Бог так любит мир\./);

  // Switching the setting to tabs closes the panel.
  await plugin2.settingsService.setPhoneReaderPlacement("below");
  await plugin2.settingsService.setPhoneReaderPlacement("tab");
  assert.strictEqual(splitEl(), null);

  // Unloading the plugin takes the panel out of the app's layout.
  await plugin2.settingsService.setPhoneReaderPlacement("below");
  await plugin2.reader.openReader();
  await flush();
  assert(splitEl() !== null);
  plugin2.unload();
  assert.strictEqual(splitEl(), null);
  assert(!document.body.classList.contains("bible-reader-split-open"));
  document.body.empty();
}

// Not on a desktop or a tablet: Obsidian splits tabs itself there.
async function runOnDesktop() {
  const { app, plugin } = await startPlugin({ savedData: { interfaceLanguage: "en", phoneReaderPlacement: "below", readerSplit: { open: true } } });
  await importBible(plugin, "ru", {}, {});
  assert.strictEqual(plugin.commands.find((item) => item.id === "toggle-bible-reader-below").checkCallback(true), false);
  await plugin.reader.openChapter({ book: 43, chapter: 3, highlightedRanges: [] });
  await flush();
  assert.strictEqual(document.querySelector(".bible-reader-split"), null);
  const [view] = app.workspace.getLeavesOfType(BIBLE_READER_VIEW_TYPE).map((leaf) => leaf.view);
  assert(view !== undefined);
  const menu = createMenu();
  view.onPaneMenu(menu, "more-options");
  assert(!menu.items.some((item) => item.title === plugin.context.t("reader.split.openBelow")));
  stopPlugin(plugin);
}
