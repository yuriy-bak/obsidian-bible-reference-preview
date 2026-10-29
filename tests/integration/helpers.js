// Shared setup for the integration tests: a synthetic jw.org-like EPUB and the real plugin on the fake app.
const assert = require("assert");
const { File } = require("buffer");
const { EditorState } = require("@codemirror/state");
const { EditorView } = require("@codemirror/view");
const JSZip = require("jszip");
const obsidian = require("obsidian");
const { createTestApp } = require("../obsidian-stub/app.js");

const BiblePlugin = require("../../.test-build/main.js").default;

const MANIFEST = { id: "bible-reference-preview", name: "Bible Reference Preview", version: "0.0.0", dir: ".obsidian/plugins/bible-reference-preview" };

// Book names differ between the translations, so switching changes the parser.
// Psalms for the numbering tests, chapters 1–23: the Synodal Ps 9 (39 verses) is Ps 9 and Ps 10 in English,
// the Synodal Ps 22 is Ps 23.
const psalms = (prefix, verseCounts) => Array.from({ length: 23 }, (_unused, index) => index + 1)
  .flatMap((chapter) => Array.from({ length: verseCounts[chapter] ?? 1 }, (_unused, index) => [chapter, index + 1, `${prefix} ${chapter}:${index + 1}.`]));

const TRANSLATIONS = {
  ru: {
    title: "Тестовая Библия",
    bookName: (id) => ({ 1: "Бытие", 19: "Псалтирь", 43: "Иоанна" })[id] ?? `Книга ${id}`,
    bookAbbreviation: (id) => ({ 1: "Быт", 19: "Пс", 43: "Ин" })[id] ?? `Кн${id}`,
    psalms: psalms("Пс", { 9: 39, 22: 2 }),
    verses: { 1: [[1, 1, "В начале Бог сотворил небо и землю."]], 43: [[1, 1, "В начале было Слово."], [2, 1, "На третий день была свадьба."], [3, 16, "Ведь Бог так любит мир."], [3, 17, "Бог послал Сына в мир."]] },
  },
  en: {
    title: "Test Bible",
    bookName: (id) => ({ 1: "Genesis", 19: "Psalms", 43: "John" })[id] ?? `Book ${id}`,
    bookAbbreviation: (id) => ({ 1: "Ge", 19: "Ps", 43: "Joh" })[id] ?? `Bk${id}`,
    psalms: psalms("Ps", { 9: 20, 10: 18, 23: 2 }),
    verses: { 1: [[1, 1, "In the beginning God created the heavens and the earth."]], 43: [[1, 1, "In the beginning was the Word."], [2, 1, "On the third day a marriage feast took place."], [3, 16, "For God loved the world so much."], [3, 17, "For God sent his Son into the world."]] },
  },
};

