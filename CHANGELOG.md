# Changelog

## Unreleased

- Fixed: the preview from the editor used the translations loaded at startup. After the first import, importing or re-importing a translation, switching the active translation or changing the comparison set, it showed nothing or stale text until Obsidian was restarted.
- One-chapter books accept the "1:N" form: "Jude 1:5" / «Иуд 1:5» is verse 5 (it used to be verse 1). A different chapter number («Иуд 2:3») is no longer treated as a reference.
- Verse and chapter ranges are capped at the end of the chapter and of the book. A typo like «Ин 3:1-2000000» no longer freezes Obsidian, and «Ин 3:16-180» no longer lists "[verse not found]" past the last verse.
- The usage index saves pending changes when the plugin unloads instead of dropping them.
- Fixed EPUB import failing with "Can't read the data of 'the loaded zip file'" when the file was picked from settings opened in a separate window.
- Floating preview: the translations selector in the header is only as wide as its label, so the rest of the header drags the window again.
- Reading mode: a click inside the note outside a reference hides the floating preview, like moving the cursor in the editor. Side panes and an open chapter keep it visible.
- Faster reference parsing: the text is normalized in one pass and book names are looked up by their first letter. 50k characters parse in about 10 ms instead of about 200 ms (editor highlighting, previews, usage indexing). The parser now has a benchmark test.
- Editor link highlighting no longer builds a cache key from the whole visible text; it compares the document and visible ranges instead. Refreshing the links (new translation, settings) always rebuilds them.
- The usage index file is saved without indentation, and reference ids no longer repeat the file path, so the file is noticeably smaller. Existing indexes keep working without a rebuild.
- Internal: the plugin state lives in one `PluginContext`; settings, translations and the Bible index/import are single services instead of chains of `*Flow`/`*Input` wrappers. No behavior change.
- Internal: the floating window, the side panel preview and the chapter mode are one `BiblePreviewService` instead of six `BiblePreview*Flow`/`*InputFactory` files. No behavior change.
- Internal: reference usages (settings, indexing, search, results panel and modal) are one `ReferenceUsageService` instead of nine `ReferenceUsage*Flow`/`*InputFactory` files. No behavior change.
- Internal: the editor is one `EditorService` plus one CodeMirror view plugin class instead of 23 `Editor*` files; startup and registration live in `main.ts` (147 lines, was 818 before the refactoring). No behavior change.
- Internal: one module for vault paths and one empty Bible index instead of copies; book aliases and note text share one set of normalization rules; `noUnusedLocals`/`noUnusedParameters` are on; the unit tests are split into files by module. No behavior change.
- Internal: the floating window and the side panel share one preview header (title, translations selector, copy and comparison buttons); the floating window's static styles moved from inline styles to `styles.css`; `formatBibleTexts.ts` is split into the preview model and the DOM renderer. No visual or behavior change.
- The usage index remembers which book names it was built with. After switching to a translation with other book names, the next build or update scans all notes again instead of only changed ones; settings and index stats say when the index is outdated. Indexes from earlier versions are scanned in full once.
- A new install uses the Obsidian interface language: Russian when Obsidian is in Russian, English otherwise. Existing settings are kept.
- The floating preview opens in popout windows: it moves to the window with the reference or the active note. Escape, the link-open shortcut and click-outside hiding in reading mode work there too.
- The fallback plugin folder uses the vault configuration folder (`app.vault.configDir`) instead of a hard-coded `.obsidian`.
- After the book names change (first import, switching to a translation in another language, removing the last one), open notes in reading mode redraw their reference links without reopening the note.
- An outdated usage index no longer waits for a manual rebuild: with auto-update on it is rebuilt in the background (one build at a time, a change during a build queues one more); with auto-update off a notice offers the rebuild. The same check runs once on startup, for a plugin update that changes the parser. Reordering translations without changing the active one no longer refreshes anything.
- Import picks the Bible source by looking inside the file: the jw.org source takes only EPUB files with the jw.org book navigation page or Watchtower as creator/publisher. Any other file gets "file format not recognized" with the list of supported sources instead of failing halfway. The format and its limits are checked by the source; the common check only rejects empty and oversized files. The file picker types come from the sources. Import texts no longer say "EPUB" where they mean any Bible file ("Import Bible file" command, "Import Bible" setting); the command id is unchanged.

