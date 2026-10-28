// Imports one EPUB with a compiled test build and writes the result as JSON files.
// Usage: node scripts/golden-import-dump.mjs <test-build-dir> <epub-path> <out-dir>
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { JSDOM } from "jsdom";

const [buildDirectoryArgument, epubPath, outDirectoryArgument] = process.argv.slice(2);
if (buildDirectoryArgument === undefined || epubPath === undefined || outDirectoryArgument === undefined) {
  console.error("Usage: node scripts/golden-import-dump.mjs <test-build-dir> <epub-path> <out-dir>");
  process.exit(2);
}

const buildDirectory = resolve(buildDirectoryArgument);
const outDirectory = resolve(outDirectoryArgument);
const require = createRequire(import.meta.url);

globalThis.window = globalThis;
globalThis.DOMParser = new JSDOM("").window.DOMParser;

const importer = createImporter();
const content = await readFile(epubPath);
const input = {
  fileName: basename(epubPath),
  content: content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
  translationId: "golden",
  translationName: "",
  language: "",
};
const result = await importer(input);

for (const translation of Object.values(result.bibleIndexV2Data.translations)) {
  delete translation.importedAt;
}
const report = { ...result.report };
delete report.createdAt;

await rm(outDirectory, { recursive: true, force: true });
await mkdir(join(outDirectory, "books"), { recursive: true });
await writeFile(join(outDirectory, "bibles-index.json"), JSON.stringify(result.bibleIndexV2Data, null, 1));
await writeFile(join(outDirectory, "report.json"), JSON.stringify(report, null, 1));
await writeFile(join(outDirectory, "books-table.json"), JSON.stringify(result.books, null, 1));
for (const [path, book] of Object.entries(result.compactBooks)) {
  await writeFile(join(outDirectory, "books", basename(path)), JSON.stringify(book, null, 1));
}
console.log(`${basename(epubPath)}: ${report.books} books, ${report.chapters} chapters, ${report.verses} verses, ${report.footnotes} footnotes, ${report.warnings.length} warnings`);

function createImporter() {
  const sourcePath = join(buildDirectory, "src/infrastructure/sources/jw-epub/JwEpubBibleSource.js");
  if (existsSync(sourcePath)) {
    const { JwEpubBibleSource } = require(sourcePath);
    const source = new JwEpubBibleSource();
    return (importInput) => source.importBible(importInput);
  }

  const { JsZipEpubBibleImporter } = require(join(buildDirectory, "src/infrastructure/epub/JsZipEpubBibleImporter.js"));
  const legacyImporter = new JsZipEpubBibleImporter();
  return (importInput) => legacyImporter.importEpub(importInput);
}
