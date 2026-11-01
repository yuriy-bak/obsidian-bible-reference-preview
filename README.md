# Bible Reference Preview

**English** | [Русский](README.ru.md)

Write `John 3:16` in a note and read the verse right next to it, in a floating window or in a side panel. Works offline on desktop and on phones (Android, iOS), with Bible translations you import once from free EPUB and HTML files, in any language they are published in.

![Typing a reference opens the Bible text; the comparison shows four translations](https://raw.githubusercontent.com/yuriy-bak/obsidian-bible-reference-preview/main/docs/images/hero.gif)

## Why this plugin

- **Works with the notes you already have.** Open any note and every Bible reference in it is highlighted as a link, with no special syntax, code blocks or tags to add. The references get a dotted underline and a color of your choice, so they stand apart from ordinary links.
- **Works offline.** Translations are stored locally on your device; the plugin makes no network requests.
- **Your translations.** Import Bibles from jw.org, eBible.org (hundreds of translations in many languages) and the Digital Bible Society (dbs.org).
- **Compare up to four translations** side by side. Verse numbering is converted between translations: the Synodal Psalm 22 is shown as Psalm 23 in an English Bible.
- **Bible reader:** open any book and chapter, even without a reference in a note, and read it in any imported translation without changing the default one. Cited verses are highlighted.
- **Find where a passage is quoted** across all your notes, with a short context for each usage.
- **Desktop and mobile:** Windows, macOS, Linux, Android and iOS. Russian and English interface.

## Screenshots

<table>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/yuriy-bak/obsidian-bible-reference-preview/main/docs/images/comparison.png" alt="Comparison of up to four translations in the side panel" width="100%"><br><sub>Comparison of up to four translations in the side panel</sub></td><td width="50%"><img src="https://raw.githubusercontent.com/yuriy-bak/obsidian-bible-reference-preview/main/docs/images/floating-window.png" alt="Floating window" width="100%"><br><sub>Floating window</sub></td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/yuriy-bak/obsidian-bible-reference-preview/main/docs/images/chapter-view.png" alt="Chapter view with the cited verse highlighted" width="100%"><br><sub>Chapter view with the cited verse highlighted</sub></td><td width="50%"><img src="https://raw.githubusercontent.com/yuriy-bak/obsidian-bible-reference-preview/main/docs/images/usages.png" alt="Where a passage is quoted in your notes" width="100%"><br><sub>Where a passage is quoted in your notes</sub></td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/yuriy-bak/obsidian-bible-reference-preview/main/docs/images/translation-code.png" alt="A translation code after a reference: (ПНМ) shows a Russian translation" width="100%"><br><sub>A translation code after a reference: (ПНМ) shows a Russian translation</sub></td><td></td></tr>
</table>

## Quick start

1. Install **Bible Reference Preview** from Settings → Community plugins and enable it.
2. Download a free Bible file, for example a translation's **ePub** from [ebible.org/find](https://ebible.org/find/) (the World English Bible is a good first choice).
3. Open Settings → Bible Reference Preview → **Import Bible**, choose the file and click **Import**.
4. Type a reference such as `John 3:16` or `Rom 8:28-30` in any note. The preview opens for the paragraph under the cursor.

More sources and details are in [Importing a translation](#importing-a-translation).

## Features

- **References** are recognized in any note, new or old, in the editor and in reading view, and are shown as links: `John 3:16`, `Mark 4:12, 14-16`, `Jude 1:3;1:5`, `Judg 7:24-8:1`, one-chapter books (`Jude 5` = `Jude 1:5`). Book names and abbreviations come from the imported translations, so references work in the language of any of them (`Ин3:16` with a Russian Bible, `John 3:16` with an English one, both in one note). When two translations abbreviate different books the same way, the main translation wins; numbering follows the main translation unless a translation code is given. Bible references have a dotted underline and are green by default, so they don't look like ordinary links; the color can be changed in the settings.
- **Preview** opens for the reference in the current paragraph, or only when you click a reference. The floating window can be dragged, resized and collapsed; the side panel can sit on the left or right. Both work in popout windows.
- **On a phone**, the side panel is the most convenient: set **Bible text display mode** to **Side panel**, and open or close the Bible text with a swipe from the screen edge.
- **Bible text** keeps paragraphs, poetry lines, footnotes, psalm titles and verses that the translation joins together ("16–17").
- **Copy** the passage with its reference and footnotes, in comparison mode too.
- **Bible reader:** the open-book icon in a passage title opens the full chapter in a reader tab, in the translation and numbering of that passage. Click the chapter title to pick a book and chapter (type `John`, `1 Cor 13` or `John 3:16` to filter), or use the command **Go to Bible book and chapter**. The translation selector shows the same chapter in another translation (Synodal Ps 22 → English Ps 23) without changing the default one. Back and forward go through the chapters you opened, the arrows open the previous or next chapter, the highlighter hides or shows the highlighting, and the magnifier lists all usages of the chapter. Ctrl/Cmd-click on the ribbon icon opens another reader tab; the last chapter reopens after a restart.
- **Comparison:** the books-on-a-shelf button in the preview header turns it on (it stays highlighted while comparison is on); choose the translations in the header list.
- **A translation code** after a reference shows the passage in that translation and its numbering: `Ps 23:1 (WEB)`, where `WEB` is the code of an imported translation. Codes can be changed in the translation list.
- **Usage index:** the magnifier next to a passage lists the notes that cite it, with the heading and the lines the reference sits under. Open notes are searched with their unsaved edits. The index updates itself in the background; excluded folders and large files are skipped.
- **Commands:** open the reference under the cursor (with an optional shortcut), open the Bible reader or go to a book and chapter, find usages, import a Bible, turn the plugin on or off, and scroll the preview. Assign hotkeys in Settings → Hotkeys.
- **Settings** are found by Obsidian settings search. They include preview mode and placement, link and window colors, translation order, name (the pencil after it), numbering scheme and code, and the usage index.

## Roadmap

Planned features, in no fixed order:

- [Custom book names and abbreviations](https://github.com/yuriy-bak/obsidian-bible-reference-preview/issues/55) for each translation.

See [all planned features](https://github.com/yuriy-bak/obsidian-bible-reference-preview/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap) and vote with 👍 on the ones you want.

## Installation

**From the catalog.** Install **Bible Reference Preview** from Settings → Community plugins (Obsidian 1.13 or later), on desktop or on a phone.

Translations are stored in the plugin folder (`.obsidian/plugins/bible-reference-preview/data`), not in your notes. To use a translation on another device, import the file there too, or use a sync tool that copies plugin folders.

**Beta versions** are GitHub pre-releases. Install them with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **BRAT** from Community plugins.
2. Run the command **BRAT: Add a beta plugin for testing**.
3. Enter `https://github.com/yuriy-bak/obsidian-bible-reference-preview` and pick the latest version.

**By hand:**

1. Download `main.js`, `manifest.json` and `styles.css` from a [release](https://github.com/yuriy-bak/obsidian-bible-reference-preview/releases).
2. Copy them into `.obsidian/plugins/bible-reference-preview/` in your vault.
3. Enable **Bible Reference Preview** in Settings → Community plugins.

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

   A phone browser cannot save the page this way. Make the file on a computer, copy it to the phone and import it there.

Verses that the translation joins together are shown under one number ("16–17"). Some dbs.org files have lost lists, such as genealogies (1 Chronicles 1–2, Matthew 1:2–17, Romans 16:3–16); those verses are shown as missing. The plugin only reads the file for you and shares nothing; check the license of the translation before sharing the file.

## Privacy

The plugin makes no network requests. It reads the list of Markdown files only to build the local usage index, and it writes to the clipboard only when you press copy.

## Feedback

Found a bug, a reference that is not recognized, or a Bible file that does not import? Have an idea? [Open an issue](https://github.com/yuriy-bak/obsidian-bible-reference-preview/issues/new/choose): a few words are enough, in English or Russian. If the idea is already on the [roadmap](#roadmap), a 👍 on it helps too. If the plugin is useful to you, a star on GitHub helps other people find it.

## Development

```bash
npm run lint
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the build scripts, tests, releases and how the import works, and [CHANGELOG.md](CHANGELOG.md) for the history.

## License

MIT. See [LICENSE](LICENSE). Third-party data: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
