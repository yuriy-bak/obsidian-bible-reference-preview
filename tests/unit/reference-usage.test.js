const {
  assert,
  ReferenceUsageIndexService,
  createReferenceUsageExcerpt,
  REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES,
  REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
  createChapterUsageQuery,
  groupReferenceUsagesByChapterVerses,
} = require("../helpers");
const { ReferenceUsageBuildQueue } = require("../../.test-build/src/reference-usage/ReferenceUsageBuildQueue.js");

module.exports = async () => {
  function createReferenceUsageTestFile(path, size, mtime) {
    const extension = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : "";
    return { path, extension, stat: { size, mtime } };
  }

  function createReferenceUsageTestApp(fileContents) {
    const writes = new Map();
    const directories = new Set();
    const readPaths = [];
    return {
      writes,
      directories,
      readPaths,
      vault: {
        async cachedRead(file) {
          readPaths.push(file.path);
          return fileContents[file.path] || "";
        },
        adapter: {
          async exists(path) {
            return writes.has(path) || directories.has(path);
          },
          async read(path) {
            return writes.get(path) || "";
          },
          async write(path, content) {
            writes.set(path, content);
          },
          async mkdir(path) {
            directories.add(path);
          },
        },
      },
    };
  }

  function createReferenceUsageTestParseMatches(text) {
    const definitions = [
      { sourceText: "Ин 3:16", book: 43, chapter: 3, verse: 16 },
      { sourceText: "Ин 3:17", book: 43, chapter: 3, verse: 17 },
      { sourceText: "Рим 8:28", book: 45, chapter: 8, verse: 28 },
    ];
    return definitions.flatMap((definition) => {
      const from = text.indexOf(definition.sourceText);
      if (from < 0) {
        return [];
      }
      return [
        {
          text: definition.sourceText,
          from,
          to: from + definition.sourceText.length,
          references: [
            {
              book: definition.book,
              chapterStart: definition.chapter,
              verseStart: definition.verse,
              chapterEnd: definition.chapter,
              verseEnd: definition.verse,
            },
          ],
        },
      ];
    });
  }

  const referenceUsageFiles = [
    createReferenceUsageTestFile("notes/one.md", 100, 1),
    createReferenceUsageTestFile("notes/large.md", REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1, 2),
    createReferenceUsageTestFile("archive/old.md", 100, 3),
    createReferenceUsageTestFile("data/bible/reference.md", 100, 4),
    createReferenceUsageTestFile("notes/plain.txt", 100, 5),
  ];
  const referenceUsageApp = createReferenceUsageTestApp({
    "notes/one.md": "Intro\nИн 3:16 and Рим 8:28",
    "notes/large.md": "Ин 3:17",
    "archive/old.md": "Ин 3:17",
    "data/bible/reference.md": "Ин 3:17",
    "notes/plain.txt": "Ин 3:17",
  });
  const referenceUsageService = new ReferenceUsageIndexService(
    referenceUsageApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => ["archive"]
  );
  const referenceUsageBuildResult = await referenceUsageService.build(referenceUsageFiles, true);
  assert.strictEqual(referenceUsageBuildResult.fileCount, 1);
  assert.strictEqual(referenceUsageBuildResult.referenceCount, 2);
  assert.strictEqual(referenceUsageBuildResult.updatedFileCount, 1);
  assert.strictEqual(referenceUsageBuildResult.skippedLargeFileCount, 1);
  assert.strictEqual(
    referenceUsageBuildResult.maxFileSizeBytes,
    REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES
  );
  assert.deepStrictEqual(referenceUsageApp.readPaths, ["notes/one.md"]);
  assert(referenceUsageApp.writes.has("data/bible/reference-usage-index.json"));

  const referenceUsageMobileLimitApp = createReferenceUsageTestApp({
    "notes/mobile-small.md": "Ин 3:16",
    "notes/mobile-large.md": "Ин 3:17",
  });
  const referenceUsageMobileLimitService = new ReferenceUsageIndexService(
    referenceUsageMobileLimitApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => [],
    {
      maxMarkdownFileSizeBytes: REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
      buildYieldEveryFiles: 1,
    }
  );
  const referenceUsageMobileLimitResult = await referenceUsageMobileLimitService.build([
    createReferenceUsageTestFile("notes/mobile-small.md", REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES, 7),
    createReferenceUsageTestFile("notes/mobile-large.md", REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1, 8),
  ], true);
  assert.strictEqual(referenceUsageMobileLimitResult.fileCount, 1);
  assert.strictEqual(referenceUsageMobileLimitResult.skippedLargeFileCount, 1);
  assert.strictEqual(
    referenceUsageMobileLimitResult.maxFileSizeBytes,
    REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES
  );
  assert.deepStrictEqual(referenceUsageMobileLimitApp.readPaths, ["notes/mobile-small.md"]);

  const referenceUsageStats = referenceUsageService.getStats();
  assert.strictEqual(referenceUsageStats.fileCount, 1);
  assert.strictEqual(referenceUsageStats.referenceCount, 2);
  assert.strictEqual(referenceUsageStats.indexPath, "data/bible/reference-usage-index.json");

  const referenceUsageResults = referenceUsageService.findUsages([
    { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 },
  ]);
  assert.strictEqual(referenceUsageResults.length, 1);
  assert.strictEqual(referenceUsageResults[0].filePath, "notes/one.md");
  assert.strictEqual(referenceUsageResults[0].sourceText, "Ин 3:16");
  assert.strictEqual(referenceUsageResults[0].line, 2);
  assert.strictEqual(referenceUsageResults[0].excerpt, "Intro Ин 3:16 and Рим 8:28");

  // Text before a reference at the start of its line comes from the line above.
  function excerptAt(text, sourceText) {
    const lines = text.split("\n");
    const lineIndex = lines.findIndex((line) => line.includes(sourceText));
    const from = lines[lineIndex].indexOf(sourceText);
    return createReferenceUsageExcerpt(lines, lineIndex, from, from + sourceText.length);
  }
  assert.strictEqual(excerptAt("About Happy:\nMat5:3-12", "Mat5:3-12"), "About Happy: Mat5:3-12");
  assert.strictEqual(excerptAt("About Happy:\n\nMat5:3-12 text", "Mat5:3-12"), "About Happy: Mat5:3-12 text");
  assert.strictEqual(excerptAt("About Happy:\n\n\nMat5:3-12", "Mat5:3-12"), "Mat5:3-12");
  assert.strictEqual(excerptAt("## Beatitudes\n- [ ] Mat5:3", "Mat5:3"), "Beatitudes - [ ] Mat5:3");
  assert.strictEqual(excerptAt("> - About Happy:\n> Mat5:3", "Mat5:3"), "About Happy: > Mat5:3");
  assert.strictEqual(excerptAt("```\nMat5:3", "Mat5:3"), "Mat5:3");
  assert.strictEqual(excerptAt("---\nMat5:3", "Mat5:3"), "Mat5:3");
  assert.strictEqual(
    excerptAt("The first words of the long sermon on the mount:\nMat5:3", "Mat5:3"),
    "…the long sermon on the mount: Mat5:3"
  );
  assert.strictEqual(
    excerptAt("Read this:\nSee also Mat5:3", "Mat5:3"),
    "Read this: See also Mat5:3"
  );
  // Enough text before the reference on its own line: the line above is not used.
  assert.strictEqual(
    excerptAt("Line above\n01234567890123456789012345678 Mat5:3", "Mat5:3"),
    "01234567890123456789012345678 Mat5:3"
  );

  const referenceUsageOpenNoteApp = createReferenceUsageTestApp({});
  const referenceUsageOpenNoteService = new ReferenceUsageIndexService(
    referenceUsageOpenNoteApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => ["archive"]
  );
  const referenceUsageOpenNoteFile = createReferenceUsageTestFile("notes/open.md", 100, 9);
  const referenceUsageJohn316Query = [{ book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 }];
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft"), false);
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft Ин 3:16"), true);
  assert.strictEqual(referenceUsageOpenNoteService.findUsages(referenceUsageJohn316Query).length, 1);
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft Ин 3:16"), false);
  assert.strictEqual(referenceUsageOpenNoteService.syncOpenFileContent(referenceUsageOpenNoteFile, "Draft"), true);
  assert.strictEqual(referenceUsageOpenNoteService.findUsages(referenceUsageJohn316Query).length, 0);
  assert.strictEqual(
    referenceUsageOpenNoteService.syncOpenFileContent(createReferenceUsageTestFile("archive/open.md", 100, 10), "Ин 3:16"),
    false
  );
  assert.deepStrictEqual(referenceUsageOpenNoteApp.readPaths, []);
  referenceUsageOpenNoteService.clearPendingSave();

  const referenceUsageExcerptPrefix = "012345678901234567890123456789abcdef";
  const referenceUsageExcerptSuffix = "0123456789".repeat(16);
  referenceUsageApp.vault.cachedRead = async (file) => {
    referenceUsageApp.readPaths.push(file.path);
    if (file.path === "notes/excerpt.md") {
      return `${referenceUsageExcerptPrefix} Ин 3:16 ${referenceUsageExcerptSuffix}`;
    }
    return "Ин 3:17";
  };
  await referenceUsageService.updateFile(createReferenceUsageTestFile("notes/excerpt.md", 100, 9));
  const referenceUsageExcerptResults = referenceUsageService.findUsages([
    { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: 3, verseEnd: 16 },
  ]);
  const referenceUsageExcerptResult = referenceUsageExcerptResults.find((result) => result.filePath === "notes/excerpt.md");
  assert(referenceUsageExcerptResult !== undefined);
  assert.strictEqual(
    referenceUsageExcerptResult.excerpt,
    `…78901234567890123456789abcdef Ин 3:16 ${referenceUsageExcerptSuffix.slice(0, 139)}…`
  );

  const referenceUsageUpdateFile = createReferenceUsageTestFile("notes/update.md", 100, 6);
  referenceUsageApp.vault.cachedRead = async (file) => {
    referenceUsageApp.readPaths.push(file.path);
    return "Ин 3:17";
  };
  await referenceUsageService.updateFile(referenceUsageUpdateFile);
  assert.strictEqual(referenceUsageService.getStats().fileCount, 3);
  referenceUsageUpdateFile.stat.size = REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES + 1;
  await referenceUsageService.updateFile(referenceUsageUpdateFile);
  assert.strictEqual(referenceUsageService.getStats().fileCount, 2);
  assert.strictEqual(
    referenceUsageService.findUsages([
      { book: 43, chapterStart: 3, verseStart: 17, chapterEnd: 3, verseEnd: 17 },
    ]).length,
    0
  );
  referenceUsageService.clearPendingSave();

  // On unload a scheduled save is written right away, not dropped.
  referenceUsageApp.writes.clear();
  assert.strictEqual(referenceUsageService.removeFile("notes/one.md"), true);
  assert.strictEqual(referenceUsageService.removeFile("notes/one.md"), false);
  referenceUsageService.flushPendingSave();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(referenceUsageApp.writes.get("data/bible/reference-usage-index.json").length > 0);
  await referenceUsageService.clear();
  assert.deepStrictEqual(referenceUsageService.getStats(), {
    fileCount: 0,
    referenceCount: 0,
    updatedAt: referenceUsageService.getStats().updatedAt,
    indexPath: "data/bible/reference-usage-index.json",
    isOutdated: false,
  });

  const chapterUsageResult = (filePath, chapterStart, verseStart, chapterEnd, verseEnd) => ({
    filePath,
    book: 43,
    chapterStart,
    verseStart,
    chapterEnd,
    verseEnd,
  });
  const formatChapterUsageSpan = (span) => span.verseStart === 1 && span.verseEnd === null
    ? "whole"
    : `${span.verseStart}-${span.verseEnd ?? "end"}`;
  assert.deepStrictEqual(createChapterUsageQuery({ book: 43, chapter: 3 }), {
    book: 43,
    chapterStart: 3,
    verseStart: 1,
    chapterEnd: 3,
    verseEnd: Number.MAX_SAFE_INTEGER,
  });
  const chapterUsageGroups = groupReferenceUsagesByChapterVerses([
    chapterUsageResult("a.md", 3, 16, 3, 16),
    chapterUsageResult("b.md", 3, 5, 3, 7),
    chapterUsageResult("c.md", 2, 23, 3, 2),
    chapterUsageResult("d.md", 3, 16, 3, 16),
    chapterUsageResult("e.md", 3, 30, 4, 2),
    chapterUsageResult("f.md", 2, 1, 4, 1),
    chapterUsageResult("g.md", 3, 5, 3, 5),
  ], { book: 43, chapter: 3 }, formatChapterUsageSpan);
  assert.deepStrictEqual(
    chapterUsageGroups.map((group) => [group.title, group.results.map((result) => result.filePath)]),
    [
      ["whole", ["f.md"]],
      ["1-2", ["c.md"]],
      ["5-5", ["g.md"]],
      ["5-7", ["b.md"]],
      ["16-16", ["a.md", "d.md"]],
      ["30-end", ["e.md"]],
    ]
  );

  // Parser signature: after the book names change, an incremental build parses unchanged notes again.
  let currentParserSignature = "ru-names";
  const signatureApp = createReferenceUsageTestApp({
    "notes/a.md": "Ин 3:16",
    "notes/b.md": "Рим 8:28",
  });
  const signatureFiles = [
    createReferenceUsageTestFile("notes/a.md", 10, 1),
    createReferenceUsageTestFile("notes/b.md", 10, 1),
  ];
  const signatureService = new ReferenceUsageIndexService(
    signatureApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => [],
    { getParserSignature: () => currentParserSignature }
  );
  await signatureService.build(signatureFiles, false);
  assert.deepStrictEqual(signatureApp.readPaths, ["notes/a.md", "notes/b.md"]);
  assert.strictEqual(signatureService.isOutdated(), false);
  assert.strictEqual(JSON.parse(signatureApp.writes.get("data/bible/reference-usage-index.json")).parserSignature, "ru-names|excerpt:2");

  signatureApp.readPaths.length = 0;
  const unchangedSignatureResult = await signatureService.build(signatureFiles, false);
  assert.strictEqual(unchangedSignatureResult.updatedFileCount, 0);
  assert.deepStrictEqual(signatureApp.readPaths, []);

  currentParserSignature = "en-names";
  assert.strictEqual(signatureService.isOutdated(), true);
  assert.strictEqual(signatureService.getStats().isOutdated, true);
  const changedSignatureResult = await signatureService.build(signatureFiles, false);
  assert.strictEqual(changedSignatureResult.updatedFileCount, 2);
  assert.deepStrictEqual(signatureApp.readPaths, ["notes/a.md", "notes/b.md"]);
  assert.strictEqual(signatureService.isOutdated(), false);

  // An index saved with the same parser but excerpts in the old format is outdated.
  const oldExcerptIndexApp = createReferenceUsageTestApp({ "notes/a.md": "Ин 3:16" });
  await oldExcerptIndexApp.vault.adapter.write("data/bible/reference-usage-index.json", JSON.stringify({
    version: 1,
    updatedAt: 1,
    parserSignature: "ru-names",
    files: { "notes/a.md": { path: "notes/a.md", mtime: 1, size: 10, references: [] } },
  }));
  const oldExcerptIndexService = new ReferenceUsageIndexService(
    oldExcerptIndexApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => [],
    { getParserSignature: () => "ru-names" }
  );
  await oldExcerptIndexService.load();
  assert.strictEqual(oldExcerptIndexService.isOutdated(), true);

  // An index saved before signatures existed is outdated, an empty one is not.
  const legacyIndexApp = createReferenceUsageTestApp({ "notes/a.md": "Ин 3:16" });
  await legacyIndexApp.vault.adapter.write("data/bible/reference-usage-index.json", JSON.stringify({
    version: 1,
    updatedAt: 1,
    files: { "notes/a.md": { path: "notes/a.md", mtime: 1, size: 10, references: [] } },
  }));
  const legacyIndexService = new ReferenceUsageIndexService(
    legacyIndexApp,
    () => "data/bible",
    createReferenceUsageTestParseMatches,
    () => [],
    { getParserSignature: () => "ru-names" }
  );
  assert.strictEqual(legacyIndexService.isOutdated(), false);
  await legacyIndexService.load();
  assert.strictEqual(legacyIndexService.isOutdated(), true);
  const legacyBuildResult = await legacyIndexService.build([createReferenceUsageTestFile("notes/a.md", 10, 1)], false);
  assert.strictEqual(legacyBuildResult.updatedFileCount, 1);
  assert.strictEqual(legacyBuildResult.referenceCount, 1);

  // Build queue: requests during a build collapse into one extra run, a busy queue refuses tryRun.
  const queue = new ReferenceUsageBuildQueue();
  const runs = [];
  let releaseFirstBuild;
  const firstBuildDone = new Promise((resolve) => { releaseFirstBuild = resolve; });
  const firstRun = queue.tryRun(async () => {
    runs.push("first");
    await firstBuildDone;
  });
  assert.strictEqual(queue.isRunning, true);
  assert.strictEqual(await queue.tryRun(async () => { runs.push("refused"); }), false);
  queue.schedule(async () => { runs.push("pending-1"); });
  queue.schedule(async () => { runs.push("pending-2"); });
  releaseFirstBuild();
  assert.strictEqual(await firstRun, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(runs, ["first", "pending-2"]);
  assert.strictEqual(queue.isRunning, false);
  queue.schedule(async () => { runs.push("idle"); });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(runs, ["first", "pending-2", "idle"]);
};
