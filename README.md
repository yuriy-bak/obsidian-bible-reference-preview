# Bible Reference Preview

Bible Reference Preview finds Bible references in notes and shows verse previews from EPUB Bible translations that you import into the plugin.

## Features

- Import Bible translations from EPUB files.
- Store multiple imported translations.
- Reorder translations and use the top translation as the active one.
- Compare up to four imported translations in the Bible preview.
- Select comparison translations in plugin settings or directly from the preview header.
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

## Importing a translation

1. Open Settings → Bible Reference Preview.
2. Click **Import EPUB**.
3. Choose an EPUB file.
4. Check the detected translation name and language.
5. Click **Import**.

Reimporting the same translation replaces its previous data.

## Comparing translations

Bible Reference Preview can show the same Bible reference in several imported translations at once.

1. Import at least two translations.
2. Open Settings → Bible Reference Preview.
3. In the translation list, enable **Compare** for the translations you want to use.
4. Open a Bible preview and click the comparison toggle (`⇄`).
5. Use the **Translations 2/4** dropdown in the preview header to quickly adjust the selected translations.

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

## Hotkeys

The plugin includes the command **Open Bible reference under cursor**. Use the built-in shortcut option in plugin settings or assign any Obsidian hotkey in Settings → Hotkeys.

### Bible preview hotkeys

The Bible preview can be scrolled with Obsidian commands in the side panel and in the floating window.
Default hotkeys:

- Alt+PageDown — scroll down
- Alt+PageUp — scroll up
- Alt+Home — scroll to top
- Alt+End — scroll to bottom

You can change these shortcuts in Settings → Hotkeys.

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
4. Импортируй EPUB.
5. Используй ссылки вроде `Ин3:16` или `Авд2-4`.
6. Для сравнения переводов включи `Сравнивать` у нужных переводов в настройках или выбери переводы через выпадающий список `Переводы 2/4` в заголовке предпросмотра.
7. При необходимости назначь hotkey для команды открытия ссылки под курсором.
8. Используй Reference Usage Index, чтобы находить места использования библейских ссылок в Markdown-заметках; результаты показывают короткий контекст и подсвечивают найденную ссылку.

### Поиск использований ссылок

Reference Usage Index строит локальный индекс Markdown-файлов vault и позволяет находить, где используется выбранная библейская ссылка. В результатах показывается короткий фрагмент: 30 символов до ссылки, сама ссылка с подсветкой и 140 символов после ссылки. При обрезке добавляется `…`.

### Сравнение переводов

В режиме сравнения предпросмотр показывает выбранные переводы отдельными блоками. Можно выбрать до четырёх переводов. Заголовки отрывков и сноски используют названия книг конкретного перевода. Сноски выводятся сразу после текста соответствующего перевода.

Сравнение работает в плавающем окне и в боковой панели. На мобильных устройствах выпадающий список переводов адаптирован под ширину экрана.

### Горячие клавиши предпросмотра Библии

Предпросмотр Библии можно прокручивать командами Obsidian в боковой панели и в плавающем окне.
Горячие клавиши по умолчанию:

- Alt+PageDown — прокрутить вниз
- Alt+PageUp — прокрутить вверх
- Alt+Home — в начало
- Alt+End — в конец

Сочетания можно изменить в Settings → Hotkeys.

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
- `npm test` runs the production build, builds CommonJS test modules into `.test-build/`, and runs parser/importer tests.

Build and repository hygiene notes:

- `.test-build/` is test output and should not be committed.
- Generated `src/**/*.js` files should not be committed; source files live in `src/**/*.ts`.
- `main.js` is the Obsidian plugin build artifact used for manual installation and releases.
- `npm run build` creates the production `main.js` by default; use `npm run build:dev` only when you need an inline source map for debugging.

Import and indexing notes:

- The supported import flow is EPUB-only: translations are imported through the plugin settings with **Import EPUB**.
- The Reference Usage Index scans Markdown files in the vault to find Bible reference usages.
- Large Markdown files can be skipped by the Reference Usage Index according to its size limit to avoid slow indexing and UI freezes.
- Long Reference Usage Index builds and the safe in-memory part of EPUB import show progress and can be cancelled.

## License

MIT. See [LICENSE](LICENSE).
