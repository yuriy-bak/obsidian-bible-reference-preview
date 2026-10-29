const {
  assert,
  createBookMapping,
  formatBibleComparisonTextBlocks,
  formatBibleTextBlocks,
  DEFAULT_TRANSLATION_ID,
} = require("../helpers");

module.exports = async () => {
  const formatterMapping = createBookMapping([
    { id: 1, name: "Бытие", abbreviation: "Бт" },
    { id: 43, name: "Иоанна", abbreviation: "Ин" },
  ]);
  const formattedInline = formatBibleTextBlocks(
    [
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 7,
          chapterEnd: 2,
          verseEnd: 9,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 9 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [
                {
                  number: 7,
                  text: "Первый",
                  footnotes: ["Сноска 7"],
                  paragraphStart: true,
                },
                {
                  number: 8,
                  text: "Второй",
                  footnotes: [],
                  paragraphStart: false,
                },
                {
                  number: 9,
                  text: "Третий",
                  footnotes: [],
                  paragraphStart: true,
                },
              ],
            },
          },
        ],
        sourceText: "Бт 2:7-9",
      },
    ],
    formatterMapping
  );
  assert(
    formattedInline.plainText.includes(
      "📖 Бт 2:7-9.\n7 Первый 8 Второй\n\n9 Третий"
    )
  );
  assert(formattedInline.plainText.includes("^Бт 2:7 Сноска 7"));

  const formattedSameChapter = formatBibleTextBlocks(
    [
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 1,
          chapterEnd: 2,
          verseEnd: 5,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 1, verseEnd: 5 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [1, 2, 3, 4, 5].map((number) => ({
                number,
                text: `t${number}`,
                footnotes: [],
                paragraphStart: true,
              })),
            },
          },
        ],
        sourceText: "Бт 2:1-5, 7, 8, 12-15",
      },
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 7,
          chapterEnd: 2,
          verseEnd: 8,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 8 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [7, 8].map((number) => ({
                number,
                text: `t${number}`,
                footnotes: [],
                paragraphStart: true,
              })),
            },
          },
        ],
        sourceText: "Бт 2:1-5, 7, 8, 12-15",
      },
    ],
    formatterMapping
  );
  assert(
    formattedSameChapter.plainText.startsWith("📖 Бт 2:1-5, 7, 8, 12-15.\n")
  );

  const formattedDifferentBooks = formatBibleTextBlocks(
    [
      {
        reference: {
          book: 1,
          chapterStart: 2,
          verseStart: 7,
          chapterEnd: 2,
          verseEnd: 7,
        },
        parts: [
          {
            range: { book: 1, chapter: 2, verseStart: 7, verseEnd: 7 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 1,
              bookName: "Бытие",
              chapter: 2,
              verses: [
                {
                  number: 7,
                  text: "Бытие",
                  footnotes: [],
                  paragraphStart: true,
                },
              ],
            },
          },
        ],
      },
      {
        reference: {
          book: 43,
          chapterStart: 3,
          verseStart: 16,
          chapterEnd: 3,
          verseEnd: 16,
        },
        parts: [
          {
            range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 },
            bibleText: {
              translationId: DEFAULT_TRANSLATION_ID,
              book: 43,
              bookName: "Иоанна",
              chapter: 3,
              verses: [
                {
                  number: 16,
                  text: "Иоанна",
                  footnotes: [],
                  paragraphStart: true,
                },
              ],
            },
          },
        ],
      },
    ],
    formatterMapping
  );
  assert(formattedDifferentBooks.plainText.includes("__________"));

  const turkishFormatterMapping = createBookMapping([
    { id: 43, name: "Yuhanna", abbreviation: "Yhn" },
  ]);

  const comparisonContent = formatBibleComparisonTextBlocks(
    [
      {
        title: "Ин 3:16",
        references: [
          {
            book: 43,
            chapterStart: 3,
            verseStart: 16,
            chapterEnd: 3,
            verseEnd: 16,
          },
        ],
        translations: [
          {
            translationName: "Translation A",
            mapping: formatterMapping,
            blocks: [
              {
                reference: {
                  book: 43,
                  chapterStart: 3,
                  verseStart: 16,
                  chapterEnd: 3,
                  verseEnd: 16,
                },
                parts: [
                  {
                    range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 },
                    bibleText: {
                      translationId: "a",
                      book: 43,
                      bookName: "Иоанна",
                      chapter: 3,
                      verses: [
                        {
                          number: 16,
                          text: "Text A",
                          footnotes: ["Footnote A"],
                          paragraphStart: true,
                        },
                      ],
                    },
                  },
                ],
                sourceText: "Ин 3:16",
              },
            ],
          },
          {
            translationName: "Translation B",
            mapping: turkishFormatterMapping,
            blocks: [
              {
                reference: {
                  book: 43,
                  chapterStart: 3,
                  verseStart: 16,
                  chapterEnd: 3,
                  verseEnd: 16,
                },
                parts: [
                  {
                    range: { book: 43, chapter: 3, verseStart: 16, verseEnd: 16 },
                    bibleText: {
                      translationId: "b",
                      book: 43,
                      bookName: "Иоанна",
                      chapter: 3,
                      verses: [
                        {
                          number: 16,
                          text: "Text B",
                          footnotes: [],
                          paragraphStart: true,
                        },
                      ],
                    },
                  },
                ],
                sourceText: "Ин 3:16",
              },
            ],
          },
        ],
      },
    ]
  );
  assert(comparisonContent.plainText.includes("📖 Ин 3:16."));
  assert(comparisonContent.plainText.includes("[Translation A]\n📖 Ин 3:16.\n16 Text A"));
  assert(comparisonContent.plainText.includes("^Ин 3:16 Footnote A"));
  assert(comparisonContent.plainText.includes("[Translation B]\n📖 Yhn 3:16.\n16 Text B"));
};
