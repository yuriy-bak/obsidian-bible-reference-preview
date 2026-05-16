const assert = require("assert");
const { BibleReferenceParser } = require("../src/parsing/BibleReferenceParser.js");
const { createFallbackRussianBookMapping } = require("../src/parsing/BookMapping.js");
const { DEFAULT_TRANSLATION_ID } = require("../src/application/DefaultTranslation.js");
const { getBibleTextBlocks } = require("../src/application/getBibleTexts.js");
const { createMockBibleIndexRepository } = require("../src/infrastructure/createMockBibleIndexRepository.js");
const { LazyBibleIndexV2 } = require("../src/infrastructure/v2/LazyBibleIndexV2.js");
const { createBookMappingFromBibleIndexV2Data } = require("../src/infrastructure/v2/createBookMappingFromBibleIndexV2Data.js");
const { 
enrichBookTableFromNavigationHtml,
    extractBookNavigationAliasesFromHtml,
    extractBookTableFromHtml,
 } = require("../src/infrastructure/epub/htmlTextUtils.js");

(async () => {
    const mapping = createFallbackRussianBookMapping();
    const parser = new BibleReferenceParser(mapping);
    assert.strictEqual(parser.parse("Ин3:16").length, 1);
    assert.strictEqual(parser.parse("1 Кор 13:4").length, 1);

 const matchSample = "Смотри Ин. 3:16-18 и Рим 8:28.";
 const matches = parser.parseMatches(matchSample);
 assert.strictEqual(matches.length, 2);
 assert.strictEqual(matches[0].text, "Ин. 3:16-18");
 assert.strictEqual(matchSample.slice(matches[0].from, matches[0].to), "Ин. 3:16-18");
 assert.strictEqual(matches[1].text, "Рим 8:28");
 assert.strictEqual(matchSample.slice(matches[1].from, matches[1].to), "Рим 8:28");

    const index = createMockBibleIndexRepository().getIndex();
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
                    "43": { name: "Иоанна", abbreviation: "Ин", aliases: ["Иоанна", "Ин", "Иоан"], path: "translations/newworld/books/43.json" },
                    "46": { name: "1 Коринфянам", abbreviation: "1Кор", aliases: ["1 Коринфянам", "1Кор", "1 Кр"], path: "translations/newworld/books/46.json" },
                    "66": { name: "Откровение", abbreviation: "Отк", aliases: ["Откровение", "Отк"], path: "translations/newworld/books/66.json" },
                },
            },
        },
    };
    const importedParser = new BibleReferenceParser(createBookMappingFromBibleIndexV2Data(metadata, DEFAULT_TRANSLATION_ID));
    for (const sample of ["Ин1:2", "Ин 1:2", "Иоан1:2", "Иоан.1:2", "1Кор1:1", "1 Кор1:1", "1Кр1:1", "1 Кр1:1", "Быт1:1", "Бт1:1", "Отк21:4"]) {
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

    const scriptureReferenceAliases = extractBookNavigationAliasesFromHtml(
        "<p><a href='05_BOOK.xhtml#chapter3_verse34'>Иоанн 3:34-4:1</a></p>",
        oldBibleNavigationTable,
    );
    assert.deepStrictEqual(scriptureReferenceAliases, {});

    const aliases = metadata.translations[DEFAULT_TRANSLATION_ID].books["1"].aliases;
    assert(!aliases.some((alias) => alias.startsWith("^") || alias.includes(":") || alias.includes(";") || alias === "1"));
    console.log("All parser/importer tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
