const assert = require("assert");
const obsidian = require("obsidian");
const { activateTranslation, clickButton, flush, importBible, noticeMessages, startPlugin, stopPlugin, waitFor } = require("./helpers.js");

// A translation with other book names changes the parser: open reading views are redrawn once, and the
// usage index built with the old parser is rebuilt in the background, or a notice offers the rebuild.
module.exports = async function runReferenceUsageTests() {
  const { app, plugin } = await startPlugin({
    savedData: { interfaceLanguage: "en", referenceUsageIndexingEnabled: true, referenceUsageAutoUpdate: true },
    beforeLayoutReady: (testApp) => {
      testApp.vault.setMarkdown("ru.md", "Читай Ин 3:16 сегодня");
      testApp.vault.setMarkdown("en.md", "Read John 3:16 and Joh 3:17");
      testApp.workspace.openMarkdownView("ru.md", "preview");
      testApp.workspace.openMarkdownView("en.md", "source");
    },
  });
  const [readingView, sourceView] = app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view);
  const indexService = plugin.referenceUsage.getIndexService();
  const t = (key) => plugin.context.t(key);

  await importBible(plugin, "ru");
  await plugin.referenceUsage.buildReferenceUsageIndex();
  assert.strictEqual(indexService.getStats().referenceCount, 1);
  assert.strictEqual(plugin.referenceUsage.isReferenceUsageIndexOutdated(), false);
  assert.deepStrictEqual(readingView.previewMode.rerenderCalls, [true]);

  // Auto-update on: the import of the English translation rebuilds the index with the English book names.
  obsidian.__state.notices.length = 0;
  await importBible(plugin, "en");
  await waitFor(() => indexService.getStats().referenceCount === 2);
  assert.strictEqual(plugin.referenceUsage.isReferenceUsageIndexOutdated(), false);
  assert(noticeMessages().includes(t("notice.referenceUsageIndexAutoRebuildStarted")));
  assert.deepStrictEqual(readingView.previewMode.rerenderCalls, [true, true]);
  assert.deepStrictEqual(sourceView.previewMode.rerenderCalls, [], "the editor view is not redrawn");

  // A switch while a build is running is rebuilt after it, with the parser of the new translation.
  const runningBuild = plugin.referenceUsage.rebuildReferenceUsageIndex();
  await activateTranslation(plugin, "ru");
  await runningBuild;
  await waitFor(() => indexService.getStats().referenceCount === 1 && !plugin.referenceUsage.isReferenceUsageIndexOutdated());

  // Auto-update off: the index stays outdated until the rebuild button of the notice.
  await plugin.referenceUsage.setReferenceUsageAutoUpdate(false);
  obsidian.__state.notices.length = 0;
  await activateTranslation(plugin, "en");
  await flush(10);
  assert.strictEqual(plugin.referenceUsage.isReferenceUsageIndexOutdated(), true);
  const prompt = obsidian.__state.notices.find((notice) => notice.message.includes(t("notice.referenceUsageIndexOutdatedPrompt")));
  assert(prompt !== undefined, "outdated notice");
  clickButton(prompt.noticeEl, t("notice.referenceUsageIndexOutdatedRebuildButton"));
  await waitFor(() => !plugin.referenceUsage.isReferenceUsageIndexOutdated());
  assert.strictEqual(indexService.getStats().referenceCount, 2);
  assert.strictEqual(prompt.hidden, true);

  // The heading above a reference comes from Obsidian's metadata cache.
  app.vault.setMarkdown("headed.md", "## Gospel\nRead this:\n\nJohn 3:16");
  const headedFile = app.vault.getAbstractFileByPath("headed.md");
  app.metadataCache.fileCaches.set("headed.md", {
    headings: [{ heading: "Gospel", level: 2, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 9, offset: 9 } } }],
  });
  await indexService.updateFile(headedFile);
  const headedUsage = indexService
    .findUsages([{ book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 }])
    .find((result) => result.filePath === "headed.md");
  assert(headedUsage !== undefined, "usage in headed.md");
  assert.strictEqual(headedUsage.heading, "Gospel");
  assert.strictEqual(headedUsage.excerpt, "Read this: John 3:16");

  stopPlugin(plugin);
};
