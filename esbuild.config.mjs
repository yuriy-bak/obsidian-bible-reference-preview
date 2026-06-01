import esbuild from "esbuild";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const isProduction = process.argv.includes("--production");
const shouldWriteMetafile = process.argv.includes("--metafile");

const legacyBrowserPolyfillShimPlugin = {
    name: "legacy-browser-polyfill-shim",
    setup(build) {
        build.onResolve({ filter: /^jszip$/ }, () => ({
            path: resolve("node_modules/jszip/lib/index.js"),
        }));
        build.onResolve({ filter: /^lie$/ }, () => ({
            path: "native-promise-shim",
            namespace: "legacy-browser-polyfill-shim",
        }));
        build.onResolve({ filter: /^setimmediate$/ }, () => ({
            path: "safe-set-immediate-shim",
            namespace: "legacy-browser-polyfill-shim",
        }));
        build.onResolve({ filter: /^immediate$/ }, () => ({
            path: "safe-immediate-shim",
            namespace: "legacy-browser-polyfill-shim",
        }));
        build.onResolve({ filter: /^(readable-stream|stream)$/ }, () => ({
            path: "safe-readable-stream-shim",
            namespace: "legacy-browser-polyfill-shim",
        }));

        build.onLoad({ filter: /^native-promise-shim$/, namespace: "legacy-browser-polyfill-shim" }, () => ({
            contents: "module.exports = Promise;",
            loader: "js",
        }));
        build.onLoad({ filter: /^safe-set-immediate-shim$/, namespace: "legacy-browser-polyfill-shim" }, () => ({
            contents: `
const root = typeof globalThis !== "undefined" ? globalThis : global;
if (typeof root.setImmediate !== "function") {
    root.setImmediate = function setImmediateShim(callback, ...args) {
        return root.setTimeout(callback, 0, ...args);
    };
}
if (typeof root.clearImmediate !== "function") {
    root.clearImmediate = function clearImmediateShim(handle) {
        root.clearTimeout(handle);
    };
}
module.exports = root.setImmediate;
`,
            loader: "js",
        }));
        build.onLoad({ filter: /^safe-immediate-shim$/, namespace: "legacy-browser-polyfill-shim" }, () => ({
            contents: `
module.exports = function immediateShim(task) {
    if (typeof queueMicrotask === "function") {
        queueMicrotask(task);
        return;
    }
    Promise.resolve().then(task);
};
`,
            loader: "js",
        }));
        build.onLoad({ filter: /^safe-readable-stream-shim$/, namespace: "legacy-browser-polyfill-shim" }, () => ({
            contents: `
class UnsupportedReadableStream {
    constructor() {
        throw new Error("Node readable streams are not supported in this plugin build.");
    }
}
module.exports = { Readable: UnsupportedReadableStream };
`,
            loader: "js",
        }));
    },
};

const result = await esbuild.build({
    entryPoints: ["main.ts"],
    bundle: true,
    outfile: "main.js",
    format: "cjs",
    mainFields: ["main", "module"],
    target: "es2018",
    charset: "utf8",
    sourcemap: isProduction ? false : "inline",
    minify: isProduction,
    treeShaking: true,
    metafile: shouldWriteMetafile,
    logLevel: "info",
    loader: {
        ".css": "text",
    },
    external: [
        "obsidian",
        "electron",
        "@codemirror/state",
        "@codemirror/view",
    ],
    plugins: [legacyBrowserPolyfillShimPlugin],
});

if (shouldWriteMetafile && result.metafile !== undefined) {
    await writeFile("meta.json", JSON.stringify(result.metafile, null, 2));
}
