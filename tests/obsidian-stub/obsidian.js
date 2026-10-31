// Runtime stand-in for the `obsidian` module: only what the plugin uses, with records the tests can inspect.
// The DOM must be installed first (dom.js).

const state = {
  language: "en",
  notices: [],
  openModals: [],
};

class Events {
  constructor() {
    this._handlers = new Map();
  }

  on(name, callback, ctx) {
    const ref = { e: this, name, fn: callback, ctx };
    if (!this._handlers.has(name)) this._handlers.set(name, []);
    this._handlers.get(name).push(ref);
    return ref;
  }

  offref(ref) {
    const handlers = this._handlers.get(ref.name);
    if (handlers !== undefined) this._handlers.set(ref.name, handlers.filter((candidate) => candidate !== ref));
  }

  trigger(name, ...args) {
    for (const ref of [...(this._handlers.get(name) ?? [])]) ref.fn.apply(ref.ctx, args);
  }

  listenerCount(name) {
    return (this._handlers.get(name) ?? []).length;
  }
}

class Component {
  constructor() {
    this._cleanups = [];
    this._children = [];
    this._loaded = false;
  }

  load() {
    this._loaded = true;
    this.onload?.();
  }

  onload() {}

  unload() {
    for (const child of this._children.splice(0)) child.unload();
    for (const cleanup of this._cleanups.splice(0).reverse()) cleanup();
    this._loaded = false;
    this.onunload?.();
  }

  onunload() {}

  addChild(child) {
    this._children.push(child);
    if (this._loaded) child.load();
    return child;
  }

  removeChild(child) {
    this._children = this._children.filter((candidate) => candidate !== child);
    child.unload();
    return child;
  }

  register(cleanup) {
    this._cleanups.push(cleanup);
  }

  registerEvent(ref) {
    this.register(() => ref.e.offref(ref));
  }

  registerDomEvent(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.register(() => target.removeEventListener(type, listener, options));
  }

  registerInterval(id) {
    this.register(() => clearInterval(id));
    return id;
  }
}

class Plugin extends Component {
  constructor(app, manifest) {
    super();
    this.app = app;
    this.manifest = manifest;
    this.savedData = null;
    this.commands = [];
    this.views = new Map();
    this.settingTabs = [];
    this.markdownPostProcessors = [];
    this.editorExtensions = [];
    this.ribbonIcons = [];
  }

  async loadData() {
    return this.savedData === null ? null : JSON.parse(JSON.stringify(this.savedData));
  }

  async saveData(data) {
    this.savedData = JSON.parse(JSON.stringify(data));
  }

  addCommand(command) {
    this.commands.push(command);
    return command;
  }

  registerView(type, creator) {
    this.views.set(type, creator);
    this.app.workspace.viewCreators?.set(type, creator);
  }

  addSettingTab(tab) {
    this.settingTabs.push(tab);
  }

  registerMarkdownPostProcessor(processor) {
    this.markdownPostProcessors.push(processor);
    return processor;
  }

  registerEditorExtension(extension) {
    this.editorExtensions.push(extension);
  }

  addRibbonIcon(icon, title, callback) {
    const el = createDiv({ cls: "side-dock-ribbon-action", attr: { "aria-label": title, "data-icon": icon } });
    el.addEventListener("click", callback);
    this.ribbonIcons.push(el);
    return el;
  }
}

class Notice {
  constructor(message, duration) {
    this.duration = duration;
    this.noticeEl = createDiv({ cls: "notice" });
    this.messageEl = this.noticeEl;
    this.hidden = false;
    this.setMessage(message);
    state.notices.push(this);
  }

  setMessage(message) {
    this.noticeEl.empty();
    if (typeof message === "string") this.noticeEl.setText(message);
    else this.noticeEl.appendChild(message);
    this.message = this.noticeEl.textContent ?? "";
    return this;
  }

  hide() {
    this.hidden = true;
  }
}

class Modal {
  constructor(app) {
    this.app = app;
    this.containerEl = createDiv({ cls: "modal-container" });
    this.modalEl = this.containerEl.createDiv({ cls: "modal" });
    this.titleEl = this.modalEl.createDiv({ cls: "modal-title" });
    this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
    this.isOpen = false;
  }

  open() {
    this.isOpen = true;
    state.openModals.push(this);
    this.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    state.openModals = state.openModals.filter((modal) => modal !== this);
    this.onClose();
  }

  setTitle(title) {
    this.titleEl.setText(title);
    return this;
  }

