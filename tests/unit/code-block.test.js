const assert = require("assert");
const { parseBibleCodeBlockLines } = require("../../.test-build/src/code-block/BibleCodeBlock.js");

// A ```bible block: one reference per line, empty lines skipped, other text kept in order as unrecognized.
module.exports = async () => {
  const hasReference = (line) => /\d/.test(line);
  assert.deepStrictEqual(parseBibleCodeBlockLines("Ин 3:16\r\n\n  Рим 8:28-30 (WEB)  \nпросто текст\n", hasReference), [
    { type: "reference", text: "Ин 3:16" },
    { type: "reference", text: "Рим 8:28-30 (WEB)" },
    { type: "unrecognized", text: "просто текст" },
  ]);
  assert.deepStrictEqual(parseBibleCodeBlockLines("\n  \n", hasReference), []);
};
