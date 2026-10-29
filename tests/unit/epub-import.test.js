const {
  assert,
  readAndValidateEpubFile,
  EPUB_IMPORT_LIMITS,
  normalizeZipPath,
  readContainerOpfPath,
  readZipText,
  resolveZipPath,
  validateZipArchive,
  getSpineXhtmlItems,
  parseOpfDocument,
  EpubImportError,
  DEFAULT_TRANSLATION_ID,
  extractBookTableFromHtml,
  enrichBookTableFromNavigationHtml,
  extractBookNavigationAliasesFromHtml,
  extractVersesFromHtml,
  JSZip,
  vm,
} = require("../helpers");

module.exports = async () => {
  const nonRussianRows = Array.from({ length: 66 }, (_unused, index) => {
    const bookNumber = String(index + 1).padStart(2, "0");
    return `<tr><td><a href="10010611${bookNumber}.xhtml">Kitap ${
      index + 1
    }</a></td><td></td><td>K${index + 1}</td></tr>`;
  }).join("");
  const nonRussianBookTable = extractBookTableFromHtml(
    `<table>${nonRussianRows}</table>`
  );
  assert(
    nonRussianBookTable !== null,
    "Expected non-Russian 66-book table to be accepted"
  );
  assert.strictEqual(nonRussianBookTable.books[0].name, "Kitap 1");

  const oldBibleNavigationHtml = `<p>${Array.from(
    { length: 66 },
    (_unused, index) => {
      const bookId = String(index + 1).padStart(2, "0");
      return `<a href="BIBLE_${bookId}.xhtml">B${bookId}</a>`;
    }
  ).join(" ")}</p>`;
  const oldBibleNavigationTable = extractBookTableFromHtml(
    oldBibleNavigationHtml
  );
  assert(
    oldBibleNavigationTable !== null,
    "Expected old BIBLE_00 navigation without hardcoded book names to be accepted"
  );
  assert.strictEqual(oldBibleNavigationTable.books.length, 66);
  assert.strictEqual(oldBibleNavigationTable.hrefToBookId["BIBLE_01.xhtml"], 1);
  enrichBookTableFromNavigationHtml(
    oldBibleNavigationTable,
    "OEBPS/BIBLE_01.xhtml",
    "<html><head><title>First Book From EPUB (Navigation)</title></head><body><a href='05_BOOK.xhtml#chapter1_verse1'>1</a></body></html>"
  );
  assert.strictEqual(
    oldBibleNavigationTable.books[0].name,
    "First Book From EPUB"
  );
  assert.strictEqual(oldBibleNavigationTable.hrefToBookId["05_BOOK.xhtml"], 1);

  enrichBookTableFromNavigationHtml(
    oldBibleNavigationTable,
    "OEBPS/BIBLE_66.xhtml",
    "<html><head><title>Last Book From EPUB (Navigation)</title></head><body><a href='05_BOOK.xhtml#chapter1_verse1'>1</a></body></html>"
  );
  assert.strictEqual(oldBibleNavigationTable.hrefToBookId["05_BOOK.xhtml"], 1);

  const scriptureReferenceAliases = extractBookNavigationAliasesFromHtml(
    "<p><a href='05_BOOK.xhtml#chapter3_verse34'>Иоанн 3:34-4:1</a></p>",
    oldBibleNavigationTable
  );
  assert.deepStrictEqual(scriptureReferenceAliases, {});

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

  const foreignZipBytes = await new JSZip().file("a.txt", "x").generateAsync({ type: "uint8array" });
  const foreignBuffer = vm.runInNewContext("new ArrayBuffer(length)", { length: foreignZipBytes.byteLength });
  new Uint8Array(foreignBuffer).set(foreignZipBytes);
  assert(!(foreignBuffer instanceof ArrayBuffer));
  const foreignFile = { name: "foreign.epub", size: foreignBuffer.byteLength, arrayBuffer: async () => foreignBuffer };
  const realmContent = await readAndValidateEpubFile(foreignFile, (key) => key);
  assert(realmContent instanceof ArrayBuffer);
  assert((await JSZip.loadAsync(realmContent)).file("a.txt") !== null);

  function assertEpubImportError(action, expectedMessagePart) {
    assert.throws(action, (error) => {
      assert(error instanceof EpubImportError);
      assert(error.message.includes(expectedMessagePart));
      return true;
    });
  }

  async function assertEpubImportErrorAsync(action, expectedMessagePart) {
    await assert.rejects(action, (error) => {
      assert(error instanceof EpubImportError);
      assert(error.message.includes(expectedMessagePart));
      return true;
    });
  }

  assert.strictEqual(normalizeZipPath("OPS/./Text//chapter.xhtml"), "OPS/Text/chapter.xhtml");
  assertEpubImportError(() => normalizeZipPath("../evil.xhtml"), "path traversal");
  assertEpubImportError(() => normalizeZipPath("/evil.xhtml"), "must not be absolute");
  assertEpubImportError(() => normalizeZipPath("C:/evil.xhtml"), "must not be absolute");
  assertEpubImportError(() => normalizeZipPath("OPS\\evil.xhtml"), "backslash");
  assert.strictEqual(
    resolveZipPath("OPS/content.opf", "Text/chapter.xhtml"),
    "OPS/Text/chapter.xhtml"
  );
  assert.strictEqual(
    resolveZipPath("OPS/package/content.opf", "../Text/chapter.xhtml"),
    "OPS/Text/chapter.xhtml"
  );
  assertEpubImportError(() => resolveZipPath("OPS/content.opf", "../../evil.xhtml"), "escapes archive root");
  assertEpubImportError(() => resolveZipPath("OPS/content.opf", "/evil.xhtml"), "must be relative");
  assertEpubImportError(() => resolveZipPath("OPS/content.opf", "OPS\\evil.xhtml"), "backslash");

  const zipEntryLimitFiles = {};
  for (let index = 0; index < EPUB_IMPORT_LIMITS.maxZipEntries + 1; index += 1) {
    zipEntryLimitFiles[`file-${index}.xhtml`] = { name: `file-${index}.xhtml` };
  }
  assertEpubImportError(
    () => validateZipArchive({ files: zipEntryLimitFiles }),
    "too many entries"
  );
  assertEpubImportError(
    () => validateZipArchive({ files: { bad: { name: "OPS\\bad.xhtml" } } }),
    "backslash"
  );

  const validZip = new JSZip();
  validZip.file(
    "META-INF/container.xml",
    "<container><rootfiles><rootfile full-path='OPS/content.opf' /></rootfiles></container>"
  );
  validZip.file("OPS/content.opf", "<package><metadata><dc:title>Test</dc:title></metadata></package>");
  validateZipArchive(validZip);
  assert.strictEqual(await readContainerOpfPath(validZip), "OPS/content.opf");
  assert((await readZipText(validZip, "OPS/content.opf")).includes("package"));

  const missingContainerRootZip = new JSZip();
  missingContainerRootZip.file("META-INF/container.xml", "<container></container>");
  await assertEpubImportErrorAsync(
    () => readContainerOpfPath(missingContainerRootZip),
    "does not contain OPF rootfile path"
  );
  await assertEpubImportErrorAsync(
    () => readZipText(new JSZip(), "OPS/missing.opf"),
    "file not found"
  );
  await assertEpubImportErrorAsync(
    () => readZipText(
      {
        file() {
          return {
            _data: { uncompressedSize: EPUB_IMPORT_LIMITS.maxXmlTextBytes + 1 },
            async() {
              return "";
            },
          };
        },
      },
      "OPS/large.opf"
    ),
    "file is too large"
  );
  await assertEpubImportErrorAsync(
    () => readZipText(
      {
        file() {
          return {
            async() {
              return "a".repeat(EPUB_IMPORT_LIMITS.maxXmlTextBytes + 1);
            },
          };
        },
      },
      "OPS/large-after-decompression.opf"
    ),
    "too large after decompression"
  );

  const parsedOpf = parseOpfDocument(
    "<package><manifest>\u003citem id='nav' href='nav.xhtml' media-type='application/xhtml+xml' /\u003e\u003citem id='style' href='style.css' media-type='text/css' /\u003e</manifest><spine><itemref idref='nav' /><itemref idref='missing' /></spine></package>"
  );
  assert.strictEqual(parsedOpf.manifestItems.length, 2);
  assert.strictEqual(parsedOpf.spineItems.length, 2);
  assert.deepStrictEqual(getSpineXhtmlItems(parsedOpf), [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml" },
  ]);
  assert.deepStrictEqual(parseOpfDocument("<package></package>"), {
    manifestItems: [],
    spineItems: [],
  });

  // XHTML parsed as XML: self-closing markers, namespaces, entities and footnotes behave as in HTML.
  const xhtmlVerses = extractVersesFromHtml(`<?xml version="1.0" encoding="utf-8" ?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Test</title></head><body>
<p><span id="chapter2_verse7"/><strong><sup>7</sup></strong>Первый<span id="footnotesource1"/><a epub:type="noteref" href="#footnote1">*</a>. <span id="chapter2_verse8"/><strong><sup>8</sup></strong>Второй&#x2014;&#160;&amp; «третий».</p>
<p><span id="chapter2_verse9"/><span class="w_ch"><strong>2</strong> </span>Строка 1<br/>Строка 2</p>
<div class="groupFootnote"><aside epub:type="footnote"><div epub:type="footnote" id="footnote1"><p><a href="#footnotesource1">^ <span class="footnoteref">Быт. 2:7</span></a> Сноска &amp; текст.</p></div></aside></div>
</body></html>`);
  assert.deepStrictEqual(xhtmlVerses, [
    { chapter: 2, verse: 7, text: "Первый*.", footnotes: ["Сноска & текст."], paragraphStart: true },
    { chapter: 2, verse: 8, text: "Второй— & «третий».", footnotes: [], paragraphStart: false },
    { chapter: 2, verse: 9, text: "Строка 1\nСтрока 2", footnotes: [], paragraphStart: true },
  ]);

  const {
    JwEpubBibleSource,
  } = require("../../.test-build/src/infrastructure/sources/jw-epub/JwEpubBibleSource.js");
  const {
    selectBibleSource,
    createBibleSources,
  } = require("../../.test-build/src/infrastructure/sources/BibleSourceRegistry.js");
  const {
    isBibleImportAbortError,
  } = require("../../.test-build/src/infrastructure/sources/BibleImportCancellation.js");

  async function createJwLikeEpub(spineHrefs) {
    const zip = new JSZip();
    zip.file("META-INF/container.xml", `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    const manifest = spineHrefs.map((href, index) => `<item id="doc${index}" href="${href}" media-type="application/xhtml+xml"/>`).join("");
    const spine = spineHrefs.map((_href, index) => `<itemref idref="doc${index}"/>`).join("");
    zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test &amp; Bible</dc:title><dc:language>en_US</dc:language></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`);
    const rows = Array.from({ length: 66 }, (_unused, index) =>
      `<tr><td><a href="${index + 1}.xhtml">Book ${index + 1}</a></td><td></td><td>Bk${index + 1}</td></tr>`).join("");
    zip.file("OEBPS/table.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><table>${rows}</table></body></html>`);
    const verseDocument = (text) => `<html xmlns="http://www.w3.org/1999/xhtml"><body><p><span id="chapter1_verse1"/><strong><sup>1</sup></strong>${text}</p></body></html>`;
    zip.file("OEBPS/1.xhtml", verseDocument("From 1."));
    zip.file("OEBPS/1-split2.xhtml", verseDocument("From split."));
    return zip.generateAsync({ type: "arraybuffer" });
  }

  const jwSource = new JwEpubBibleSource();
  const spineFirstOrderEpub = await createJwLikeEpub(["1-split2.xhtml", "1.xhtml"]);
  assert.strictEqual(selectBibleSource(createBibleSources(), "test.epub", spineFirstOrderEpub).id, "jw-epub");
  assert.throws(() => selectBibleSource(createBibleSources(), "test.txt", new TextEncoder().encode("text").buffer), /Unsupported Bible file format/);
  assert.deepStrictEqual(await jwSource.readMetadata(spineFirstOrderEpub), { title: "Test & Bible", language: "en-us" });

  const importJwLikeEpub = (content, options) => jwSource.importBible({
    fileName: "test.epub",
    content,
    translationId: "en-test",
    translationName: "",
    language: "",
  }, options);
  const spineFirstOrderResult = await importJwLikeEpub(spineFirstOrderEpub);
  assert.strictEqual(spineFirstOrderResult.translationName, "Test & Bible");
  assert.strictEqual(spineFirstOrderResult.language, "en-us");
  assert.strictEqual(spineFirstOrderResult.books.length, 66);
  assert.deepStrictEqual(
    spineFirstOrderResult.compactBooks["translations/en-test/books/1.json"].chapters[1][1],
    { text: "From 1.", footnotes: [], paragraphStart: true }
  );
  const spineLastOrderResult = await importJwLikeEpub(await createJwLikeEpub(["1.xhtml", "1-split2.xhtml"]));
  assert.strictEqual(
    spineLastOrderResult.compactBooks["translations/en-test/books/1.json"].chapters[1][1].text,
    "From split."
  );
  assert.strictEqual(spineLastOrderResult.report.verses, 1);
  assert.strictEqual(spineLastOrderResult.bibleIndexV2Data.translations["en-test"].books["1"].chapterCount, 1);

  const abortedImportController = new AbortController();
  abortedImportController.abort();
  await assert.rejects(
    importJwLikeEpub(spineFirstOrderEpub, { signal: abortedImportController.signal }),
    (error) => isBibleImportAbortError(error)
  );

  const {
    sanitizeBibleIndexV2Data,
  } = require("../../.test-build/src/infrastructure/v2/BibleIndexV2Validation.js");
  const {
    ObsidianBibleIndexV2Repository,
  } = require("../../.test-build/src/infrastructure/v2/ObsidianBibleIndexV2Repository.js");
  const validIndexBook = (path) => ({ name: "Book", abbreviation: "Bk", aliases: ["Book"], path });
  const untrustedIndex = {
    version: 2,
    translations: {
      "ru-nwt": {
        name: "NWT",
        language: "ru",
        importedAt: "2026-01-01T00:00:00.000Z",
        books: {
          "1": validIndexBook("translations/ru-nwt/books/1.json"),
          "2": validIndexBook("translations/ru-nwt/books/../../../evil.json"),
          "3": validIndexBook("translations/other/books/3.json"),
          "4": validIndexBook("/etc/passwd"),
          "5": { ...validIndexBook("translations/ru-nwt/books/5.json"), aliases: [1] },
          "x": validIndexBook("translations/ru-nwt/books/x.json"),
        },
      },
      "../..": { name: "Evil", language: "ru", importedAt: "", books: {} },
      "en-nwt": { name: "Broken", language: "en" },
    },
  };
  const indexRepositoryFiles = new Map([["data/bibles-index.json", JSON.stringify(untrustedIndex)]]);
  const indexRepository = new ObsidianBibleIndexV2Repository({
    exists: async (path) => indexRepositoryFiles.has(path),
    read: async (path) => indexRepositoryFiles.get(path),
  }, "data");
  const indexWarnings = [];
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => indexWarnings.push(args.join(" "));
  let sanitizedIndex;
  try {
    sanitizedIndex = sanitizeBibleIndexV2Data(untrustedIndex);
    await indexRepository.load();
  } finally {
    console.warn = originalConsoleWarn;
  }
  assert.deepStrictEqual(Object.keys(sanitizedIndex.translations), ["ru-nwt"]);
  assert.deepStrictEqual(Object.keys(sanitizedIndex.translations["ru-nwt"].books), ["1"]);
  assert.strictEqual(indexWarnings.length, 14);
  assert.deepStrictEqual(indexRepository.getV2Data(), sanitizedIndex);
  assert.strictEqual(await indexRepository.loadBook("ru-nwt", 2), null);
};
