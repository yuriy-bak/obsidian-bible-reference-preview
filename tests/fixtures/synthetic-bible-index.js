// Version 2 index metadata shared by the parser and Bible text tests.
const DEFAULT_TRANSLATION_ID = "newworld";

const syntheticMetadata = {
  version: 2,
  translations: {
    [DEFAULT_TRANSLATION_ID]: {
      name: "synthetic",
      language: "ru",
      sourceFileName: "synthetic.epub",
      importedAt: "2026-01-01T00:00:00.000Z",
      books: {
        1: {
          name: "Бытие",
          abbreviation: "Бт",
          aliases: ["Бытие", "Бт", "Быт"],
          path: "translations/newworld/books/1.json",
        },
        43: {
          name: "Иоанна",
          abbreviation: "Ин",
          aliases: ["Иоанна", "Ин", "Иоан"],
          path: "translations/newworld/books/43.json",
          chapterCount: 21,
        },
        19: {
          name: "Псалмы",
          abbreviation: "Пс",
          aliases: ["Псалмы", "Пс"],
          path: "translations/newworld/books/19.json",
          chapterCount: 150,
        },
        23: {
          name: "Исайя",
          abbreviation: "Иса",
          aliases: ["Исайя", "Иса"],
          path: "translations/newworld/books/23.json",
          chapterCount: 66,
        },
        46: {
          name: "1 Коринфянам",
          abbreviation: "1Кор",
          aliases: ["1 Коринфянам", "1Кор", "1 Кр"],
          path: "translations/newworld/books/46.json",
          chapterCount: 16,
        },
        65: {
          name: "Иуды",
          abbreviation: "Иуд",
          aliases: ["Иуды", "Иуд"],
          path: "translations/newworld/books/65.json",
          chapterCount: 1,
        },
        66: {
          name: "Откровение",
          abbreviation: "Отк",
          aliases: ["Откровение", "Отк"],
          path: "translations/newworld/books/66.json",
          chapterCount: 22,
        },
      },
    },
  },
};

module.exports = { DEFAULT_TRANSLATION_ID, syntheticMetadata };
