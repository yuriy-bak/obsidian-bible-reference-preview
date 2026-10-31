const {
  assert,
  isCssColor,
  normalizeBibleReferenceLinkColor,
  normalizeFloatingPreviewBackgroundColor,
  buildColorDialogPresets,
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
    "var(--color-green)"
  );
  assert.strictEqual(
    normalizeFloatingPreviewBackgroundColor("url(https://example.com/a.png)"),
    "color-mix(in srgb, var(--background-primary) 92%, black 8%)"
  );

  // Palette: default first, presets without duplicates, one "Current" only when it is not a preset.
  const labels = { defaultLabel: "Default", currentLabel: "Current" };
  const presets = [
    { label: "Theme link", value: "var(--link-color)" },
    { label: "Violet", value: "#7c3aed" },
  ];
  const labelsOf = (input) => buildColorDialogPresets(input, labels).map((preset) => preset.label);
  assert.deepStrictEqual(
    labelsOf({ value: "var(--color-green)", defaultValue: "var(--color-green)", presets }),
    ["Default", "Theme link", "Violet"]
  );
  assert.deepStrictEqual(
    labelsOf({ value: "var(--link-color)", defaultValue: "var(--color-green)", presets }),
    ["Default", "Theme link", "Violet"]
  );
  assert.deepStrictEqual(
    labelsOf({ value: "#7C3AED", defaultValue: "var(--color-green)", presets }),
    ["Default", "Theme link", "Violet"]
  );
  assert.deepStrictEqual(
    labelsOf({ value: "#123456", defaultValue: "var(--color-green)", presets }),
    ["Default", "Theme link", "Violet", "Current"]
  );
  assert.deepStrictEqual(
    labelsOf({ value: "#7c3aed", defaultValue: "#7c3aed", presets }),
    ["Default", "Theme link"]
  );
};
