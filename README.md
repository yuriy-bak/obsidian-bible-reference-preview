# Bible Reference Preview

Bible Reference Preview finds Bible references in notes and shows verse previews from EPUB Bible translations that you import into the plugin.

Supported sources: Bible EPUB files from [jw.org](https://www.jw.org/) and [eBible.org](https://ebible.org/find/).

## Features

- Import Bible translations from EPUB files.
- Store multiple imported translations.
- Reorder translations and use the top translation as the active one.
- Compare up to four imported translations in the Bible preview.
- Select comparison translations directly from the preview header.
- Recognize Bible references in editor text and Reading view.
- Highlight recognized references in the editor and turn Reading view references into clickable preview links.
- Show a floating Bible preview.
- Show Bible text in an Obsidian side panel.
- Open previews automatically for the current paragraph or only by clicking a reference.
- Open the Bible reference under the cursor with a command or configured shortcut.
- Copy preview text to the clipboard.
- Find where Bible references are used across Markdown notes with contextual snippets and highlighted matched references.
- Collapse, expand, and drag the preview panel.
- Copy comparison output with per-translation references and footnotes.
- Dynamically detect one-chapter books from imported metadata (`chapterCount`).
- Interface localization: Russian and English.

## Manual installation

1. Build the plugin or download the release archive.
2. Create this folder in your vault:

   ```text
   .obsidian/plugins/bible-reference-preview/
   ```

3. Copy these files into the folder:

   ```text
   main.js
   manifest.json
   styles.css
   ```

4. Open Obsidian → Settings → Community plugins and enable **Bible Reference Preview**.

## Beta testing with BRAT

Beta versions are published as GitHub pre-releases (for example `0.2.0-beta.1`). The Obsidian community catalog does not offer them, so install them with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **BRAT** from Community plugins.
2. Run the command **BRAT: Add a beta plugin for testing** (or Settings → BRAT → **Add beta plugin**).
3. Enter `https://github.com/yuriy-bak/obsidian-bible-reference-preview` and pick a beta version (or the latest one).
4. Enable **Bible Reference Preview** in Community plugins.

BRAT checks for newer versions on startup or with **BRAT: Check for updates to all beta plugins**. To return to the stable version, remove the plugin from BRAT and reinstall it from Community plugins.

## Importing a translation

1. Open Settings → Bible Reference Preview.
2. Click **Import** next to **Import Bible**.
3. Choose a Bible file. Supported: Bible EPUB files from jw.org and eBible.org (on eBible.org, open a translation and download its ePub).
4. Check the detected translation name and language.
5. Click **Import**.

The plugin detects the verse numbering scheme of the translation from its contents (for example, the Synodal Psalm 22 is Psalm 23 in English Bibles). If the scheme cannot be detected reliably, the plugin asks you to choose it. The scheme of each translation can be changed later in the translation list in the settings.

From eBible.org, only the 66 books of the Protestant canon are imported; other books of the file are skipped with a warning. eBible.org files contain full book names only, so references are recognized by these names. For Russian translations that use the Synodal book names and English translations, the usual abbreviations (`Мф`, `1Цар`, `Matt`, `1 Sam`) are added too.

Reimporting the same translation replaces its previous data. A file in another format is rejected with "file format not recognized" and the list of supported sources.

## Comparing translations

Bible Reference Preview can show the same Bible reference in several imported translations at once.

1. Import at least two translations.
2. Open Settings → Bible Reference Preview.
3. Open a Bible preview and click the comparison toggle (`⇄`).
4. Use the **Translations 2/4** dropdown in the preview header to choose the translations you want to compare.

Notes:

- Up to four translations can be selected for comparison.
- Each translation uses its own book names and reference formatting.
- Footnotes are shown directly after the text of the corresponding translation.
- The comparison selector works in both the floating preview and the side panel.

## Reference Usage Index

Bible Reference Preview can build a local Reference Usage Index for Markdown files in your vault. Use it to find where a selected Bible reference is used across notes.

Result snippets show a short context around the matched reference:

- 30 characters before the matched reference;
- the matched reference itself, highlighted in the result;
- 140 characters after the matched reference;
- `…` when the snippet is truncated.

The index is stored locally in the plugin data directory. Large Markdown files may be skipped according to the configured size limits to keep indexing responsive.

Notes open in the editor are reindexed from their current text before every usage search, including unsaved edits, so the current note is always included even when auto-update is off. The ⟳ button in the usages panel header updates the index for changed files in the background and repeats the search.

## Hotkeys

The plugin includes the command **Open Bible reference under cursor**. Use the built-in shortcut option in plugin settings or assign any Obsidian hotkey in Settings → Hotkeys.

### Bible preview hotkeys

The Bible preview can be scrolled with Obsidian commands in the side panel and in the floating window.
The commands have no default hotkeys. Assign them in Settings → Hotkeys, for example:

- Alt+PageDown — scroll down
- Alt+PageUp — scroll up
- Alt+Home — scroll to top
- Alt+End — scroll to bottom

## Privacy and permissions

The Obsidian community catalog lists two capabilities for this plugin:

- **Vault enumeration.** The plugin reads the list of Markdown files in your vault (`vault.getMarkdownFiles`) only to build the local Reference Usage Index. The index stays in the plugin data directory.
- **Clipboard access.** The plugin only writes to the clipboard when you press the copy button in the preview. It never reads the clipboard.

The plugin makes no network requests and sends no data anywhere.

## Known limitations

- Command names are registered when the plugin loads. Restart the plugin to update command names after changing the interface language.
- Old or damaged indexes may require reimporting the translation.
- The plugin does not translate Bible text, book names, aliases, or imported metadata.

## Русский раздел

Плагин распознаёт библейские ссылки в заметках Obsidian и показывает текст из импортированного EPUB-перевода Библии во floating preview.

Кратко:

1. Установи `main.js`, `manifest.json` и `styles.css` в `.obsidian/plugins/bible-reference-preview/`.
2. Включи плагин в Community plugins.
3. Открой настройки Bible Reference Preview.
4. Импортируй Библию (поддерживаются EPUB Библии с jw.org и eBible.org). Схема нумерации стихов определяется автоматически; если не получилось уверенно, плагин спросит. Сменить её можно в списке переводов в настройках.
5. Используй ссылки вроде `Ин3:16` или `Авд2-4`.
6. Для сравнения переводов включи режим сравнения в предпросмотре и выбери переводы через выпадающий список `Переводы 2/4` в заголовке предпросмотра.
7. При необходимости назначь hotkey для команды открытия ссылки под курсором.
8. Используй Reference Usage Index, чтобы находить места использования библейских ссылок в Markdown-заметках; результаты показывают короткий контекст и подсвечивают найденную ссылку.

### Поиск использований ссылок

Reference Usage Index строит локальный индекс Markdown-файлов vault и позволяет находить, где используется выбранная библейская ссылка. В результатах показывается короткий фрагмент: 30 символов до ссылки, сама ссылка с подсветкой и 140 символов после ссылки. При обрезке добавляется `…`.

Открытые в редакторе заметки переиндексируются по их текущему тексту (включая несохранённые правки) перед каждым поиском, поэтому текущая заметка попадает в результаты даже при выключенном автообновлении. Кнопка ⟳ в шапке панели использований обновляет индекс изменённых файлов в фоне и повторяет поиск.

### Сравнение переводов

В режиме сравнения предпросмотр показывает выбранные переводы отдельными блоками. Можно выбрать до четырёх переводов. Заголовки отрывков и сноски используют названия книг конкретного перевода. Сноски выводятся сразу после текста соответствующего перевода.

Сравнение работает в плавающем окне и в боковой панели. На мобильных устройствах выпадающий список переводов адаптирован под ширину экрана.

### Горячие клавиши предпросмотра Библии

Предпросмотр Библии можно прокручивать командами Obsidian в боковой панели и в плавающем окне.
Горячих клавиш по умолчанию нет. Назначьте их в Settings → Hotkeys, например:

- Alt+PageDown — прокрутить вниз
- Alt+PageUp — прокрутить вверх
- Alt+Home — в начало
- Alt+End — в конец

### Конфиденциальность и разрешения

- Список Markdown-файлов vault плагин читает только для локального индекса использований ссылок. Индекс хранится в папке данных плагина.
- В буфер обмена плагин только записывает текст по кнопке копирования в предпросмотре и никогда его не читает.
- Плагин не делает сетевых запросов и никуда не отправляет данные.

## Development

Use the npm scripts from `package.json` for local development and verification:

```bash
npm run lint
npm run typecheck
npm run build
npm run build:dev
npm run build:analyze
npm test
```

Script overview:

- `npm run lint` checks the TypeScript and JavaScript sources with ESLint.
- `npm run typecheck` runs TypeScript type checking without emitting files.
- `npm run build` type-checks the project and builds the production Obsidian plugin bundle.
- `npm run build:dev` type-checks the project and builds a larger development bundle with an inline source map for debugging.
- `npm run build:analyze` builds the production bundle and writes `meta.json` for bundle-size analysis.
- `npm test` runs the production build, builds CommonJS test modules into `.test-build/`, and runs parser/importer tests and the integration tests: `tests/integration/` loads the real plugin from `main.ts` against a stub of the `obsidian` module (`tests/obsidian-stub/`: plugin API, an in-memory vault and workspace, a jsdom DOM) and checks import, translation switching, the editor, the reading mode and the usage index together.

Build and repository hygiene notes:

- `.test-build/` is test output and should not be committed.
- Generated `src/**/*.js` files should not be committed; source files live in `src/**/*.ts`.
- `main.js` is the Obsidian plugin build artifact used for manual installation and releases.
- `npm run build` creates the production `main.js` by default; use `npm run build:dev` only when you need an inline source map for debugging.

Releasing:

- Bump the version in `manifest.json`, `package.json`, `package-lock.json`, and `versions.json`, and add a `## <version> - <title>` section to `CHANGELOG.md`.
- When that change lands on `main`, the `Release` workflow creates the `<version>` tag and GitHub Release with the CHANGELOG section as notes, and attaches attested `main.js`, `manifest.json`, and `styles.css`.
- To publish a beta for BRAT, run the `Beta release` workflow manually (Actions → Beta release → Run workflow) with a pre-release version such as `0.2.0-beta.1` and the branch to build. It creates a pre-release with that tag and attested assets; the version is set only in the released `manifest.json`, nothing is committed, so `main` and the community catalog are unaffected.
- Releases published manually are picked up by the same workflow, which builds, attests, and uploads the assets. To redo the assets of an existing release, run the workflow manually with its tag.

Import and indexing notes:

- Translations are imported through the plugin settings (**Import Bible**) or the **Import Bible file** command. Each supported format is a Bible source in `src/infrastructure/sources/` (`BibleSource`): it recognizes its own files (`canHandle`), declares its file types and size limit, and reads books and verses for `BibleIndexBuilder`. `createBibleSources()` lists the sources; the first one that recognizes a file takes it, so a narrower format goes before a more general one. Adding a format means adding a source and one line to that list; the file picker and the "not recognized" error pick it up.
- Versification: verse numbering differs between translations (the Synodal Psalm 22 is Psalm 23 in English Bibles). `src/versification/schemes/*.vrs` are the Paratext schemes English, Original, Septuagint, Vulgate and Russian Protestant, copied unchanged from [sillsdev/machine.py](https://github.com/sillsdev/machine.py) (MIT, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). `npm run generate:versification` turns them into `src/versification/builtinVersificationData.ts` with the 66 canonical books only; a test fails if the generated file is out of date. The import stores the detected scheme (`versification`, best match of verse counts per chapter) and the book order (`bookOrder`) of each translation in `bibles-index.json`; translations imported before 0.3.0 get them detected once in the background after loading.
- The Reference Usage Index scans Markdown files in the vault to find Bible reference usages.
- Large Markdown files can be skipped by the Reference Usage Index according to its size limit to avoid slow indexing and UI freezes.
- Long Reference Usage Index builds and the safe in-memory part of EPUB import show progress and can be cancelled.

## License

MIT. See [LICENSE](LICENSE). Third-party data: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
