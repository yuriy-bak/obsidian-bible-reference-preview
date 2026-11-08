// A minimal Obsidian Editor over a string: lines, cursor, replaceRange.
function createFakeEditor(text, cursor = { line: 0, ch: 0 }) {
  let value = text;
  let position = { ...cursor };
  const lines = () => value.split("\n");
  const offset = ({ line, ch }) => lines().slice(0, line).reduce((sum, current) => sum + current.length + 1, 0) + ch;
  return {
    getValue: () => value,
    getCursor: () => ({ ...position }),
    setCursor: (next) => { position = { ...next }; },
    getLine: (line) => lines()[line],
    lineCount: () => lines().length,
    replaceRange: (replacement, from, to = from) => {
      value = value.slice(0, offset(from)) + replacement + value.slice(offset(to));
    },
  };
}

module.exports = { createFakeEditor };
