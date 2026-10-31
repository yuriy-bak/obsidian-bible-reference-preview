# Bible Reference Preview

Finds Bible references in your Obsidian notes and shows the verses right next to them: in a floating window or in a side panel. The text comes from Bible translations you import once from free EPUB and HTML files.

## Why this plugin

- **Works offline.** Translations are stored in your vault; the plugin makes no network requests.
- **Your translations.** Import Bibles from jw.org, eBible.org (hundreds of translations in many languages) and the Digital Bible Society (dbs.org).
- **Compare up to four translations** side by side. Verse numbering is converted between translations: the Synodal Psalm 22 is shown as Psalm 23 in an English Bible.
- **Read the whole chapter** from any reference, with the cited verses highlighted, and move between chapters and books.
- **Find where a passage is quoted** across all your notes, with a short context for each usage.
- **Desktop and mobile**, Russian and English interface.

## Features

- **References** are recognized in the editor and in reading view, and are shown as links: `Ин3:16`, `John 3:16`, `Мк 4:12, 14-16`, `Иуд 1:3;1:5`, `Суд 7:24-8:1`, a whole chapter (`Пс 22`), one-chapter books (`Иуд 5` = `Иуд 1:5`). Book names and abbreviations come from the imported translation.
- **Preview** opens for the reference in the current paragraph, or only when you click a reference. The floating window can be dragged, resized and collapsed; the side panel can sit on the left or right. Both work in popout windows.
- **Bible text** keeps paragraphs, poetry lines, footnotes, psalm titles and verses that the translation joins together ("16–17").
- **Copy** the passage with its reference and footnotes, in comparison mode too.
- **Chapter view:** 📖 in a passage title opens the full chapter. Use `↩` to go back, `←` / `→` for the previous or next chapter, 🖍 to hide or show the highlighting, and 🔎 to see all usages of the chapter.
- **Comparison:** `⇄` in the preview header turns it on; choose the translations in the header list.
- **A translation code** after a reference shows the passage in that translation and its numbering: `Пс 22:1 (СП)`. Codes can be changed in the translation list.
- **Usage index:** 🔎 next to a passage lists the notes that cite it. Open notes are searched with their unsaved edits. The index updates itself in the background; excluded folders and large files are skipped.
- **Commands:** open the reference under the cursor (with an optional shortcut), find its usages, import a Bible, turn the plugin on or off, and scroll the preview. Assign hotkeys in Settings → Hotkeys.
- **Settings** are found by Obsidian settings search. They include preview mode and placement, link and window colors, translation order, numbering scheme and code, and the usage index.

## Installation

Install **Bible Reference Preview** from Settings → Community plugins (Obsidian 1.13 or later).