  onOpen() {}

  onClose() {}
}

class ValueComponent {
  constructor(inputEl) {
    this.inputEl = inputEl;
    this._onChange = null;
    inputEl.addEventListener("input", () => this._onChange?.(this.getValue()));
    inputEl.addEventListener("change", () => this._onChange?.(this.getValue()));
  }

  getValue() {
    return this.inputEl.value;
  }

  setValue(value) {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder) {
    this.inputEl.setAttribute("placeholder", placeholder);
    return this;
  }

  setDisabled(disabled) {
    this.inputEl.disabled = disabled;
    return this;
  }

  onChange(callback) {
    this._onChange = callback;
    return this;
  }
}

class ToggleComponent {
  constructor(containerEl) {
    this.toggleEl = containerEl.createEl("input", { type: "checkbox" });
    this._onChange = null;
    this.toggleEl.addEventListener("change", () => this._onChange?.(this.toggleEl.checked));
  }

  getValue() {
    return this.toggleEl.checked;
  }

  setValue(value) {
    this.toggleEl.checked = value;
    return this;
  }

  setDisabled(disabled) {
    this.toggleEl.disabled = disabled;
    return this;
  }

  onChange(callback) {
    this._onChange = callback;
    return this;
  }
}

class DropdownComponent extends ValueComponent {
  constructor(containerEl) {
    super(containerEl.createEl("select", { cls: "dropdown" }));
  }

  get selectEl() {
    return this.inputEl;
  }

  addOption(value, display) {
    this.inputEl.createEl("option", { text: display, value });
    return this;
  }

  addOptions(options) {
    for (const [value, display] of Object.entries(options)) this.addOption(value, display);
    return this;
  }
}

class TextComponent extends ValueComponent {
  constructor(containerEl) {
    super(containerEl.createEl("input", { type: "text" }));
  }
}

class ButtonComponent {
  constructor(containerEl) {
    this.buttonEl = containerEl.createEl("button");
    this._onClick = null;
    this.buttonEl.addEventListener("click", (event) => this._onClick?.(event));
  }

  setButtonText(text) {
    this.buttonEl.setText(text);
    return this;
  }

  setIcon(icon) {
    this.buttonEl.dataset.icon = icon;
    return this;
  }

  setTooltip(tooltip) {
    this.buttonEl.setAttribute("aria-label", tooltip);
    return this;
  }

  setCta() {
    this.buttonEl.addClass("mod-cta");
    return this;
  }

  setWarning() {
    this.buttonEl.addClass("mod-warning");
    return this;
  }

  setDestructive() {
    this.buttonEl.addClass("mod-destructive");
    return this;
  }

  setDisabled(disabled) {
    this.buttonEl.disabled = disabled;
    return this;
  }

  setClass(cls) {
    this.buttonEl.addClass(cls);
    return this;
  }

  onClick(callback) {
    this._onClick = callback;
    return this;
  }
}

class Setting {
  constructor(containerEl) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
    this.nameEl = this.infoEl.createDiv({ cls: "setting-item-name" });
    this.descEl = this.infoEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
    this.components = [];
  }

  setName(name) {
    this.nameEl.empty();
    if (typeof name === "string") this.nameEl.setText(name);
    else this.nameEl.appendChild(name);
    return this;
  }

  setDesc(desc) {
    this.descEl.empty();
    if (typeof desc === "string") this.descEl.setText(desc);
    else this.descEl.appendChild(desc);
    return this;
  }

  setHeading() {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }

  setClass(cls) {
    this.settingEl.addClass(cls);
    return this;
  }

  setDisabled() {
    return this;
  }

  addText(callback) {
    return this._add(new TextComponent(this.controlEl), callback);
  }

  addTextArea(callback) {
    return this._add(new ValueComponent(this.controlEl.createEl("textarea")), callback);
  }

  addDropdown(callback) {
    return this._add(new DropdownComponent(this.controlEl), callback);
  }

  addToggle(callback) {
    return this._add(new ToggleComponent(this.controlEl), callback);
  }

  addButton(callback) {
    return this._add(new ButtonComponent(this.controlEl), callback);
  }

  addExtraButton(callback) {
    return this._add(new ButtonComponent(this.controlEl), callback);
  }

  _add(component, callback) {
    this.components.push(component);
    callback(component);
    return this;
  }
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createDiv({ cls: "vertical-tab-content" });
    this.updateCount = 0;
  }

  // Obsidian rebuilds the declarative settings here; building the definitions keeps them exercised.
  update() {
    this.updateCount += 1;
    this.getSettingDefinitions?.();
  }

  display() {}

  hide() {}
}

