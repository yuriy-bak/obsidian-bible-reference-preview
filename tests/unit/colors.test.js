const {
  assert,
  isCssColor,
  normalizeBibleReferenceLinkColor,
  normalizeFloatingPreviewBackgroundColor,
} = require("../helpers");

module.exports = async () => {
  assert.strictEqual(isCssColor("#7c3aed"), true);
  assert.strictEqual(isCssColor("var(--link-color)"), true);
  assert.strictEqual(
    isCssColor("color-mix(in srgb, var(--background-primary) 92%, black 8%)"),
    true
  );
  assert.strictEqual(isCssColor("url(https://example.com/a.png)"), false);
  assert.strictEqual(isCssColor("javascript:alert(1)"), false);
  assert.strictEqual(isCssColor("#7c3aed; color: red"), false);
  assert.strictEqual(isCssColor("{ color: red }"), false);
  assert.strictEqual(isCssColor("#" + "a".repeat(200)), false);
  assert.strictEqual(
    normalizeBibleReferenceLinkColor("url(https://example.com/a.png)"),
    "var(--link-color)"
  );
  assert.strictEqual(
    normalizeFloatingPreviewBackgroundColor("url(https://example.com/a.png)"),
    "color-mix(in srgb, var(--background-primary) 92%, black 8%)"
  );
};
