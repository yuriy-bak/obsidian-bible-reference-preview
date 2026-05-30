# Bible Reference Preview

Bible Reference Preview finds Bible references in Obsidian notes and shows verse previews from EPUB Bible translations that you import into the plugin.

## Features

- Import Bible translations from EPUB files.
- Store multiple imported translations.
- Reorder translations and use the top translation as the active one.
- Recognize Bible references in editor text and Reading view.
- Highlight recognized references in the editor and turn Reading view references into clickable preview links.
- Show a floating Bible preview.
- Open previews automatically for the current paragraph or only by clicking a reference.
- Open the Bible reference under the cursor with a command or configured shortcut.
- Copy preview text to the clipboard.
- Collapse, expand, and drag the preview panel.
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
   ```

4. Open Obsidian → Settings → Community plugins and enable **Bible Reference Preview**.

## Importing a translation

1. Open Settings → Bible Reference Preview.
2. Click **Import EPUB**.
3. Choose an EPUB file.
4. Check the detected translation name and language.
5. Click **Import**.

Reimporting the same translation replaces its previous data.

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

1. Установи `main.js` и `manifest.json` в `.obsidian/plugins/bible-reference-preview/`.
2. Включи плагин в Community plugins.
3. Открой настройки Bible Reference Preview.
4. Импортируй EPUB.
5. Используй ссылки вроде `Ин3:16` или `Авд2-4`.
6. При необходимости назначь hotkey для команды открытия ссылки под курсором.

### Горячие клавиши предпросмотра Библии

Предпросмотр Библии можно прокручивать командами Obsidian в боковой панели и в плавающем окне.
Горячие клавиши по умолчанию:

- Alt+PageDown — прокрутить вниз
- Alt+PageUp — прокрутить вверх
- Alt+Home — в начало
- Alt+End — в конец

Сочетания можно изменить в Settings → Hotkeys.

## License

MIT. See [LICENSE](LICENSE).
