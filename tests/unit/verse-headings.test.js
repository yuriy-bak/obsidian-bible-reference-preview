const {
  assert,
  createBookMapping,
  extractVersesFromHtml,
  formatBibleTextBlocks,
  DEFAULT_TRANSLATION_ID,
} = require("../helpers");
const { extractVersesFromBookDocument } = require("../../.test-build/src/infrastructure/sources/ebible-epub/ebibleEpubHtml.js");
const { extractBibleTextFromCompactBook } = require("../../.test-build/src/infrastructure/v2/extractBibleTextFromCompactBook.js");
const { toBibleChapterPreviewContent } = require("../../.test-build/src/application/BiblePreviewModel.js");
const { parseXhtmlDocument } = require("../../.test-build/src/infrastructure/epub/MarkupDocument.js");

// Psalm titles without a verse number are kept as the heading of the verse that follows.
module.exports = async () => {
  const xhtml = (body) => `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title></head><body>${body}</body></html>`;
  const ebibleVerse = (id, number) => `<span class="verse" id="${id}">${number}&#160;</span>`;

  // eBible: `<div class='d'>`, continued in a following paragraph; its footnotes go to the verse; the letters
  // of Psalm 119 head verses of the same chapter; a title at the end of a chapter does not move to the next one.
  const ebible = extractVersesFromBookDocument(parseXhtmlDocument(xhtml(`
    <div class='psalmlabel' id='PS10_0'>10</div>
    <div class='d'>Начальнику хора.<a href='#FN1' epub:type='noteref' class='noteref'>*</a> </div>
    <div class='m'>Псалом Давида.</div>
    <div class='q'>${ebibleVerse("PS10_1", 1)}На Господа уповаю.</div>
    <div class='d'>BETH</div>
    <div class='q'>${ebibleVerse("PS10_2", 2)}Ибо вот, нечестивые.</div>
    <div class='d'>Селах.</div>
    <div class='psalmlabel' id='PS11_0'>11</div>
    <div class='q'>${ebibleVerse("PS11_2", 2)}Господь во святом храме.</div>
    <aside epub:type='footnote' id="FN1"><p class="f"><span class="ft">Примечание.</span></p></aside>`)));
  assert.deepStrictEqual(ebible.map((item) => [item.chapter, item.verse, item.heading, item.text, item.footnotes]), [
    [10, 1, "Начальнику хора. Псалом Давида.", "На Господа уповаю.", ["Примечание."]],
    [10, 2, "BETH", "Ибо вот, нечестивые.", []],
    [11, 2, undefined, "Господь во святом храме.", []],
  ]);

  // jw.org: `<p class="sw">` before the chapter marker, out of the previous verse; its footnote goes to verse 1.
  const jw = extractVersesFromHtml(xhtml(`
    <p class="sl"><span id="chapter102_verse28"></span> <strong><sup>28</sup></strong>Последний стих.</p>
    <p class="p2448 sw"><span id="pos1"></span>Псалом Давида<a epub:type="noteref" href="#footnote1">*</a>.</p>
    <p class="sl"><span id="chapter103_verse1"></span><span class="w_ch"><strong>103</strong> </span>Восхваляй Иегову, моя душа!</p>
    <p class="sl"><span id="chapter103_verse2"></span> <strong><sup>2</sup></strong>Восхваляй Иегову.</p>
    <div class="groupFootnote"><div id="footnote1"><p>Или «Песнь».</p></div></div>`));
  assert.deepStrictEqual(jw.map((item) => [item.chapter, item.verse, item.heading, item.text, item.footnotes]), [
    [102, 28, undefined, "Последний стих.", []],
    [103, 1, "Псалом Давида.", "Восхваляй Иегову, моя душа!", ["Или «Песнь»."]],
    [103, 2, undefined, "Восхваляй Иегову.", []],
  ]);

  // Reading and the preview: the heading is a line of its own above its verse, in plain text too, only when
  // the passage includes that verse; chapter view keeps it.
  const data = { chapters: [null, null, [null, { text: "Зачем мятутся народы?", heading: "Псалом Давида.", paragraphStart: true }, { text: "Восстают цари.", paragraphStart: false }]] };
  const read = (verseStart, verseEnd) => extractBibleTextFromCompactBook({ translationId: DEFAULT_TRANSLATION_ID, book: 19, bookName: "Псалтирь", chapter: 2, verseStart, verseEnd, data });
  assert.strictEqual(read(1, 2).verses[0].heading, "Псалом Давида.");

  const mapping = createBookMapping([{ id: 19, name: "Псалтирь", abbreviation: "Пс" }]);
  const preview = (verseStart, verseEnd) => formatBibleTextBlocks([{
    reference: { book: 19, chapterStart: 2, verseStart, chapterEnd: 2, verseEnd },
    parts: [{ range: { book: 19, chapter: 2, verseStart, verseEnd }, bibleText: read(verseStart, verseEnd) }],
  }], mapping);
  const full = preview(1, 2);
  assert.deepStrictEqual(full.blocks[0].paragraphs.map((paragraph) => [paragraph.heading, paragraph.verses.map((verse) => verse.number)]), [["Псалом Давида.", [1, 2]]]);
  assert(full.plainText.includes("Псалом Давида.\n1 Зачем мятутся народы? 2 Восстают цари."), full.plainText);
  assert(!preview(2, 2).plainText.includes("Псалом Давида."), "no heading without its verse");
  const chapter = toBibleChapterPreviewContent(full, { title: "Псалтирь 2", highlightedRanges: [] });
  assert.strictEqual(chapter.blocks[0].paragraphs[0].heading, "Псалом Давида.");
};
