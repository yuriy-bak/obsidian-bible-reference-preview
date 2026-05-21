const assert = require("assert");
const { BibleReferenceParser } = require("../src/parsing/BibleReferenceParser.js");
const { createBookMapping } = require("../src/parsing/BookMapping.js");
const DEFAULT_TRANSLATION_ID = "newworld";
const { getBibleTextBlocks } = require("../src/application/getBibleTexts.js");
const { LazyBibleIndexV2 } = require("../src/infrastructure/v2/LazyBibleIndexV2.js");
const { createBookMappingFromBibleIndexV2Data } = require("../src/infrastructure/v2/createBookMappingFromBibleIndexV2Data.js");
const { 
enrichBookTableFromNavigationHtml,
    extractBookNavigationAliasesFromHtml,
    extractBookTableFromHtml,
    extractVersesFromHtml,
 } = require("../src/infrastructure/epub/htmlTextUtils.js");
const { extractBibleTextFromCompactBook } = require("../src/infrastructure/v2/extractBibleTextFromCompactBook.js");
const { formatBibleTextBlocks } = require("../src/application/formatBibleTexts.js");

(async () => {
    const mapping = createBookMapping([
        { id: 43, name: "иоанна", abbreviation: "ин" },
        { id: 45, name: "римлянам", abbreviation: "рим" },
        { id: 46, name: "1коринфянам", abbreviation: "1кор", aliases: ["1 коринфянам", "1 кор"] },
        { id: 65, name: "иуды", abbreviation: "иуд", chapterCount: 1 },
    ]);
    const parser = new BibleReferenceParser(mapping);
    assert.strictEqual(parser.parse("Ин3:16").length, 1);
    assert.strictEqual(parser.parse("1 Кор 13:4").length, 1);
    assert.deepStrictEqual(parser.parse("Иуд6"), [{ book: 65, chapterStart: 1, verseStart: 6, chapterEnd: 1, verseEnd: 6 }]);

    const twoChapterJudeParser = new BibleReferenceParser(createBookMapping([
        { id: 65, name: "иуды", abbreviation: "иуд", chapterCount: 2 },
    ]));
    assert.strictEqual(twoChapterJudeParser.parse("Иуд6").length, 0);

    const conflictingAliasParser = new BibleReferenceParser(createBookMapping([
        { id: 43, name: "иоанна", abbreviation: "ин", aliases: ["общ"] },
        { id: 45, name: "римлянам", abbreviation: "рим", aliases: ["общ"] },
    ]));
    assert.strictEqual(conflictingAliasParser.parse("общ 1:1").length, 0);

    const matchSample = "Смотри Ин. 3:16-18 и Рим 8:28.";
    const matches = parser.parseMatches(matchSample);
    assert.strictEqual(matches.length, 2);
    assert.strictEqual(matches[0].text, "Ин. 3:16-18");
    assert.strictEqual(matchSample.slice(matches[0].from, matches[0].to), "Ин. 3:16-18");
    assert.strictEqual(matches[1].text, "Рим 8:28");
    assert.strictEqual(matchSample.slice(matches[1].from, matches[1].to), "Рим 8:28");
    const index = {
        async getBibleText() {
            return {
                translationId: DEFAULT_TRANSLATION_ID,
                book: 43,
                bookName: "Ин",
                chapter: 3,
                verses: [{ number: 16, text: "Текст Ин 3:16", footnotes: [] }],
            };
        },
    };
    const blocks = await getBibleTextBlocks(parser.parse("Ин 3:16"), index, DEFAULT_TRANSLATION_ID);
    assert.strictEqual(blocks.length, 1);

    const metadata = {
        version: 2,
        translations: {
            [DEFAULT_TRANSLATION_ID]: {
                name: "synthetic",
                language: "ru",
                sourceFileName: "synthetic.epub",
                importedAt: "2026-01-01T00:00:00.000Z",
                books: {
                    "1": { name: "Бытие", abbreviation: "Бт", aliases: ["Бытие", "Бт", "Быт"], path: "translations/newworld/books/1.json" },
                    "43": { name: "Иоанна", abbreviation: "Ин", aliases: ["Иоанна", "Ин", "Иоан"], path: "translations/newworld/books/43.json", chapterCount: 21 },
                    "46": { name: "1 Коринфянам", abbreviation: "1Кор", aliases: ["1 Коринфянам", "1Кор", "1 Кр"], path: "translations/newworld/books/46.json", chapterCount: 16 },
                    "65": { name: "Иуды", abbreviation: "Иуд", aliases: ["Иуды", "Иуд"], path: "translations/newworld/books/65.json", chapterCount: 1 },
                    "66": { name: "Откровение", abbreviation: "Отк", aliases: ["Откровение", "Отк"], path: "translations/newworld/books/66.json", chapterCount: 22 },
                },
            },
        },
    };
    const importedParser = new BibleReferenceParser(createBookMappingFromBibleIndexV2Data(metadata, DEFAULT_TRANSLATION_ID));
    for (const sample of ["Ин1:2", "Ин 1:2", "Иоан1:2", "Иоан.1:2", "1Кор1:1", "1 Кор1:1", "1Кр1:1", "1 Кр1:1", "Быт1:1", "Бт1:1", "Отк21:4", "Иуд6"]) {
        assert(importedParser.parse(sample).length > 0, `Expected parser to recognize ${sample}`);
    }

    let loadCount = 0;
    const lazy = new LazyBibleIndexV2(metadata, {
        async loadBook() {
            loadCount += 1;
            return { chapters: [null, [null, "В начале Бог создал небо и землю.", ["Земля была безлика и пуста.", ["Или «сила»."]]]] };
        },
    });
    const text = await lazy.getBibleText({ translationId: DEFAULT_TRANSLATION_ID, book: 1, chapter: 1, verseStart: 1, verseEnd: 2 });
    await lazy.getBibleText({ translationId: DEFAULT_TRANSLATION_ID, book: 1, chapter: 1, verseStart: 1, verseEnd: 1 });
    assert.strictEqual(loadCount, 1);
    assert.strictEqual(text.verses.length, 2);


    const nonRussianRows = Array.from({ length: 66 }, (_unused, index) => {
        const bookNumber = String(index + 1).padStart(2, "0");
        return `<tr><td><a href="10010611${bookNumber}.xhtml">Kitap ${index + 1}</a></td><td></td><td>K${index + 1}</td></tr>`;
    }).join("");
    const nonRussianBookTable = extractBookTableFromHtml(`<table>${nonRussianRows}</table>`);
    assert(nonRussianBookTable !== null, "Expected non-Russian 66-book table to be accepted");
    assert.strictEqual(nonRussianBookTable.books[0].name, "Kitap 1");


    const oldBibleNavigationHtml = `<p>${Array.from({ length: 66 }, (_unused, index) => {
        const bookId = String(index + 1).padStart(2, "0");
        return `<a href="BIBLE_${bookId}.xhtml">B${bookId}</a>`;
    }).join(" ")}</p>`;
    const oldBibleNavigationTable = extractBookTableFromHtml(oldBibleNavigationHtml);
    assert(oldBibleNavigationTable !== null, "Expected old BIBLE_00 navigation without hardcoded book names to be accepted");
    assert.strictEqual(oldBibleNavigationTable.books.length, 66);
    assert.strictEqual(oldBibleNavigationTable.hrefToBookId["BIBLE_01.xhtml"], 1);
    enrichBookTableFromNavigationHtml(
        oldBibleNavigationTable,
        "OEBPS/BIBLE_01.xhtml",
        "<html><head><title>First Book From EPUB (Navigation)</title></head><body><a href='05_BOOK.xhtml#chapter1_verse1'>1</a></body></html>",
    );
    assert.strictEqual(oldBibleNavigationTable.books[0].name, "First Book From EPUB");
    assert.strictEqual(oldBibleNavigationTable.hrefToBookId["05_BOOK.xhtml"], 1);

    enrichBookTableFromNavigationHtml(
        oldBibleNavigationTable,
        "OEBPS/BIBLE_66.xhtml",
        "<html><head><title>Last Book From EPUB (Navigation)</title></head><body><a href='05_BOOK.xhtml#chapter1_verse1'>1</a></body></html>",
    );
    assert.strictEqual(oldBibleNavigationTable.hrefToBookId["05_BOOK.xhtml"], 1);

    const scriptureReferenceAliases = extractBookNavigationAliasesFromHtml(
        "<p><a href='05_BOOK.xhtml#chapter3_verse34'>Иоанн 3:34-4:1</a></p>",
        oldBibleNavigationTable,
    );
    assert.deepStrictEqual(scriptureReferenceAliases, {});

    const aliases = metadata.translations[DEFAULT_TRANSLATION_ID].books["1"].aliases;
    assert(!aliases.some((alias) => alias.startsWith("^") || alias.includes(":") || alias.includes(";") || alias === "1"));

    const paragraphHtml = `
        <p><span id="chapter2_verse7"></span><strong><sup>7</sup></strong>Первый<span id="footnotesource1"></span><a epub:type="noteref" href="#footnote1">*</a>. <span id="chapter2_verse8"></span><strong><sup>8</sup></strong>Второй.</p>
        <p><span id="chapter2_verse9"></span><strong><sup>9</sup></strong>Третий.</p>
        <p><span id="chapter2_verse10"></span><strong><sup>10</sup></strong>Строка 1<br/>Строка 2</p>
        <div class="groupFootnote"><div id="footnote1"><p><a href="#footnotesource1">^ Быт. 2:7</a> Сноска.</p></div></div>
    `;
    const extractedVerses = extractVersesFromHtml(paragraphHtml);
    assert.strictEqual(extractedVerses[0].paragraphStart, true);
    assert.strictEqual(extractedVerses[1].paragraphStart, false);
    assert.strictEqual(extractedVerses[2].paragraphStart, true);
    assert.strictEqual(extractedVerses[0].text, "Первый*.");
    assert.deepStrictEqual(extractedVerses[0].footnotes, ["Сноска."]);
    assert.strictEqual(extractedVerses[3].text, "Строка 1\nСтрока 2");

    const compactStringText = extractBibleTextFromCompactBook({
        translationId: DEFAULT_TRANSLATION_ID,
        book: 1,
        bookName: "Бытие",
        chapter: 1,
        verseStart: 1,
        verseEnd: 1,
        data: { chapters: [null, [null, "Старый текст"]] },
    });
    assert.strictEqual(compactStringText.verses[0].paragraphStart, true);

    const compactTupleText = extractBibleTextFromCompactBook({
        translationId: DEFAULT_TRANSLATION_ID,
        book: 1,
        bookName: "Бытие",
        chapter: 1,
        verseStart: 1,
        verseEnd: 1,
        data: { chapters: [null, [null, ["Старый текст", ["Сноска"]]]] },
    });
    assert.strictEqual(compactTupleText.verses[0].paragraphStart, true);
    assert.deepStrictEqual(compactTupleText.verses[0].footnotes, ["Сноска"]);

    const compactObjectText = extractBibleTextFromCompactBook({
        translationId: DEFAULT_TRANSLATION_ID,
        book: 1,
        bookName: "Бытие",
        chapter: 1,
        verseStart: 1,
        verseEnd: 2,
        data: { chapters: [null, [null, { text: "Первый", paragraphStart: true }, { text: "Второй", paragraphStart: false }]] },
    });
    assert.strictEqual(compactObjectText.verses[1].paragraphStart, false);

    const formatterMapping = createBookMapping([{ id: 1, name: "Бытие", abbreviation: "Бт" }, { id: 43, name: "Иоанна", abbreviation: "Ин" }]);
    const formattedInline = formatBibleTextBlocks([{
        reference: { book: 1, chapterStart: 2, verseStart: 7, chapterEnd: 2, verseEnd: 9 },
        parts: [{
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 9 },
            bibleText: { translationId: DEFAULT_TRANSLATION_ID, book: 1, bookName: "Бытие", chapter: 2, verses: [
                { number: 7, text: "Первый", footnotes: ["Сноска 7"], paragraphStart: true },
                { number: 8, text: "Второй", footnotes: [], paragraphStart: false },
                { number: 9, text: "Третий", footnotes: [], paragraphStart: true },
            ] },
        }],
        sourceText: "Бт 2:7-9",
    }], formatterMapping);
    assert(formattedInline.plainText.includes("📖 Бт 2:7-9.\n7 Первый 8 Второй\n\n9 Третий"));
    assert(formattedInline.plainText.includes("^Бт 2:7 Сноска 7"));

    const formattedSameChapter = formatBibleTextBlocks([
        {
            reference: { book: 1, chapterStart: 2, verseStart: 1, chapterEnd: 2, verseEnd: 5 },
            parts: [{ range: { book: 1, chapter: 2, verseStart: 1, verseEnd: 5 }, bibleText: { translationId: DEFAULT_TRANSLATION_ID, book: 1, bookName: "Бытие", chapter: 2, verses: [1, 2, 3, 4, 5].map((number) => ({ number, text: `t${number}`, footnotes: [], paragraphStart: true })) } }],
            sourceText: "Бт 2:1-5, 7, 8, 12-15",
        },
        {
            reference: { book: 1, chapterStart: 2, verseStart: 7, chapterEnd: 2, verseEnd: 8 },
            parts: [{ range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 8 }, bibleText: { translationId: DEFAULT_TRANSLATION_ID, book: 1, bookName: "Бытие", chapter: 2, verses: [7, 8].map((number) => ({ number, text: `t${number}`, footnotes: [], paragraphStart: true })) } }],
            sourceText: "Бт 2:1-5, 7, 8, 12-15",
        },
    ], formatterMapping);
    assert(formattedSameChapter.plainText.startsWith("📖 Бт 2:1-5, 7, 8, 12-15.\n"));

    const formattedDifferentBooks = formatBibleTextBlocks([
        { reference: { book: 1, chapterStart: 2, verseStart: 7, chapterEnd: 2, verseEnd: 7 }, parts: [{ range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 7 }, bibleText: { translationId: DEFAULT_TRANSLATION_ID, book: 1, bookName: "Бытие", chapter: 2, verses: [{ number: 7, text: "Бытие", footnotes: [], paragraphStart: true }] } }] },
        { reference: { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 }, parts: [{ range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 }, bibleText: { translationId: DEFAULT_TRANSLATION_ID, book: 43, bookName: "Иоанна", chapter: 3, verses: [{ number: 16, text: "Иоанна", footnotes: [], paragraphStart: true }] } }] },
    ], formatterMapping);
    assert(formattedDifferentBooks.plainText.includes("__________"));

    console.log("All parser/importer tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
