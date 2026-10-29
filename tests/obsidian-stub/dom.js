// A jsdom window as the global DOM, plus the DOM helpers Obsidian adds to elements and to the window.
const { JSDOM } = require("jsdom");

function installDom() {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true });
  const win = dom.window;

  for (const key of [
    "window", "document", "navigator", "Node", "Element", "HTMLElement", "HTMLDivElement", "HTMLButtonElement",
    "HTMLInputElement", "HTMLSelectElement", "HTMLAnchorElement", "HTMLSpanElement", "Text", "DocumentFragment",
    "Event", "KeyboardEvent", "MouseEvent", "PointerEvent", "FocusEvent", "CustomEvent", "EventTarget",
    "MutationObserver", "NodeFilter", "TreeWalker", "Window", "Document", "Range", "Selection", "DOMParser", "XMLSerializer", "getComputedStyle",
    "requestAnimationFrame", "cancelAnimationFrame",
  ]) {
    if (win[key] === undefined) continue;
    Object.defineProperty(globalThis, key, {
      value: typeof win[key] === "function" && /^[a-z]/.test(key) ? win[key].bind(win) : win[key],
      configurable: true,
      writable: true,
    });
  }
  // jsdom has no visual viewport; the plugin falls back to the window size.
  if (win.visualViewport === undefined) win.visualViewport = null;
  // jsdom does no layout: ranges have no boxes (CodeMirror measures them).
  win.Range.prototype.getClientRects = function () { return []; };
  win.Range.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; };
  // jsdom has no PointerEvent.
  if (win.PointerEvent === undefined) globalThis.PointerEvent = win.MouseEvent;

  const apply = (el, options) => {
    if (options === undefined || options === null) return el;
    if (typeof options === "string") {
      el.className = options;
      return el;
    }
    if (options.cls !== undefined) el.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    if (options.text !== undefined) {
      if (typeof options.text === "string") el.textContent = options.text;
      else el.appendChild(options.text);
    }
    if (options.attr !== undefined) {
      for (const [name, value] of Object.entries(options.attr)) {
        if (value !== null && value !== undefined && value !== false) el.setAttribute(name, String(value));
      }
    }
    if (options.title !== undefined) el.title = options.title;
    if (options.type !== undefined) el.setAttribute("type", options.type);
    if (options.value !== undefined) el.value = options.value;
    if (options.href !== undefined) el.setAttribute("href", options.href);
    if (options.placeholder !== undefined) el.setAttribute("placeholder", options.placeholder);
    return el;
  };
  const make = (doc, tag, options, callback) => {
    const el = apply(doc.createElement(tag), options);
    callback?.(el);
    return el;
  };

  const NodeProto = win.Node.prototype;
  NodeProto.createEl = function (tag, options, callback) {
    const el = make(this.ownerDocument ?? this, tag, options, callback);
    this.appendChild(el);
    return el;
  };
  NodeProto.createDiv = function (options, callback) { return this.createEl("div", options, callback); };
  NodeProto.createSpan = function (options, callback) { return this.createEl("span", options, callback); };
  NodeProto.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
  NodeProto.detach = function () { this.parentNode?.removeChild(this); };
  NodeProto.appendText = function (text) { this.appendChild((this.ownerDocument ?? this).createTextNode(text)); };
  NodeProto.instanceOf = function (type) { return this instanceof type; };
  Object.defineProperty(NodeProto, "doc", { get() { return this.ownerDocument ?? this; }, configurable: true });
  Object.defineProperty(NodeProto, "win", { get() { return (this.ownerDocument ?? this).defaultView; }, configurable: true });

  const ElementProto = win.Element.prototype;
  ElementProto.addClass = function (...classes) { this.classList.add(...classes); };
  ElementProto.removeClass = function (...classes) { this.classList.remove(...classes); };
  ElementProto.toggleClass = function (cls, value) { this.classList.toggle(cls, value); };
  ElementProto.hasClass = function (cls) { return this.classList.contains(cls); };
  ElementProto.setText = function (text) { this.textContent = text; };
  ElementProto.getText = function () { return this.textContent ?? ""; };
  ElementProto.setAttr = function (name, value) { this.setAttribute(name, String(value)); };
  ElementProto.setAttrs = function (attrs) { for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, String(value)); };
  ElementProto.find = function (selector) { return this.querySelector(selector); };
  ElementProto.findAll = function (selector) { return Array.from(this.querySelectorAll(selector)); };

  const HTMLElementProto = win.HTMLElement.prototype;
  HTMLElementProto.setCssStyles = function (styles) { Object.assign(this.style, styles); };
  HTMLElementProto.setCssProps = function (props) { for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value); };
  HTMLElementProto.show = function () { this.style.display = ""; };
  HTMLElementProto.hide = function () { this.style.display = "none"; };
  HTMLElementProto.toggle = function (show) { this.style.display = show ? "" : "none"; };
  HTMLElementProto.isShown = function () { return this.style.display !== "none"; };

  const doc = win.document;
  globalThis.createEl = (tag, options, callback) => make(doc, tag, options, callback);
  globalThis.createDiv = (options, callback) => make(doc, "div", options, callback);
  globalThis.createSpan = (options, callback) => make(doc, "span", options, callback);
  globalThis.createFragment = (callback) => {
    const fragment = doc.createDocumentFragment();
    callback?.(fragment);
    return fragment;
  };
  globalThis.activeDocument = doc;
  globalThis.activeWindow = win;
  for (const name of ["createEl", "createDiv", "createSpan", "createFragment", "activeDocument", "activeWindow"]) {
    win[name] = globalThis[name];
  }
  return win;
}

module.exports = { installDom };