## 0.2.5 - Catalog review: link underline

- Reference links (reading mode and editor) draw the dotted underline with `border-bottom` instead of `text-decoration-*` properties, which the catalog review flags as partially supported.

## 0.2.4 - Catalog review fixes

- Reading-mode and editor reference links use `text-decoration-line` instead of the `text-decoration` shorthand (catalog review warning about partial browser support). The look is unchanged.
- README: new "Privacy and permissions" section explaining vault file listing and clipboard use.

## 0.2.3 - Chapter usages, highlight toggle, usages panel fixes

- The 🔎 "find usages" button is now shown in comparison mode too, next to the main translation's reference title (like the 📖 chapter icon).
- Chapter view: a 🖍 button in the navigation bar hides or shows the highlighting of the referenced verses without leaving the chapter. The choice is kept while moving between chapters and switching translations, and resets when a chapter is opened again.
- Chapter view: a 🔎 button in the navigation bar shows all usages of the chapter from the usage index, with the number of usages next to it. The results panel groups them by verse in chapter order ("Whole chapter" first, then "v. 5", "vv. 5–7", …); each group can be collapsed. Hidden when the usage index is disabled.
- Fixed: after restarting Obsidian, the first 🔎 click (from a reference or the chapter view) did not open the usages panel until you switched to its tab manually. The restored tab is now loaded and reused; the same fix applies to the preview side panel.
- Usage search always includes the notes open in the editor: before each search they are reindexed from their current text, including unsaved edits, even when auto-update of the usage index is off. The chapter usage counter updates accordingly.
- Usages panel: a ⟳ button in the header updates the usage index (changed files only) in the background, without a modal, and repeats the current search. Progress is shown under the title if the update takes longer than a second.

## 0.2.2 - Open whole chapter, EPUB import fix

- Open the whole chapter from a preview passage: click the 📖 icon in a passage title to show the full chapter in the same preview (side panel or floating window). The referenced verses are highlighted and scrolled into view.
- Chapter navigation bar: `↩ Back` returns to the original reference and its scroll position; `←` / `→` go to the previous / next chapter, across book boundaries (disabled at Genesis 1 / Revelation 22).
- In comparison mode the chapter is shown in all compared translations. While a chapter is open, automatic preview updates from cursor movement are paused; clicking another reference leaves chapter mode.
- Fixed: the "Import EPUB" button in settings did not open the file picker on Obsidian 1.13.
- Removed the duplicate `+` import button from the translation order list; import stays as its own settings row (found by settings search).

## 0.2.0 - Declarative settings (requires Obsidian 1.13)

- **Requires Obsidian 1.13.0 or later** (`minAppVersion` 1.13.0). Users on older Obsidian versions stay on 0.1.9.
- The settings tab uses the declarative settings API (`getSettingDefinitions()`), so plugin settings now appear in Obsidian settings search.
- Translation order uses the built-in Obsidian list: drag handle to reorder, delete button (with confirmation), and a `+` button to import an EPUB.
- Settings are grouped under headings: preview, colors, and Bible index.
- The Bible reference opening shortcut is split into a toggle and a shortcut dropdown; the dropdown is disabled while the toggle is off.
- Reference usage index actions stay in one row; search also finds them by button names (Build, Rebuild, Stats, Clear) in both languages.
- Editing excluded folders no longer re-renders the settings tab on each keystroke.
- Updated `obsidian` typings to 1.14.4; the delete confirmation button uses `setDestructive()` instead of the deprecated `setWarning()`.

## 0.1.9 - Obsidian plugin review recommendations

- Replaced deprecated `workspace.activeLeaf` with `getActiveViewOfType(MarkdownView)`.
- Use the current `setActiveLeaf(leaf, { focus })` / `revealLeaf` APIs directly (available since `minAppVersion` 1.7.2).
- Copy uses `navigator.clipboard` only; removed the deprecated `document.execCommand("copy")` fallback.
- Removed unused imports and helpers.

## 0.1.8 - Obsidian plugin review warnings

