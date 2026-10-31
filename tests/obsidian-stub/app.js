// A fake Obsidian App: a vault in memory and a workspace with leaves the tests add.
const { Events, MarkdownView, TFile, WorkspaceLeaf } = require("./obsidian.js");

class MemoryAdapter {
  constructor() {
    this.files = new Map();
    this.folders = new Set([""]);
  }

  async exists(path) {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path) {
    if (!this.files.has(path)) throw new Error(`ENOENT: ${path}`);
    return this.files.get(path);
  }

  async write(path, data) {
    const parent = path.split("/").slice(0, -1).join("/");
    if (!this.folders.has(parent)) throw new Error(`ENOENT: no folder for ${path}`);
    this.files.set(path, data);
  }

  async mkdir(path) {
    const parts = path.split("/");
    for (let index = 1; index <= parts.length; index += 1) this.folders.add(parts.slice(0, index).join("/"));
  }

  async rmdir(path, recursive) {
    const prefix = `${path}/`;
    const nested = [...this.files.keys(), ...this.folders].filter((candidate) => candidate.startsWith(prefix));
    if (nested.length > 0 && !recursive) throw new Error(`ENOTEMPTY: ${path}`);
    for (const file of [...this.files.keys()]) if (file.startsWith(prefix)) this.files.delete(file);
    for (const folder of [...this.folders]) if (folder === path || folder.startsWith(prefix)) this.folders.delete(folder);
  }
}

class Vault extends Events {
  constructor() {
    super();
    this.configDir = ".obsidian";
    this.adapter = new MemoryAdapter();
    this.markdown = new Map();
  }

  getMarkdownFiles() {
    return [...this.markdown.values()].map((entry) => entry.file);
  }

  getAbstractFileByPath(path) {
    return this.markdown.get(path)?.file ?? null;
  }

  async cachedRead(file) {
    return this.markdown.get(file.path)?.content ?? "";
  }

  async read(file) {
    return this.cachedRead(file);
  }

  /** Test helper: creates or changes a note and fires the vault event. */
  setMarkdown(path, content) {
    const existing = this.markdown.get(path);
    const file = existing?.file ?? new TFile(path);
    file.stat = { ...file.stat, mtime: (file.stat.mtime ?? 0) + 1, size: content.length };
    this.markdown.set(path, { file, content });
    this.trigger(existing === undefined ? "create" : "modify", file);
    return file;
  }
}

class Workspace extends Events {
  constructor(app) {
    super();
    this.app = app;
    this.layoutReady = false;
    this.leaves = [];
    this.activeLeaf = null;
    this.viewCreators = new Map();
    this._layoutReadyCallbacks = [];
  }

  onLayoutReady(callback) {
    if (this.layoutReady) callback();
    else this._layoutReadyCallbacks.push(callback);
  }

  /** Test helper: what Obsidian does once the workspace is restored. */
  setLayoutReady() {
    this.layoutReady = true;
    for (const callback of this._layoutReadyCallbacks.splice(0)) callback();
  }

  getLeavesOfType(type) {
    return this.leaves.filter((leaf) => leaf.view?.getViewType?.() === type);
  }

  iterateAllLeaves(callback) {
    for (const leaf of this.leaves) callback(leaf);
  }

  getActiveViewOfType(type) {
    const view = this.activeLeaf?.view;
    return view instanceof type ? view : null;
  }

  getLeaf() {
    return this._addLeaf();
  }

  getRightLeaf() {
    return this._addLeaf();
  }

  getLeftLeaf() {
    return this._addLeaf();
  }

  async revealLeaf() {}

  // The stub has one root split: the last note opened.
  getMostRecentLeaf() {
    return [...this.leaves].reverse().find((leaf) => leaf.view?.getViewType?.() === "markdown") ?? null;
  }

  setActiveLeaf(leaf) {
    this.activeLeaf = leaf;
    this.trigger("active-leaf-change", leaf);
  }

  removeLeaf(leaf) {
    this.leaves = this.leaves.filter((candidate) => candidate !== leaf);
  }

  /** Test helper: opens a note in a markdown view, in "source" (editor) or "preview" (reading) mode. */
  openMarkdownView(path, mode) {
    const leaf = new WorkspaceLeaf(this.app);
    leaf.view = new MarkdownView(leaf, { mode, file: this.app.vault.getAbstractFileByPath(path) });
    this.leaves.push(leaf);
    return leaf.view;
  }

  _addLeaf() {
    const leaf = new WorkspaceLeaf(this.app);
    this.leaves.push(leaf);
    return leaf;
  }
}

function createTestApp() {
  const app = {};
  app.vault = new Vault();
  app.workspace = new Workspace(app);
  app.metadataCache = new Events();
  return app;
}

module.exports = { createTestApp };
