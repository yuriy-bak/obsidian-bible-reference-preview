// Realistic alias set (66 books, Russian and English names) and a long mixed text for the parser benchmark.
const BOOKS = [
  [1, "Бытие", "Быт", "Genesis", "Ge"], [2, "Исход", "Исх", "Exodus", "Ex"], [3, "Левит", "Лев", "Leviticus", "Le"],
  [4, "Числа", "Чис", "Numbers", "Nu"], [5, "Второзаконие", "Вт", "Deuteronomy", "De"], [6, "Иисус Навин", "Нав", "Joshua", "Jos"],
  [7, "Судьи", "Суд", "Judges", "Jg"], [8, "Руфь", "Руф", "Ruth", "Ru"], [9, "1 Самуила", "1Сам", "1 Samuel", "1Sa"],
  [10, "2 Самуила", "2Сам", "2 Samuel", "2Sa"], [11, "1 Царей", "1Цар", "1 Kings", "1Ki"], [12, "2 Царей", "2Цар", "2 Kings", "2Ki"],
  [13, "1 Летопись", "1Лт", "1 Chronicles", "1Ch"], [14, "2 Летопись", "2Лт", "2 Chronicles", "2Ch"], [15, "Ездра", "Езд", "Ezra", "Ezr"],
  [16, "Неемия", "Не", "Nehemiah", "Ne"], [17, "Эсфирь", "Эсф", "Esther", "Es"], [18, "Иов", "Иов", "Job", "Job"],
  [19, "Псалмы", "Пс", "Psalms", "Ps"], [20, "Притчи", "Прит", "Proverbs", "Pr"], [21, "Экклезиаст", "Эк", "Ecclesiastes", "Ec"],
  [22, "Песнь песней", "Пес", "Song of Solomon", "Ca"], [23, "Исаия", "Иса", "Isaiah", "Isa"], [24, "Иеремия", "Иер", "Jeremiah", "Jer"],
  [25, "Плач Иеремии", "Плч", "Lamentations", "La"], [26, "Иезекииль", "Иез", "Ezekiel", "Eze"], [27, "Даниил", "Дан", "Daniel", "Da"],
  [28, "Осия", "Ос", "Hosea", "Ho"], [29, "Иоиль", "Иоил", "Joel", "Joe"], [30, "Амос", "Ам", "Amos", "Am"],
  [31, "Авдий", "Авд", "Obadiah", "Ob", 1], [32, "Иона", "Ион", "Jonah", "Jon"], [33, "Михей", "Мих", "Micah", "Mic"],
  [34, "Наум", "Нау", "Nahum", "Na"], [35, "Аввакум", "Авв", "Habakkuk", "Hab"], [36, "Софония", "Соф", "Zephaniah", "Zep"],
  [37, "Аггей", "Агг", "Haggai", "Hag"], [38, "Захария", "Зах", "Zechariah", "Zec"], [39, "Малахия", "Мал", "Malachi", "Mal"],
  [40, "Матфея", "Мф", "Matthew", "Mt"], [41, "Марка", "Мк", "Mark", "Mr"], [42, "Луки", "Лк", "Luke", "Lu"],
  [43, "Иоанна", "Ин", "John", "Joh"], [44, "Деяния", "Деян", "Acts", "Ac"], [45, "Римлянам", "Рим", "Romans", "Ro"],
  [46, "1 Коринфянам", "1Кор", "1 Corinthians", "1Co"], [47, "2 Коринфянам", "2Кор", "2 Corinthians", "2Co"],
  [48, "Галатам", "Гал", "Galatians", "Ga"], [49, "Эфесянам", "Эф", "Ephesians", "Eph"], [50, "Филиппийцам", "Флп", "Philippians", "Php"],
  [51, "Колоссянам", "Кол", "Colossians", "Col"], [52, "1 Фессалоникийцам", "1Фс", "1 Thessalonians", "1Th"],
  [53, "2 Фессалоникийцам", "2Фс", "2 Thessalonians", "2Th"], [54, "1 Тимофею", "1Тим", "1 Timothy", "1Ti"],
  [55, "2 Тимофею", "2Тим", "2 Timothy", "2Ti"], [56, "Титу", "Тит", "Titus", "Tit"], [57, "Филимону", "Флм", "Philemon", "Phm", 1],
  [58, "Евреям", "Евр", "Hebrews", "Heb"], [59, "Иакова", "Иак", "James", "Jas"], [60, "1 Петра", "1Пт", "1 Peter", "1Pe"],
  [61, "2 Петра", "2Пт", "2 Peter", "2Pe"], [62, "1 Иоанна", "1Ин", "1 John", "1Jo"], [63, "2 Иоанна", "2Ин", "2 John", "2Jo", 1],
  [64, "3 Иоанна", "3Ин", "3 John", "3Jo", 1], [65, "Иуды", "Иуд", "Jude", "Jude", 1], [66, "Откровение", "Отк", "Revelation", "Re"],
];

const BENCHMARK_BOOKS = BOOKS.map(([id, name, abbreviation, englishName, englishAbbreviation, chapterCount]) => ({
  id,
  name,
  abbreviation,
  aliases: [englishName, englishAbbreviation],
  chapterCount: chapterCount ?? 50,
}));

const PARAGRAPH = "Сегодня мы разбирали, что говорится в Ин 3:16 и Рим 5:12, 18—21. "
  + "Как отмечено в «Бытие 1:1» и Пс 83:18, Бог — Творец; см. также Отк 21:3, 4 и Иуд 6. "
  + "In English notes: John 17:3; Matthew 24:14 and 1 Corinthians 13:4-7, see also Jude 1:5. "
  + "Обычный текст без ссылок: собрание, служение, ободрение, вопросы и ответы, 2024 год, 15 минут.\n";

function createBenchmarkText(length) {
  let text = "";
  while (text.length < length) {
    text += PARAGRAPH;
  }
  return text.slice(0, length);
}

// Matches per paragraph: Ин 3:16, Рим 5:12,18-21, Бытие 1:1, Пс 83:18, Отк 21:3,4, Иуд 6, John 17:3, Matthew 24:14, 1 Corinthians 13:4-7, Jude 1:5.
const MATCHES_PER_PARAGRAPH = 10;

module.exports = { BENCHMARK_BOOKS, PARAGRAPH, MATCHES_PER_PARAGRAPH, createBenchmarkText };
