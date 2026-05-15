const assert = require("assert");
const { BibleReferenceParser } = require("../src/parsing/BibleReferenceParser.js");
const { createFallbackRussianBookMapping } = require("../src/parsing/BookMapping.js");
const { formatBibleReference } = require("../src/parsing/formatBibleReference.js");
const { DEFAULT_TRANSLATION_ID } = require("../src/application/DefaultTranslation.js");
const { getBibleTextBlocks } = require("../src/application/getBibleTexts.js");
const { formatBibleTextBlocks } = require("../src/application/formatBibleTexts.js");
const { createMockBibleIndexRepository } = require("../src/infrastructure/createMockBibleIndexRepository.js");
const { JsonBibleIndexRepository } = require("../src/infrastructure/JsonBibleIndexRepository.js");
const { mockBibleIndexData } = require("../src/infrastructure/mockBibleIndex.js");

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

console.log("Parser, BibleText and BibleIndexRepository tests passed");
