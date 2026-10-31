const {
  assert,
  ReferenceUsageIndexService,
  createReferenceUsageExcerpt,
  findReferenceUsageHeading,
  getReferenceUsageNoteStructure,
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
  assert.strictEqual(referenceUsageResults[0].excerpt, "Ин 3:16 and Рим 8:28");
  assert.strictEqual(referenceUsageResults[0].heading, "");

  // A line ending with a colon that introduces the reference goes before it; the heading is kept apart.
  function position(line) {
    return { start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } };
  }
  function heading(line, text, level = 2) {
    return { heading: text, level, position: position(line) };
  }
  function listItem(line, parent, endLine = line) {
    return { parent, position: { start: position(line).start, end: { line: endLine, col: 0, offset: 0 } } };
  }
  function usageAt(text, sourceText, cache = null) {
    const lines = text.split("\n");
    const lineIndex = lines.findIndex((line) => line.includes(sourceText));
    const from = lines[lineIndex].indexOf(sourceText);
    const structure = getReferenceUsageNoteStructure(cache, lines);
    return {
      excerpt: createReferenceUsageExcerpt(lines, lineIndex, from, from + sourceText.length, structure),
      heading: findReferenceUsageHeading(structure, lineIndex),
    };
  }
  function excerptAt(text, sourceText, cache = null) {
    return usageAt(text, sourceText, cache).excerpt;
  }
  assert.strictEqual(excerptAt("About Happy:\nMat5:3-12", "Mat5:3-12"), "About Happy: Mat5:3-12");
  assert.strictEqual(excerptAt("About Happy:\n\nMat5:3-12 text", "Mat5:3-12"), "About Happy: Mat5:3-12 text");
  assert.strictEqual(excerptAt("About Happy:\n\n\nMat5:3-12", "Mat5:3-12"), "Mat5:3-12");
  assert.strictEqual(excerptAt("Some text\nMat5:3-12", "Mat5:3-12"), "Mat5:3-12");
  assert.strictEqual(excerptAt("Read this:\nSee also Mat5:3", "Mat5:3"), "Read this: See also Mat5:3");
  assert.strictEqual(excerptAt("> About Happy:\n> Mat5:3", "Mat5:3"), "About Happy: > Mat5:3");
  assert.strictEqual(excerptAt("Блаженства：\nMat5:3", "Mat5:3"), "Блаженства： Mat5:3");
  assert.strictEqual(
    excerptAt("These are the first words of the long sermon that Jesus gave on the mount:\nMat5:3", "Mat5:3"),
    "…first words of the long sermon that Jesus gave on the mount: Mat5:3"
  );
  // A heading ending with a colon is shown as the heading, not repeated in the excerpt.
  assert.deepStrictEqual(
    usageAt("## Beatitudes:\nMat5:3", "Mat5:3", { headings: [heading(0, "Beatitudes:")] }),
    { excerpt: "Mat5:3", heading: "Beatitudes:" }
  );
  // The nearest heading above, from Obsidian's cache.
  assert.deepStrictEqual(
    usageAt("# Sermon\n## Beatitudes\nAbout Happy:\n\nMat5:3-12\n## Later", "Mat5:3-12", {
      headings: [heading(0, "Sermon", 1), heading(1, "Beatitudes"), heading(5, "Later")],
    }),
    { excerpt: "About Happy: Mat5:3-12", heading: "Beatitudes" }
  );
  // A list: the line before the list, or a parent item ending with a colon.
  const listText = "## Blessed\nAbout Happy:\n- first item\n- Mat5:3 poor\n- Others:\n  - Mat5:4 mourn\n  - Mat5:5 meek";
  const listCache = {
    headings: [heading(0, "Blessed")],
    listItems: [listItem(2, -2), listItem(3, -2), listItem(4, -2, 6), listItem(5, 4), listItem(6, 4)],
  };
  assert.deepStrictEqual(usageAt(listText, "Mat5:3", listCache), { excerpt: "About Happy: - Mat5:3 poor", heading: "Blessed" });
  assert.deepStrictEqual(usageAt(listText, "Mat5:5", listCache), { excerpt: "Others: - Mat5:5 meek", heading: "Blessed" });
  // A nested item under a parent without a colon falls back to the line before the list.
  const nestedText = "Notes:\n- plain item\n  - Mat5:4";
  assert.strictEqual(
    excerptAt(nestedText, "Mat5:4", { listItems: [listItem(1, -1, 2), listItem(2, 1)] }),
    "Notes: - Mat5:4"
  );
  // Without the cache a list item only looks at the line right above it.
  assert.strictEqual(excerptAt(nestedText, "Mat5:4"), "- Mat5:4");
  // A stale cache (the editor text has unsaved edits) is not used.
  assert.deepStrictEqual(
    usageAt("New line\n## Beatitudes\nMat5:3", "Mat5:3", { headings: [heading(0, "Beatitudes")] }),
    { excerpt: "Mat5:3", heading: "" }
  );
  // Text far from the start of the line: no intro.
  assert.strictEqual(
    excerptAt("About Happy:\n0123456789012345678901234567890 Mat5:3", "Mat5:3"),
    "…23456789012345678901234567890 Mat5:3"
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
  assert.strictEqual(JSON.parse(signatureApp.writes.get("data/bible/reference-usage-index.json")).parserSignature, "ru-names|excerpt:3");

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
