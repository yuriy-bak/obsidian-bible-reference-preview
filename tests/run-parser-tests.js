const assert = require("assert");
const JSZip = require("jszip");
const { BibleReferenceParser } = require("../src/parsing/BibleReferenceParser.js");
const { createFallbackRussianBookMapping } = require("../src/parsing/BookMapping.js");
const { formatBibleReference } = require("../src/parsing/formatBibleReference.js");
const { DEFAULT_TRANSLATION_ID } = require("../src/application/DefaultTranslation.js");
const { getBibleTextBlocks } = require("../src/application/getBibleTexts.js");
const { formatBibleTextBlocks } = require("../src/application/formatBibleTexts.js");
const { createMockBibleIndexRepository } = require("../src/infrastructure/createMockBibleIndexRepository.js");
const { JsonBibleIndexRepository } = require("../src/infrastructure/JsonBibleIndexRepository.js");
const { mockBibleIndexData } = require("../src/infrastructure/mockBibleIndex.js");
const { JsZipEpubBibleImporter } = require("../src/infrastructure/epub/JsZipEpubBibleImporter.js");

const mapping = createFallbackRussianBookMapping();
const parser = new BibleReferenceParser(mapping);
const bibleIndexRepository = createMockBibleIndexRepository();
const bibleIndex = bibleIndexRepository.getIndex();

function parse(text) {
    return parser.parse(text);
}

function formatReferences(text) {
    return parse(text)
        .map((reference) => formatBibleReference(reference, mapping))
        .join("\n");
}

function formatTexts(text) {
    const references = parse(text);
    const blocks = getBibleTextBlocks(references, bibleIndex, DEFAULT_TRANSLATION_ID);
    return formatBibleTextBlocks(blocks, mapping);
}

assert.deepStrictEqual(parse("Ин 3:16"), [
    { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 },
]);

assert.strictEqual(formatReferences("Ин 3:16"), "📖 Ин 3:16");
assert.strictEqual(formatReferences("Ин 3:16-18"), "📖 Ин 3:16-18");
assert.strictEqual(formatReferences("Ин 3:16,17"), "📖 Ин 3:16-17");
assert.strictEqual(formatReferences("Ин 3:16,17,18,21"), "📖 Ин 3:16-18\n📖 Ин 3:21");
assert.strictEqual(formatReferences("Ин 3:16;4:1"), "📖 Ин 3:16\n📖 Ин 4:1");
assert.strictEqual(formatReferences("Ин 3:16-4:5"), "📖 Ин 3:16-4:5");
assert.strictEqual(formatReferences("Ин. 3:16"), "📖 Ин 3:16");
assert.strictEqual(formatReferences("Ин3:16"), "📖 Ин 3:16");
assert.strictEqual(formatReferences("Ин 3 : 16"), "📖 Ин 3:16");
assert.strictEqual(formatReferences("Ин 3:16–18"), "📖 Ин 3:16-18");
assert.strictEqual(formatReferences("Псалом 22:1"), "📖 Пс 22:1");
assert.strictEqual(formatReferences("Рим 8:28"), "📖 Рим 8:28");
assert.strictEqual(formatReferences("1 Кор 13:4"), "📖 1Кор 13:4");
assert.strictEqual(formatReferences("Иуд 5,6,7,10"), "📖 Иуд 5-7\n📖 Иуд 10");
assert.strictEqual(formatReferences("Ин 3"), "");
assert.strictEqual(formatReferences("Ин 3:0"), "");
assert.strictEqual(formatReferences("Ин 0:1"), "");
assert.strictEqual(formatReferences("Неизвестная 1:1"), "");

assert.strictEqual(formatTexts("Ин 3:16"), [
    "📖 Ин 3:16",
    "16. Текст Ин 3:16",
    "",
    "^Ин 3:16 Текст сноски Ин 3:16",
].join("\n"));

assert.strictEqual(formatTexts("Ин 3:16-18"), [
    "📖 Ин 3:16-18",
    "16. Текст Ин 3:16",
    "17. [стих не найден]",
    "18. Текст Ин 3:18",
    "",
    "^Ин 3:16 Текст сноски Ин 3:16",
    "^Ин 3:18 Текст сноски Ин 3:18",
].join("\n"));

assert.strictEqual(formatTexts("Ин 3:16 Рим 8:28"), [
    "📖 Ин 3:16",
    "16. Текст Ин 3:16",
    "",
    "^Ин 3:16 Текст сноски Ин 3:16",
    "__________",
    "📖 Рим 8:28",
    "28. Текст Рим 8:28",
    "",
    "^Рим 8:28 Текст сноски Рим 8:28",
].join("\n"));