class View extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = createDiv({ cls: "workspace-leaf-content" });
    this.containerEl.createDiv({ cls: "view-header" });
    this.contentEl = this.containerEl.createDiv({ cls: "view-content" });
  }

  getViewType() {
    return "";
  }

  getDisplayText() {
    return "";
  }

  getState() {
    return {};
  }

  async setState() {}
}

class MenuItem {
  constructor() {
    this.title = "";
    this.icon = null;
    this.callback = null;
  }

  setTitle(title) {
    this.title = title;
    return this;
  }

  setIcon(icon) {
    this.icon = icon;
    return this;
  }

  onClick(callback) {
    this.callback = callback;
    return this;
  }
}

class Menu extends Component {
  constructor() {
    super();
    this.items = [];
    this.hideCallbacks = [];
    this.shown = false;
  }

  addItem(cb) {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }

  addSeparator() {
    return this;
  }

  showAtMouseEvent() {
    this.shown = true;
    state.lastMenu = this;
    return this;
  }

  showAtPosition() {
    return this.showAtMouseEvent();
  }

  onHide(callback) {
    this.hideCallbacks.push(callback);
  }

  hide() {
    this.shown = false;
    for (const callback of this.hideCallbacks) callback();
    return this;
  }

  close() {
    this.hide();
  }
}

class ItemView extends View {
  onPaneMenu() {}

  addAction(icon, title, callback) {
    const el = this.containerEl.createEl("button", { attr: { "aria-label": title, "data-icon": icon } });
    el.addEventListener("click", callback);
    return el;
  }

  async onOpen() {}

  async onClose() {}
}

class MarkdownView extends View {
  constructor(leaf, { mode = "source", file = null } = {}) {
    super(leaf);
    this.mode = mode;
    this.file = file;
    this.editor = null;
    this.previewMode = {
      rerenderCalls: [],
      rerender: (full) => this.previewMode.rerenderCalls.push(full),
    };
  }

  getViewType() {
    return "markdown";
  }

  getViewData() {
    return this.file === null ? "" : this.app.vault.markdown.get(this.file.path)?.content ?? "";
  }

  getMode() {
    return this.mode;
  }
}

class WorkspaceLeaf {
  constructor(app, view = null) {
    this.app = app;
    this.view = view;
  }

  // Like Obsidian: the same view type keeps its view and only gets the new state.
  async setViewState(viewState) {
    const creator = this.app.workspace.viewCreators?.get(viewState.type);
    if (creator !== undefined && this.view?.getViewType?.() !== viewState.type) {
      this.view = creator(this);
      await this.view.onOpen?.();
    }
    if (viewState.state !== undefined) await this.view?.setState?.(viewState.state, { history: false });
    if (viewState.active === true) this.app.workspace.setActiveLeaf(this);
  }

  getViewState() {
    return { type: this.view?.getViewType?.() ?? "empty" };
  }

  async loadIfDeferred() {}

  detach() {
    this.app.workspace.removeLeaf(this);
  }
}

class TAbstractFile {
  constructor(path) {
    this.path = path;
    this.name = path.split("/").pop();
  }
}

class TFile extends TAbstractFile {
  constructor(path, stat = {}) {
    super(path);
    this.extension = this.name.includes(".") ? this.name.split(".").pop() : "";
    this.basename = this.extension === "" ? this.name : this.name.slice(0, -this.extension.length - 1);
    this.stat = { ctime: 0, mtime: 0, size: 0, ...stat };
  }
}

class TFolder extends TAbstractFile {
  constructor(path) {
    super(path);
    this.children = [];
  }
}

function setIcon(el, icon) {
  el.empty();
  el.dataset.icon = icon;
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

const Platform = {
  isMobile: false,
  isMobileApp: false,
  isDesktop: true,
  isDesktopApp: true,
  isAndroidApp: false,
  isIosApp: false,
};

module.exports = {
  ButtonComponent,
  Component,
  DropdownComponent,
  Events,
  ItemView,
  MarkdownView,
  Menu,
  MenuItem,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  TextComponent,
  ToggleComponent,
  View,
  WorkspaceLeaf,
  getLanguage: () => state.language,
  normalizePath,
  setIcon,
  // Test-only state, not part of the Obsidian API.
  __state: state,
};