- Removed default hotkeys from the preview scroll commands (Alt+PageUp/PageDown/Home/End) to avoid conflicts. Assign them in Settings → Hotkeys if needed.
- Translation deletion now asks for confirmation in an Obsidian modal instead of the browser `confirm()` dialog.
- DOM elements are created with Obsidian helpers (`createEl`, `createDiv`, `createFragment`) and checked with cross-window safe `instanceOf`.
- Settings button handlers no longer pass promises where a void callback is expected.
- Removed dead EPUB code that tried to read numeric `data-book-id` attributes (its pattern never matched).
- Input types use function properties instead of method signatures (no runtime change).
- Listed `@codemirror/state` and `@codemirror/view` in devDependencies; all review rules are errors again in lint.

## 0.1.7 - Obsidian plugin review fixes

- Moved static inline styles to `styles.css` classes; dynamic values (link color, floating window state) use `setCssProps` / `setCssStyles`.
- Settings headings now use `Setting.setHeading()`; removed the redundant plugin-name heading at the top of the settings tab.
- Raised `minAppVersion` to 1.7.2 (required by `Workspace.revealLeaf`).
- Added `eslint-plugin-obsidianmd` to `npm run lint`, so CI catches Obsidian review errors.

## 0.1.6 - Book name parsing fix

- Fixed references like "Иов 14:1" still being parsed as "Иов 4:1" in 0.1.5: the trailing chapter number is now also stripped from the book name and abbreviation, not only from aliases (some EPUBs store the book name as "Иов 1"). Existing imported translations are fixed without re-import.

## 0.1.5 - Reference parsing and comparison fixes

- Fixed references like "Иов 14:1" being parsed as "Иов 1" + "4:1": trailing chapter numbers from EPUB navigation links are no longer kept as book aliases. Existing imported translations are fixed without re-import. (Incomplete: book names ending with a chapter number were still affected, fixed in 0.1.6.)
- Fixed comparison preview for references spanning several chapters (e.g. "Суд 7:22;8:23", "Суд 7:24-8:1"): verses are split by chapter on first open, not only after toggling the mode.

## 0.1.4 - Comparison settings cleanup

- Removed comparison checkboxes from the translation settings list.
- Kept comparison translation selection in the preview header selector.
- Updated README comparison instructions to describe selecting translations from the preview header.

## 0.1.3 - Reference usage snippets

- Added contextual Reference Usage result snippets around matched Bible references.
- Limited snippets to 30 characters before and 140 characters after the matched reference.
- Added ellipses when Reference Usage snippets are truncated.
- Highlighted matched references inside Reference Usage results in both the side pane and modal results view.
- Documented Reference Usage Index snippets in README.

## 0.1.2 - Release validation follow-up

- Removed dynamic code execution and dynamic script element findings from the production bundle by replacing legacy JSZip/browser polyfill fallbacks with safe esbuild shims.
- Added GitHub artifact attestations for release assets.
- Hardened future release asset publishing so the GitHub Actions workflow builds, attests, and uploads the same assets.

## 0.1.1 - Mobile performance and release bundle update

- Changed the default `npm run build` script to create a production plugin bundle.
- Added `npm run build:dev` for the larger inline-sourcemap development bundle.
- Added `npm run build:analyze` for production bundle analysis with `meta.json`.
- Removed the unused `@melloware/coloris` dependency.
- Reduced the production `main.js` bundle size by enabling production minification and UTF-8 output.
- Added mobile-specific Reference Usage Index limits and more frequent mobile yielding.
- Added progress and cancel UI for Reference Usage Index build/rebuild.
- Added progress and cancel UI for the safe in-memory part of EPUB import.
- On mobile, tapping the same already-previewed Bible reference again now lets the editor place the cursor so the reference can be edited.
- Disabled automatic editor-focus restoration on mobile when opening the Bible side panel to avoid visible panel flicker.
- Hardened custom CSS color validation for link and floating preview background settings.
- Moved CSS color validation into a standalone testable module.
- Removed TSV import support from the plugin import flow; EPUB is now the only supported import format.

## 0.1.0 - Initial release

- Added Russian and English interface localization.
- Added interface language setting.
- Added EPUB import.
- Added Bible Index v2 with multiple translations.
- Added translation ordering and deletion.
- Added Bible reference parsing based on imported book metadata and aliases.
- Added dynamic one-chapter book detection via `chapterCount`.
- Added editor highlighting for recognized Bible references.
- Added floating Bible preview with copy, collapse/expand, drag, and mobile layout.
- Added current-paragraph and clicked-reference preview modes.
- Added command and configurable shortcut interception for opening the Bible reference under cursor.
