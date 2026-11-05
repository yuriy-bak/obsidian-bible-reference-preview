const assert = require("assert");
const { File } = require("buffer");
const obsidian = require("obsidian");
const { clickButton, createJwEpub, findModal, flush, importBible, noticeMessages, startPlugin, stopPlugin, translationIdByLanguage, waitFor } = require("./helpers.js");

// The import and the usage index build run in the background: a notice shows the progress and cancels,
// the plugin keeps working meanwhile, and a second start of the same task is refused.
module.exports = async function runBackgroundTaskTests() {
  const { app, plugin } = await startPlugin({
    savedData: { interfaceLanguage: "en", referenceUsageIndexingEnabled: true, referenceUsageAutoUpdate: true },
  });
  const t = (key, params) => plugin.context.t(key, params);
  await importBible(plugin, "ru");
  const ruId = translationIdByLanguage(plugin, "ru");

  // A reimport waits in the numbering choice: the import is running, the notice shows it.
  const startImport = async (language) => {
    const file = new File([await createJwEpub(language)], `bible_${language}.epub`, { type: "application/epub+zip" });
    const importing = plugin.library.importBibleFile(file);
    clickButton((await waitFor(() => findModal("BibleTranslationImportModal"))).contentEl, t("modal.import.import"));
    const choiceModal = await waitFor(() => findModal("VersificationChoiceModal"));
    return { importing, choiceModal };
  };
  obsidian.__state.notices.length = 0;
  const reimport = await startImport("ru");
  const progressNotice = obsidian.__state.notices.find((notice) => notice.message.startsWith(t("notice.importStarted", { fileName: "bible_ru.epub" })));
  assert(progressNotice !== undefined && !progressNotice.hidden, "import progress notice");
  assert(plugin.library.getImportProgress() !== null);
  // The plugin keeps working with the translation imported before.
  assert.strictEqual(plugin.context.parseMatches("Ин 3:16").length, 1);

  // A second import and a deletion of the translation being imported are refused.
  await plugin.library.importBibleFile(new File([await createJwEpub("en")], "bible_en.epub"));
  assert(noticeMessages().includes(t("notice.importAlreadyRunning")));
  await plugin.translations.deleteImportedTranslation(ruId);
  assert(noticeMessages().includes(t("notice.translationBeingImported")));
  assert(plugin.context.indexData.translations[ruId] !== undefined);

  // The notice's cancel button stops the import before it writes anything.
  clickButton(progressNotice.noticeEl, t("common.cancel"));
  clickButton(reimport.choiceModal.contentEl, t("modal.versification.continue"));
  await reimport.importing;
  await flush();
  assert(noticeMessages().includes(t("notice.importCancelled")));
  assert.strictEqual(progressNotice.hidden, true);
  assert.strictEqual(plugin.library.getImportProgress(), null);
  assert.strictEqual(plugin.context.importingTranslationId, null);

  // Usage index build: progress notice with cancel; notes are searchable with the old index meanwhile.
  for (let index = 0; index < 80; index += 1) app.vault.setMarkdown(`notes/${index}.md`, `Note ${index}: Ин 3:16`);
  await plugin.referenceUsage.buildReferenceUsageIndex();
  assert.strictEqual(plugin.referenceUsage.getIndexService().getStats().referenceCount, 80);
  assert.strictEqual(plugin.referenceUsage.getReferenceUsageBuildProgress(), null);

  obsidian.__state.notices.length = 0;
  const rebuilding = plugin.referenceUsage.rebuildReferenceUsageIndex();
  const buildNotice = await waitFor(() => obsidian.__state.notices.find((notice) => notice.message.startsWith(t("notice.referenceUsageIndexBuildStarted"))));
  assert(plugin.referenceUsage.getReferenceUsageBuildProgress() !== null);
  await plugin.referenceUsage.buildReferenceUsageIndex();
  assert(noticeMessages().includes(t("notice.referenceUsageIndexAlreadyRunning")));
  clickButton(buildNotice.noticeEl, t("common.cancel"));
  await rebuilding;
  assert(noticeMessages().includes(t("notice.referenceUsageIndexBuildCancelled")));
  assert.strictEqual(buildNotice.hidden, true);
  assert.strictEqual(plugin.referenceUsage.getIndexService().getStats().referenceCount, 80, "the previous index stays");

  stopPlugin(plugin);
};
