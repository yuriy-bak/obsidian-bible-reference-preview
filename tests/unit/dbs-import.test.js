const zlib = require("zlib");
const { assert, createBookMapping, extractBibleTextFromCompactBook, formatBibleTextBlocks } = require("../helpers");
const { DbsHtmlBibleSource } = require("../../.test-build/src/infrastructure/sources/dbs-html/DbsHtmlBibleSource.js");
const { extractVersesFromDbsChapter } = require("../../.test-build/src/infrastructure/sources/dbs-html/dbsHtml.js");
const { createBibleSources, selectBibleSource } = require("../../.test-build/src/infrastructure/sources/BibleSourceRegistry.js");

// "HTML Study Bible" of dbs.org, shaped after the Russian Easy-to-Read page (RUSERV).
const verse = (id, number, firstWord) => `<span class="v" data-v="${id}"><span class="v-num-wrapper"><sup class="v-num">${number}</sup>${firstWord}&nbsp;</span>`;
const footnote = (n, reference, keyword, text) => `<label for="fn-${n}" class="margin-toggle sidenote-number"></label><input type="checkbox" id="fn-${n}" class="margin-toggle"/><span class="sidenote">+ <span class="fr">${reference}</span> <span class="fk">${keyword}</span> <span class="ft">${text}</span></span>`;

const chapters = {
  AC1: `<div class="chapter" data-chapter="1"> <div class="s">Пролог</div><div class="reference">(Лк. 24:50-53)</div>`
    + `<p class="p">${verse("AC1.15", 15, "Тогда")}Пётр встал.</span> ${verse("AC1.16", 16, "«Братья")}и сёстры мои, должно было исполниться Писание${footnote(1, "1:16", "Писание", "Или «слово».")}». Он был одним из нас.</span> </p>`
    + `<p class="p">${verse("AC1.18", 18, "(Иуда")}купил поле.)</span> </p>`
    + `<p class="p">${verse("AC1.26", 26, "Бросили")}жребий.</span></p></div>`,
  GL4: `<div class="chapter" data-chapter="4"><p class="p">${verse("GL4.6", 6, "Бог")}послал Духа, взывающего: « <span class="tl">Авва!</span> ».</span></p></div>`,
  PS3: `<div class="chapter" data-chapter="3"> <div class="s">Псалом</div><div class="q1">${verse("PS3.2", 2, "Господи")}, как много у меня врагов,</span> </div>`
    + `<div class="q2">как много людей против меня восстали! <span class="qs">Селах</span> </div><div class="q1">${verse("PS3.3", 3, "И")}речи многие.</span> </div></div>`,
  TB1: `<p class="p">${verse("TB1.1", 1, "Книга")}Товита.</span></p>`,
};

const createPage = () => {
  const compressed = zlib.brotliCompressSync(Buffer.from(JSON.stringify(chapters))).toString("base64");
  const books = [
    { id: "PS", idShort: "PS", name: "Псалтирь", chapters: 150, group: "Wisdom" },
    { id: "AC", idShort: "AC", name: "Деяния", chapters: 28, group: "History" },
    { id: "TB", idShort: "TB", name: "Товит", chapters: 14, group: "Deuterocanon" },
    { id: "GL", idShort: "GL", name: "К Галатам", chapters: 6, group: "Paul" },
  ];
  const html = `<!doctype html><html lang="rus" dir="ltr"><head><meta charset="UTF-8"><title>Bible Reader</title></head><body><div id="app"></div>`
    + `<script>\nconst COMPRESSED_VERSES = \`${compressed}\`;\n\nconst BIBLE_BOOKS = \`${JSON.stringify(books)}\`;\nconst BIBLE_ID = "RUSERV";\n</script></body></html>`;
  return new TextEncoder().encode(html).buffer;
};

module.exports = async () => {
  // A merged verse keeps only its first number; one or two missing numbers are joined into it,
  // a longer gap (a list the page lost) is not.
  const acts = extractVersesFromDbsChapter(chapters.AC1);
  assert.deepStrictEqual(acts.map((item) => [item.verse, item.verseEnd]), [[15, undefined], [16, 17], [18, undefined], [26, undefined]]);
  assert.strictEqual(acts[1].text, "«Братья и сёстры мои, должно было исполниться Писание». Он был одним из нас.");
  assert.deepStrictEqual(acts[1].footnotes, ["Писание Или «слово»."]);
  assert.strictEqual(acts[0].paragraphStart, true);
  assert.strictEqual(acts[1].paragraphStart, false);
  // Spacing artifacts of the page: the space after the first word before punctuation, spaces inside quotes.
  assert.strictEqual(extractVersesFromDbsChapter(chapters.GL4)[0].text, "Бог послал Духа, взывающего: «Авва!».");
  // Poetry lines break the verse; headings are not verse text; the psalm title is not verse 1 here.
  assert.deepStrictEqual(extractVersesFromDbsChapter(chapters.PS3).map((item) => [item.verse, item.text]), [
    [2, "Господи, как много у меня врагов,\nкак много людей против меня восстали! Селах"],
    [3, "И речи многие."],
  ]);

  const content = createPage();
  const source = new DbsHtmlBibleSource();
  assert.strictEqual((await selectBibleSource(createBibleSources(), { fileName: "Bible Reader.html", content })).id, "dbs-html");
  assert.strictEqual(await source.canHandle({ fileName: "other.html", content: new TextEncoder().encode("<html><body>Hi</body></html>").buffer }), false);
  assert.deepStrictEqual(await source.readMetadata(content), { title: "RUSERV", language: "ru" });

  const result = await source.importBible({ fileName: "Bible Reader.html", content, translationId: "ru-erv", translationName: "Современный перевод", language: "" });
  const translation = result.bibleIndexV2Data.translations["ru-erv"];
  assert.strictEqual(translation.language, "ru");
  assert.deepStrictEqual(translation.bookOrder, [19, 44, 48]);
  assert.deepStrictEqual(result.books.map((book) => [book.id, book.name, book.abbreviation]), [
    [19, "Псалтирь", "Пс"], [44, "Деяния", "Деян"], [48, "К Галатам", "Гал"],
  ]);
  assert(result.warnings.includes("Skipped books outside the 66-book canon: TB"), "skipped books warning");

  // Reading Acts 1:17 gives the joined verse, shown once under "16–17".
  const actsBook = result.compactBooks[translation.books["44"].path];
  const text = extractBibleTextFromCompactBook({ translationId: "ru-erv", book: 44, bookName: "Деяния", chapter: 1, verseStart: 17, verseEnd: 18, data: actsBook });
  assert.deepStrictEqual(text.verses.map((item) => [item.number, item.numberEnd]), [[16, 17], [18, undefined]]);
  const mapping = createBookMapping([{ id: 44, name: "Деяния", abbreviation: "Деян" }]);
  const preview = formatBibleTextBlocks([{
    reference: { book: 44, chapterStart: 1, verseStart: 16, chapterEnd: 1, verseEnd: 18 },
    parts: [{ range: { book: 44, chapter: 1, verseStart: 16, verseEnd: 18 }, bibleText: text }],
  }], mapping, "[нет]");
  assert(preview.plainText.includes("16–17 «Братья"), preview.plainText);
  assert(!preview.plainText.includes("17 [нет]"), preview.plainText);
  assert(preview.plainText.includes("18 (Иуда купил поле.)"), preview.plainText);
};