// Chapters of a book are numbered without gaps, as in a real Bible: the chapter count comes from them.
/** A minimal EPUB in the jw.org layout: the 66-book table and one XHTML document per book with verses. `revised` marks every verse, like a corrected edition. */
async function createJwEpub(language, { revised = false, withPsalms = false } = {}) {
  const translation = withPsalms
    ? { ...TRANSLATIONS[language], verses: { ...TRANSLATIONS[language].verses, 19: TRANSLATIONS[language].psalms } }
    : TRANSLATIONS[language];
  const zip = new JSZip();
  const bookIds = Array.from({ length: 66 }, (_unused, index) => index + 1);
  const bookDocuments = bookIds.filter((id) => translation.verses[id] !== undefined);
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const manifest = ["table.xhtml", ...bookDocuments.map((id) => `${id}.xhtml`)]
    .map((href, index) => `<item id="doc${index}" href="${href}" media-type="application/xhtml+xml"/>`).join("");
  const spine = ["table.xhtml", ...bookDocuments].map((_href, index) => `<itemref idref="doc${index}"/>`).join("");
  zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${translation.title}</dc:title><dc:language>${language}</dc:language><dc:creator>WATCHTOWER</dc:creator></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
  const rows = bookIds.map((id) => `<tr><td><a href="${id}.xhtml">${translation.bookName(id)}</a></td><td></td><td>${translation.bookAbbreviation(id)}</td></tr>`).join("");
  zip.file("OEBPS/table.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><table>${rows}</table></body></html>`);
  for (const id of bookDocuments) {
    const paragraphs = translation.verses[id]
      .map(([chapter, verse, text]) => `<p><span id="chapter${chapter}_verse${verse}"/><strong><sup>${verse}</sup></strong>${revised ? `${text} (rev.)` : text}</p>`).join("");
    zip.file(`OEBPS/${id}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><body>${paragraphs}</body></html>`);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

/** Lets pending promise callbacks and zero-delay timers run. */
async function flush(rounds = 5) {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** The real plugin from main.ts, loaded the way Obsidian loads it at startup. */
async function startPlugin({ app = createTestApp(), savedData = { interfaceLanguage: "en" }, beforeLayoutReady } = {}) {
  obsidian.__state.notices.length = 0;
  obsidian.__state.openModals.length = 0;
  const plugin = new BiblePlugin(app, MANIFEST);
  plugin.savedData = savedData;
  await plugin.onload();
  await beforeLayoutReady?.(app, plugin);
  app.workspace.setLayoutReady();
  await flush();
  return { app, plugin };
}

/** Unloads the plugin like Obsidian does on disable, and clears the page for the next scenario. */
function stopPlugin(plugin) {
  plugin.unload();
  document.body.empty();
}

/**
 * Imports through the same path as the import command: file, import settings modal, progress modal.
 * The small test books do not identify a numbering scheme, so the import asks for one: `versification`
 * is the scheme to pick there (the suggested one when left out), null cancels the import.
 */
async function importBible(plugin, language, epubOptions, { versification } = {}) {
  const file = new File([await createJwEpub(language, epubOptions)], `bible_${language}.epub`, { type: "application/epub+zip" });
  const importing = plugin.library.importBibleFile(file);
  let finished = false;
  importing.then(() => { finished = true; }, () => { finished = true; });
  const importModal = await waitFor(() => findModal("BibleTranslationImportModal"));
  clickButton(importModal.contentEl, plugin.context.t("modal.import.import"));
  const choiceModal = await waitFor(() => finished || findModal("VersificationChoiceModal"));
  if (choiceModal !== true) {
    if (versification === null) {
      clickButton(choiceModal.contentEl, plugin.context.t("common.cancel"));
    } else {
      if (versification !== undefined) {
        const select = choiceModal.contentEl.querySelector("select");
        select.value = versification;
        select.dispatchEvent(new Event("change"));
      }
      clickButton(choiceModal.contentEl, plugin.context.t("modal.versification.continue"));
    }
  }
  await importing;
  await flush();
}

function findModal(name) {
  return obsidian.__state.openModals.find((modal) => modal.constructor.name === name);
}

function clickButton(containerEl, text) {
  const button = Array.from(containerEl.querySelectorAll("button")).find((candidate) => candidate.textContent === text);
  assert(button !== undefined, `button "${text}" not found`);
  button.click();
}

async function waitFor(check, rounds = 200) {
  for (let round = 0; round < rounds; round += 1) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("waitFor: condition not met");
}

/** A CodeMirror editor with the plugin's editor extension, as in a note opened in Live Preview. */
function createEditor(plugin, doc) {
  return new EditorView({ state: EditorState.create({ doc, extensions: plugin.editorExtensions }), parent: document.body });
}

/** Texts highlighted as Bible reference links in the editor. */
function editorLinkTexts(view) {
  return Array.from(view.contentDOM.querySelectorAll(".bible-reference-link")).map((el) => el.textContent);
}

/** Moves the cursor into the editor text, which opens the preview for the paragraph. */
async function moveCursor(view, position) {
  view.dispatch({ selection: { anchor: position } });
  await flush(10);
}

/** Text of the floating preview, or null when it is hidden. */
function floatingPreviewText() {
  const panel = document.querySelector(".bible-preview-floating-panel");
  return panel === null || panel.style.display === "none" ? null : panel.querySelector(".bible-preview-floating-content").textContent;
}

/** What the reading mode makes of a rendered paragraph: the texts that became reference links. */
function renderReadingMode(plugin, text) {
  const element = createDiv();
  element.createEl("p", { text });
  for (const processor of plugin.markdownPostProcessors) processor(element, {});
  return Array.from(element.querySelectorAll(".bible-reference-reading-link")).map((el) => el.textContent);
}

/** Deletes a translation from the settings list, confirming the dialog. */
async function deleteTranslation(plugin, language) {
  const deleting = plugin.translations.deleteImportedTranslation(translationIdByLanguage(plugin, language));
  const confirmModal = await waitFor(() => obsidian.__state.openModals.find((modal) => modal.constructor.name === "ConfirmModal"));
  clickButton(confirmModal.contentEl, plugin.context.t("confirm.deleteTranslation.confirm"));
  await deleting;
  await flush();
}

/** Waits for the delayed link update of the editor (it batches changes). */
async function waitForEditorLinks() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/** Puts a translation on top of the list in the settings, which makes it the active one. */
async function activateTranslation(plugin, language) {
  const translationId = translationIdByLanguage(plugin, language);
  const order = plugin.context.settings.translationOrder.filter((id) => id !== translationId);
  await plugin.translations.setTranslationOrder([translationId, ...order]);
  await flush();
}

function noticeMessages() {
  return obsidian.__state.notices.map((notice) => notice.message);
}

function translationIdByLanguage(plugin, language) {
  const entry = Object.entries(plugin.context.v2Data?.translations ?? {}).find(([, translation]) => translation.language === language);
  assert(entry !== undefined, `no imported translation in ${language}`);
  return entry[0];
}

module.exports = {
  activateTranslation,
  clickButton,
  createEditor,
  createJwEpub,
  deleteTranslation,
  editorLinkTexts,
  floatingPreviewText,
  flush,
  moveCursor,
  renderReadingMode,
  importBible,
  noticeMessages,
  startPlugin,
  stopPlugin,
  translationIdByLanguage,
  waitFor,
  waitForEditorLinks,
};
