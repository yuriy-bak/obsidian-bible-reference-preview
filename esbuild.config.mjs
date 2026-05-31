import esbuild from "esbuild";
import { writeFile } from "node:fs/promises";

const isProduction = process.argv.includes("--production");
const shouldWriteMetafile = process.argv.includes("--metafile");

const result = await esbuild.build({
    entryPoints: ["main.ts"],
    bundle: true,
    outfile: "main.js",
    format: "cjs",
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
});

if (shouldWriteMetafile && result.metafile !== undefined) {
    await writeFile("meta.json", JSON.stringify(result.metafile, null, 2));
}
