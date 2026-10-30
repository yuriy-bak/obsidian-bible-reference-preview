// Runs the unit test files one by one; each exports an async function.
const TEST_FILES = [
  "colors",
  "settings",
  "parser",
  "bible-text",
  "preview-format",
  "preview-analyzer",
  "reference-usage",
  "epub-import",
  "workspace",
  "versification",
  "ebible-import",
  "translation-codes",
  "dbs-import",
  "dbs-aleph-import",
];

(async () => {
  for (const name of TEST_FILES) {
    await require(`./unit/${name}.test.js`)();
  }
  console.log("All parser/importer tests passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