assert.strictEqual(formatTexts("Ин 3:16 Ин 4:1"), [
    "📖 Ин 3:16",
    "16. Текст Ин 3:16",
    "",
    "^Ин 3:16 Текст сноски Ин 3:16",
    "",
    "📖 Ин 4:1",
    "1. Текст Ин 4:1",
].join("\n"));

assert.strictEqual(formatTexts("Иуд 5"), [
    "📖 Иуд 5",
    "5. Текст Иуд 5",
    "",
    "^Иуд 5 Текст сноски Иуд 5",
].join("\n"));

assert.strictEqual(formatTexts("Ин 999:999"), "");

assert.strictEqual(
    bibleIndexRepository.getIndex().getBibleText({
        translationId: DEFAULT_TRANSLATION_ID,
        book: 43,
        chapter: 3,
        verseStart: 16,
        verseEnd: 16,
    }).verses[0].text,
    "Текст Ин 3:16",
);

const jsonBibleIndexRepository = new JsonBibleIndexRepository(mockBibleIndexData);
assert.strictEqual(
    jsonBibleIndexRepository.getIndex().getBibleText({
        translationId: DEFAULT_TRANSLATION_ID,
        book: 45,
        chapter: 8,
        verseStart: 28,
        verseEnd: 28,
    }).verses[0].text,
    "Текст Рим 8:28",
);

async function createSyntheticEpubBuffer() {
    const zip = new JSZip();

    zip.file("META-INF/container.xml", [
        "<?xml version=\"1.0\"?>",
        "<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">",
        "<rootfiles>",
        "<rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/>",
        "</rootfiles>",
        "</container>",
    ].join(""));

    zip.file("OEBPS/content.opf", [
        "<?xml version=\"1.0\"?>",
        "<package version=\"3.0\" xmlns=\"http://www.idpf.org/2007/opf\">",
        "<manifest>",
        "<item id=\"books\" href=\"books.xhtml\" media-type=\"application/xhtml+xml\"/>",
        "<item id=\"john3\" href=\"john3.xhtml\" media-type=\"application/xhtml+xml\"/>",
        "</manifest>",
        "<spine>",
        "<itemref idref=\"books\"/>",
        "<itemref idref=\"john3\"/>",
        "</spine>",
        "</package>",
    ].join(""));

    zip.file("OEBPS/books.xhtml", [
        "<html><body>",
        "<table class=\"tableDiv stripe half\">",
        "<tr><td>Иоанна</td><td>unused</td><td>Ин</td></tr>",
        "</table>",
        "</body></html>",
    ].join(""));

    zip.file("OEBPS/john3.xhtml", [
        "<html><body data-book-id=\"1\">",
        "<h1>Ин</h1>",
        "<p><span id=\"chapter3_verse16\"></span>Текст из EPUB Ин 3:16<a href=\"#fn1\">*</a></p>",
        "<p><span id=\"chapter3_verse17\"></span>Текст из EPUB Ин 3:17</p>",
        "<aside id=\"fn1\">Сноска из EPUB Ин 3:16</aside>",
        "</body></html>",
    ].join(""));

    return zip.generateAsync({ type: "arraybuffer" });
}

async function runRealEpubImporterTests() {
    const importer = new JsZipEpubBibleImporter();
    const content = await createSyntheticEpubBuffer();
    const result = await importer.importEpub({
        fileName: "synthetic.epub",
        content,
        translationId: DEFAULT_TRANSLATION_ID,
        translationName: "Synthetic New World",
    });

    assert.strictEqual(result.books.length, 1);
    assert.strictEqual(result.books[0].abbreviation, "ин");
    assert.strictEqual(result.warnings.length, 1);
    assert.strictEqual(
        result.bibleIndexData.translations[DEFAULT_TRANSLATION_ID].books["1"].chapters["3"]["16"].text,
        "Текст из EPUB Ин 3:16",
    );
    assert.deepStrictEqual(
        result.bibleIndexData.translations[DEFAULT_TRANSLATION_ID].books["1"].chapters["3"]["16"].footnotes,
        ["Сноска из EPUB Ин 3:16"],
    );
}

runRealEpubImporterTests()
    .then(() => {
        console.log("Parser, BibleText and BibleIndexRepository tests passed");
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
