const assert = require("assert");
const obsidian = require("obsidian");
const { flush, importBible, noticeMessages, startPlugin, stopPlugin, translationIdByLanguage, waitFor } = require("./helpers.js");
const { createFakeEditor } = require("../fake-editor.js");
const { normalizePluginSettings, normalizeReferenceSuggestTrigger } = require("../../.test-build/src/settings/PluginSettings.js");

// Bible text into notes: the command, the "--" suggestions and "Insert into note" in the preview, with the format settings.
module.exports = async function runInsertionTests() {
  // Settings: defaults, an unknown format, the trigger rules (no letters, digits, spaces; short; empty is off).
  const defaults = normalizePluginSettings({});
  assert.deepStrictEqual(
    [defaults.insertFormat, defaults.insertVerseNumbers, defaults.insertFootnotes, defaults.referenceSuggestTrigger],
    ["callout-expanded", true, false, "--"],
  );
  assert.strictEqual(normalizePluginSettings({ insertFormat: "html" }).insertFormat, "callout-expanded");
  assert.strictEqual(normalizePluginSettings({ insertFormat: "quote" }).insertFormat, "quote");
  assert.strictEqual(normalizePluginSettings({ insertFormat: "callout-collapsed" }).insertFormat, "callout-collapsed");
  assert.strictEqual(normalizeReferenceSuggestTrigger(";;"), ";;");
  assert.strictEqual(normalizeReferenceSuggestTrigger(""), "");
  assert.strictEqual(normalizeReferenceSuggestTrigger("ab"), "--");
  assert.strictEqual(normalizeReferenceSuggestTrigger("------"), "--");

  const { app, plugin } = await startPlugin();
  const command = plugin.commands.find((candidate) => candidate.id === "insert-bible-text");
  assert.strictEqual(typeof command.editorCallback, "function");

  // No translation yet: the command says where to start.
  command.editorCallback(createFakeEditor("Ин 3:16"));
  await flush();
  assert(noticeMessages().some((message) => /import/i.test(message)));

  await importBible(plugin, "ru");
  await importBible(plugin, "en");

  // On a reference: its text after the paragraph, in the main translation, as a callout.
  let editor = createFakeEditor("Читай Ин 3:16-17 сегодня\n\nДальше", { line: 0, ch: 8 });
  command.editorCallback(editor);
  await flush();
  assert.strictEqual(editor.getValue(), "Читай Ин 3:16-17 сегодня\n\n> [!bible]+ Ин 3:16-17\n> ¹⁶ Ведь Бог так любит мир.\n>\n> ¹⁷ Бог послал Сына в мир.\n\nДальше");

  // A translation code: the coded translation, and the code stays in the title.
  assert.strictEqual(await plugin.translations.setTranslationCode(translationIdByLanguage(plugin, "en"), "Eng"), null);
  editor = createFakeEditor("Ин 3:16 (ENG)", { line: 0, ch: 2 });
  command.editorCallback(editor);
  await flush();
  assert.strictEqual(editor.getValue(), "Ин 3:16 (ENG)\n\n> [!bible]+ Joh 3:16 (Eng)\n> ¹⁶ For God loved the world so much.");

  // Not on a reference: the dialog asks for one; a book completes the name, the reference is inserted at the cursor.
  await plugin.settingsService.setInsertFormat("quote");
  await plugin.settingsService.setInsertVerseNumbers(false);
  editor = createFakeEditor("Абзац\n\nДальше", { line: 1, ch: 0 });
  command.editorCallback(editor);
  const modal = await waitFor(() => obsidian.__state.openModals.find((candidate) => candidate.constructor.name === "ReferenceInputModal"));
  const [book] = modal.getSuggestions("Ин");
  assert.strictEqual(book.kind, "book");
  modal.selectSuggestion(book, new KeyboardEvent("keydown"));
  assert.strictEqual(modal.inputEl.value, "Ин ");
  assert(modal.isOpen);
  const suggestions = modal.getSuggestions("Ин 3:16");
  assert.deepStrictEqual(suggestions, [{ kind: "reference", text: "Ин 3:16" }]);
  modal.selectSuggestion(suggestions[0], new KeyboardEvent("keydown"));
  await flush();
  assert(!modal.isOpen);
  assert.strictEqual(editor.getValue(), "Абзац\n\n> Ин 3:16\n> Ведь Бог так любит мир.\n\nДальше");

  // The "--" suggestions: books, then the reference or the reference with its text.
  await plugin.settingsService.setInsertFormat("callout-expanded");
  await plugin.settingsService.setInsertVerseNumbers(true);
  const [suggest] = plugin.editorSuggests;
  const trigger = (fakeEditor) => {
    const cursor = fakeEditor.getCursor();
    const info = suggest.onTrigger(cursor, fakeEditor, null);
    suggest.context = info === null ? null : { ...info, editor: fakeEditor, file: null };
    return info;
  };
  editor = createFakeEditor("--Ин", { line: 0, ch: 4 });
  assert.deepStrictEqual(trigger(editor), { start: { line: 0, ch: 0 }, end: { line: 0, ch: 4 }, query: "Ин" });
  const [bookSuggestion] = suggest.getSuggestions(suggest.context);
  suggest.selectSuggestion(bookSuggestion);
  assert.strictEqual(editor.getValue(), "--Ин ");
  editor.replaceRange("3:16", { line: 0, ch: 5 });
  editor.setCursor({ line: 0, ch: 9 });
  trigger(editor);
  const referenceSuggestions = suggest.getSuggestions(suggest.context);
  assert.deepStrictEqual(referenceSuggestions.map((item) => [item.kind, item.format]), [
    ["reference", undefined], ["reference-with-text", "callout-expanded"], ["reference-with-text", "callout-collapsed"], ["reference-with-text", "quote"], ["reference-with-text", "code-block"],
  ]);
  // On a line of its own the reference with its text becomes the callout.
  suggest.selectSuggestion(referenceSuggestions[1]);
  await flush();
  assert.strictEqual(editor.getValue(), "> [!bible]+ Ин 3:16\n> ¹⁶ Ведь Бог так любит мир.");
  // In a sentence: the reference stays in the text, its text goes after the paragraph.
  editor = createFakeEditor("Читай --Ин 3:16 сегодня", { line: 0, ch: 15 });
  trigger(editor);
  suggest.selectSuggestion({ kind: "reference-with-text", text: "Ин 3:16" });
  await flush();
  assert.strictEqual(editor.getValue(), "Читай Ин 3:16 сегодня\n\n> [!bible]+ Ин 3:16\n> ¹⁶ Ведь Бог так любит мир.");
  // The third variant: the text in a collapsed callout.
  editor = createFakeEditor("--Ин 3:16", { line: 0, ch: 9 });
  trigger(editor);
  suggest.selectSuggestion(referenceSuggestions[2]);
  await flush();
  assert.strictEqual(editor.getValue(), "> [!bible]- Ин 3:16\n> ¹⁶ Ведь Бог так любит мир.");
  // The fourth: a bible block.
  editor = createFakeEditor("--Ин 3:16", { line: 0, ch: 9 });
  trigger(editor);
  suggest.selectSuggestion(referenceSuggestions[4]);
  await flush();
  assert.strictEqual(editor.getValue(), "```bible\nИн 3:16\n```");
  // Only the reference.
  editor = createFakeEditor("--Ин 3:16", { line: 0, ch: 9 });
  trigger(editor);
  suggest.selectSuggestion({ kind: "reference", text: "Ин 3:16" });
  await flush();
  assert.strictEqual(editor.getValue(), "Ин 3:16");
  // Turned off: no suggestions.
  await plugin.settingsService.setReferenceSuggestTrigger("");
  assert.strictEqual(trigger(createFakeEditor("--Ин", { line: 0, ch: 4 })), null);
  await plugin.settingsService.setReferenceSuggestTrigger("abc");
  assert.strictEqual(plugin.context.settings.referenceSuggestTrigger, "");
  await plugin.settingsService.setReferenceSuggestTrigger("--");

  // "Insert into note" in the preview: the note last edited, even when the side panel has the focus.
  app.vault.setMarkdown("note.md", "");
  const noteView = app.workspace.openMarkdownView("note.md", "source");
  noteView.editor = createFakeEditor("Начало\n\n", { line: 2, ch: 0 });
  document.body.appendChild(noteView.containerEl);
  app.workspace.setActiveLeaf(noteView.leaf);
  const otherLeaf = app.workspace.getLeaf();
  otherLeaf.view = new obsidian.View(otherLeaf);
  app.workspace.setActiveLeaf(otherLeaf);
  const content = await plugin.contentBuilder.analyze("Ин 3:16");
  plugin.preview.show(content);
  await flush();
  const menu = new obsidian.Menu();
  require("../../.test-build/src/ui/BiblePreviewHeader.js").addInsertIntoNoteMenuItem(menu, plugin.preview.createFloatingWindowInput(), content);
  assert.strictEqual(menu.items.length, 1);
  menu.items[0].callback();
  assert.strictEqual(noteView.editor.getValue(), "Начало\n\n> [!bible]+ Ин 3:16\n> ¹⁶ Ведь Бог так любит мир.");
  assert(noticeMessages().some((message) => /note/.test(message)));

  // The copy button copies the plain text of the panel, whatever the insert format.
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { copied.push(text); } } });
  const { copyBibleContent } = require("../../.test-build/src/ui/CopyBibleText.js");
  assert(await copyBibleContent(content, plugin.preview.createFloatingWindowInput()));
  assert.deepStrictEqual(copied, [content.plainText]);
  assert(!copied[0].includes("[!bible]"));

  stopPlugin(plugin);
};
