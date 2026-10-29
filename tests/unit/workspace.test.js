const {
  assert,
  ensureLeafViewLoaded,
} = require("../helpers");

module.exports = async () => {
  class FakeUsageView {}
  const createFakeLeaf = (initialView, viewOnLoad) => {
    const calls = [];
    const leaf = {
      view: initialView,
      async loadIfDeferred() {
        calls.push("loadIfDeferred");
        if (viewOnLoad !== undefined) {
          leaf.view = viewOnLoad;
        }
      },
      async setViewState(state) {
        calls.push(`setViewState:${state.type}:${state.active}`);
        leaf.view = new FakeUsageView();
      },
    };
    return { leaf, calls };
  };
  const isFakeUsageView = (view) => view instanceof FakeUsageView;

  const deferredLeaf = createFakeLeaf({ deferred: true }, new FakeUsageView());
  const loadedDeferredView = await ensureLeafViewLoaded({
    leaf: deferredLeaf.leaf,
    viewType: "usage",
    active: true,
    isExpectedView: isFakeUsageView,
  });
  assert.ok(loadedDeferredView instanceof FakeUsageView);
  assert.strictEqual(loadedDeferredView, deferredLeaf.leaf.view);
  assert.deepStrictEqual(deferredLeaf.calls, ["loadIfDeferred"]);

  const placeholderLeaf = createFakeLeaf({ placeholder: true });
  const replacedView = await ensureLeafViewLoaded({
    leaf: placeholderLeaf.leaf,
    viewType: "usage",
    active: false,
    isExpectedView: isFakeUsageView,
  });
  assert.ok(replacedView instanceof FakeUsageView);
  assert.deepStrictEqual(placeholderLeaf.calls, ["loadIfDeferred", "setViewState:usage:false"]);

  const loadedLeaf = createFakeLeaf(new FakeUsageView());
  const existingUsageView = loadedLeaf.leaf.view;
  assert.strictEqual(await ensureLeafViewLoaded({
    leaf: loadedLeaf.leaf,
    viewType: "usage",
    active: true,
    isExpectedView: isFakeUsageView,
  }), existingUsageView);
  assert.deepStrictEqual(loadedLeaf.calls, ["loadIfDeferred"]);
};