Beta versions are GitHub pre-releases. Install them with [BRAT](https://github.com/TfTHacker/obsidian42-brat): **BRAT: Add a beta plugin for testing** → `https://github.com/yuriy-bak/obsidian-bible-reference-preview`. To install by hand, copy `main.js`, `manifest.json` and `styles.css` from a release into `.obsidian/plugins/bible-reference-preview/`.

## Importing a translation

Open Settings → Bible Reference Preview → **Import Bible** and choose a file. The plugin recognizes the format by itself. Check the translation name and language, then click **Import**. Importing the same translation again replaces it.

Where to get a file:

- **jw.org:** download the Bible (New World Translation) as EPUB from the publications page.
- **eBible.org:** on [ebible.org/find](https://ebible.org/find/), open a translation and download its **ePub**. Only the 66 books of the Protestant canon are imported.
- **dbs.org:** see below.

The verse numbering scheme is detected from the text. If detection is not certain, the plugin asks you to choose a scheme, and you can change it later in the translation list.

### dbs.org (Digital Bible Society)

[dbs.org/bibles](https://dbs.org/bibles) has translations that eBible.org does not, for example the Russian «Современный перевод» (RUSERV). Open the translation's page and pick the first download that is offered:

1. **HTML** (`html_<ID>.zip`): the best choice. It keeps paragraphs and poetry. Import the archive as it is, without unpacking it. The archive has no translation name, so type it in the import dialog.
2. **EPUB:** has the translation name, but often no paragraphs, so each verse is shown on its own line.
3. **HTML Study Bible only**, when there is no file to download (as for RUSERV). Save the reader page yourself on a computer:
   1. On the translation's page, click **HTML Study Bible**. The Bible opens in the browser (address `bibles.dbs.org/<ID>/app-json-study/index.html`). Wait until the text appears.
   2. Press **Ctrl+S** (**Cmd+S** on macOS).
   3. Choose the type **Webpage, HTML only** (Chrome, Edge) or **Web Page, HTML only** (Firefox), and save.
   4. Import the saved `.html` file. Type the translation name in the import dialog. The page stores only its short code, for example `RUSERV`.

   A phone browser cannot save the page this way. Make the file on a computer, then copy it to the phone or import it in Obsidian on the computer: the imported translation syncs with the vault.

Verses that the translation joins together are shown under one number ("16–17"). Some dbs.org files have lost lists, such as genealogies (1 Chronicles 1–2, Matthew 1:2–17, Romans 16:3–16); those verses are shown as missing. The plugin only reads the file for you and shares nothing; check the license of the translation before sharing the file.

## Privacy

The plugin makes no network requests. It reads the list of Markdown files only to build the local usage index, and it writes to the clipboard only when you press copy.

## Русский раздел

Плагин находит библейские ссылки в заметках Obsidian и показывает текст стихов в плавающем окне или в боковой панели. Переводы импортируются один раз из бесплатных файлов EPUB и HTML.

**Почему он:**
- Работает без интернета, переводы хранятся в хранилище.
- Переводы с jw.org, eBible.org (сотни переводов) и dbs.org.
- Сравнение до четырёх переводов с пересчётом нумерации: Синодальный Пс 22 в английском переводе показывается как Ps 23.
- Чтение главы целиком с подсветкой процитированных стихов.
- Поиск мест, где отрывок упоминается в заметках.
- Компьютер и телефон, интерфейс на русском и английском.

**Возможности:**
- Ссылки: `Ин3:16`, `Мк 4:12, 14-16`, `Иуд 1:3;1:5`, `Суд 7:24-8:1`, глава целиком (`Пс 22`), книги из одной главы (`Иуд 5`). Код перевода после ссылки показывает отрывок в этом переводе и его нумерации: `Пс 22:1 (СП)`.
- Текст с абзацами, поэтическими строками, сносками, надписаниями псалмов и слитыми стихами («16–17»). Копирование вместе со ссылкой и сносками.
- Режим главы: 📖 в заголовке отрывка. Дальше `↩` возвращает назад, `←` / `→` переключают главы, 🖍 включает и выключает подсветку, 🔎 показывает места использования главы.
- Сравнение включается кнопкой `⇄`, переводы выбираются в списке в заголовке.
- Места использования: 🔎 у отрывка. Индекс обновляется сам; открытые заметки учитываются с несохранёнными правками.
- Команды и горячие клавиши (Settings → Hotkeys), поиск по настройкам.

**Импорт:** Настройки → Bible Reference Preview → «Импорт Библии». Где взять файл:
- jw.org: EPUB Библии на странице публикаций.
- eBible.org: [ebible.org/find](https://ebible.org/find/) → перевод → ePub.
- dbs.org ([dbs.org/bibles](https://dbs.org/bibles)): лучше всего архив **HTML** (`html_<ID>.zip`), в нём есть абзацы, распаковывать его не нужно. Если архива нет, подойдёт **EPUB**. Если нет ни того, ни другого (так у «Современного перевода»):
  1. На компьютере открой **HTML Study Bible** и дождись, пока появится текст.
  2. Нажми **Ctrl+S** и выбери тип «Веб-страница, только HTML».
  3. Импортируй сохранённый `.html` и впиши название перевода.

  На телефоне так сохранить страницу нельзя: сделай файл на компьютере.

Схема нумерации определяется сама, её можно сменить в списке переводов. Сети плагин не использует.

## Development

```bash
npm run lint
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the build scripts, tests, releases and how the import works, and [CHANGELOG.md](CHANGELOG.md) for the history.

## License

MIT. See [LICENSE](LICENSE). Third-party data: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
