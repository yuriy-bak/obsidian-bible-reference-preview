import { InMemoryBibleIndex, BibleIndexData } from "./InMemoryBibleIndex";

export const mockBibleIndexData: BibleIndexData = {
    translations: {
        newworld: {
            name: "New World mock translation",
            books: {
                "19": {
                    name: "Пс",
                    chapters: {
                        "22": {
                            "1": {
                                text: "Текст Пс 22:1",
                                footnotes: ["Текст сноски Пс 22:1"],
                            },
                        },
                    },
                },
                "43": {
                    name: "Ин",
                    chapters: {
                        "3": {
                            "16": {
                                text: "Текст Ин 3:16",
                                footnotes: ["Текст сноски Ин 3:16"],
                            },
                            "18": {
                                text: "Текст Ин 3:18",
                                footnotes: ["Текст сноски Ин 3:18"],
                            },
                        },
                        "4": {
                            "1": {
                                text: "Текст Ин 4:1",
                                footnotes: [],
                            },
                            "2": {
                                text: "Текст Ин 4:2",
                                footnotes: [],
                            },
                            "3": {
                                text: "Текст Ин 4:3",
                                footnotes: [],
                            },
                            "4": {
                                text: "Текст Ин 4:4",
                                footnotes: [],
                            },
                            "5": {
                                text: "Текст Ин 4:5",
                                footnotes: ["Текст сноски Ин 4:5"],
                            },
                        },
                    },
                },
                "45": {
                    name: "Рим",
                    chapters: {
                        "8": {
                            "28": {
                                text: "Текст Рим 8:28",
                                footnotes: ["Текст сноски Рим 8:28"],
                            },
                        },
                    },
                },
                "46": {
                    name: "1Кор",
                    chapters: {
                        "13": {
                            "4": {
                                text: "Текст 1Кор 13:4",
                                footnotes: [],
                            },
                        },
                    },
                },
                "65": {
                    name: "Иуд",
                    chapters: {
                        "1": {
                            "5": {
                                text: "Текст Иуд 5",
                                footnotes: ["Текст сноски Иуд 5"],
                            },
                            "6": {
                                text: "Текст Иуд 6",
                                footnotes: [],
                            },
                            "7": {
                                text: "Текст Иуд 7",
                                footnotes: [],
                            },
                            "10": {
                                text: "Текст Иуд 10",
                                footnotes: ["Текст сноски Иуд 10"],
                            },
                        },
                    },
                },
            },
        },
    },
};

export function createMockBibleIndex(): InMemoryBibleIndex {
    return new InMemoryBibleIndex(mockBibleIndexData);
}
