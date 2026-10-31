const assert = require("assert");
const obsidian = require("obsidian");
const { activateTranslation, clickButton, floatingPreviewText, flush, importBible, noticeMessages, startPlugin, stopPlugin, waitFor } = require("./helpers.js");

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

  await testUsagesPanelBackButton(app, plugin);

  stopPlugin(plugin);
};

// The usages panel opened from the preview's 🔎 gets a back button that shows the preview again;
// a search started from the editor has nothing to return to.
async function testUsagesPanelBackButton(app, plugin) {
  const t = (key) => plugin.context.t(key);
  const usagesPane = () => app.workspace.getLeavesOfType("bible-reference-usage-results")[0]?.view ?? null;
  const backButton = () => usagesPane()?.contentEl.querySelector(".bible-reference-usage-pane-back-button") ?? null;

  const content = await plugin.contentBuilder.analyze("John 3:16");
  assert(content !== null, "preview content");
  plugin.preview.show(content);
  await flush(10);
  const shownText = floatingPreviewText();
  assert(shownText !== null && shownText.length > 0, "floating preview is shown");

  document.querySelector(".bible-preview-floating-content .bible-preview-reference-usages-button").click();
  await waitFor(() => backButton() !== null);
  assert.strictEqual(backButton().textContent, t("preview.chapterBack"));
  assert.strictEqual(backButton().getAttribute("aria-label"), t("referenceUsages.panel.backToReferenceAria"));

  plugin.preview.hideFloating();
  assert.strictEqual(floatingPreviewText(), null);
  backButton().click();
  await flush(10);
  assert.strictEqual(floatingPreviewText(), shownText, "the back button shows the verse again");

  await plugin.referenceUsage.showUsagesForPreviewBlock({ title: "John 3:16", references: content.blocks.find((block) => block.type === "reference").references });
  await flush(5);
  assert.strictEqual(backButton(), null, "no back button without a preview to return to");
}
