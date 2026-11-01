const assert = require("assert");
const obsidian = require("obsidian");
const { Setting } = obsidian;
const {
  clickButton,
  flush,
  importBible,
  startPlugin,
  stopPlugin,
} = require("./helpers.js");
const { BIBLE_READER_VIEW_TYPE } = require("../../.test-build/src/ui/BibleReaderView.js");

// A new user without translations: a one-time notice on the first start, the first steps in the settings,
// buttons in the empty reader and in "no translation" notices, and an example to type after the first import.
module.exports = async function runGettingStartedTests() {
  const { app, plugin } = await startPlugin();
  const t = (key, params) => plugin.context.t(key, params);
  const notices = () => obsidian.__state.notices;
  const noticeButtons = (notice) => Array.from(notice.noticeEl.querySelectorAll("button")).map((button) => button.textContent);

  // The first start: one notice that stays until closed, with a button to the settings; the flag is saved.
  const firstRunNotice = notices().find((notice) => notice.message.includes(t("notice.gettingStarted")));
  assert(firstRunNotice !== undefined, "first-run notice");
  assert.strictEqual(firstRunNotice.duration, 0);
  assert.deepStrictEqual(noticeButtons(firstRunNotice), [t("notice.gettingStartedButton")]);
  clickButton(firstRunNotice.noticeEl, t("notice.gettingStartedButton"));
  assert.strictEqual(firstRunNotice.hidden, true);
  assert.strictEqual(plugin.savedData.gettingStartedNoticeShown, true);

  // The settings: where to download a Bible file, in the interface language.
  const importSetting = renderImportSetting(plugin);
  const links = Array.from(importSetting.querySelectorAll(".bible-getting-started a")).map((link) => link.getAttribute("href"));
  assert.strictEqual(links[0], "https://ebible.org/find/details.php?id=engwebp");
  assert(links.includes("https://www.jw.org/"));
  assert.strictEqual(importSetting.querySelectorAll(".bible-getting-started li").length, 3);

  // The empty reader: import and settings buttons.
  await plugin.reader.openReader();
  await flush();
  const readerEl = app.workspace.getLeavesOfType(BIBLE_READER_VIEW_TYPE)[0].view.containerEl;
  const emptyEl = readerEl.querySelector(".bible-reader-empty");
  assert(emptyEl !== null, "empty reader");
  assert.match(emptyEl.textContent, new RegExp(t("reader.empty")));
  assert.deepStrictEqual(Array.from(emptyEl.querySelectorAll("button")).map((button) => button.textContent),
    [t("settings.import.button"), t("notice.gettingStartedButton")]);

  // An action that needs a translation explains what is missing and offers the settings.
  notices().length = 0;
  await plugin.library.showBibleIndexStats();
  assert.strictEqual(notices().length, 1);
  assert.strictEqual(notices()[0].noticeEl.firstChild.textContent, t("notice.noImportedTranslations"));
  assert.deepStrictEqual(noticeButtons(notices()[0]), [t("notice.gettingStartedButton")]);

  // The first import ends with an example in the translation's own book names; the next one does not.
  notices().length = 0;
  await importBible(plugin, "en");
  const exampleText = t("notice.importExample", { reference: "Joh 3:16" });
  assert(notices().some((notice) => notice.message.includes(exampleText)), "example after the first import");
  assert.strictEqual(renderImportSetting(plugin).querySelector(".bible-getting-started"), null);
  assert.strictEqual(readerEl.querySelector(".bible-reader-empty"), null);
  notices().length = 0;
  await importBible(plugin, "ru");
  assert(!notices().some((notice) => notice.message.includes("3:16")), "no example after the second import");

  // Users who already have translations never get the first-run notice; the flag is set for them too.
  const savedData = { ...plugin.savedData };
  delete savedData.gettingStartedNoticeShown;
  stopPlugin(plugin);
  const restarted = await startPlugin({ app, savedData });
  assert(!notices().some((notice) => notice.message.includes(restarted.plugin.context.t("notice.gettingStarted"))));
  assert.strictEqual(restarted.plugin.savedData.gettingStartedNoticeShown, true);
  stopPlugin(restarted.plugin);

  // Russian interface: the Synodal translation is the first suggested download.
  const russian = await startPlugin({ savedData: { interfaceLanguage: "ru", gettingStartedNoticeShown: true } });
  assert.strictEqual(obsidian.__state.notices.length, 0, "the first-run notice is shown once");
  const russianLinks = Array.from(renderImportSetting(russian.plugin).querySelectorAll(".bible-getting-started a")).map((link) => link.getAttribute("href"));
  assert.strictEqual(russianLinks[0], "https://ebible.org/find/details.php?id=russyn");
  stopPlugin(russian.plugin);
};

function renderImportSetting(plugin) {
  const definitions = plugin.settingTabs[0].getSettingDefinitions();
  const importItem = definitions.find((definition) => definition.name === plugin.context.t("settings.import.name"));
  const setting = new Setting(document.body.createDiv());
  importItem.render(setting);
  return setting.settingEl;
}
