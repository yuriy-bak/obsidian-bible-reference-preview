import esbuild from "esbuild";

const isProduction = process.argv.includes("--production");

await esbuild.build({
    entryPoints: ["main.ts"],
    bundle: true,
    outfile: "main.js",
    format: "cjs",
    target: "es2018",
    sourcemap: isProduction ? false : "inline",
    treeShaking: true,
    logLevel: "info",
    external: [
        "obsidian",
        "electron",
        "@codemirror/state",
        "@codemirror/view",
    ],
});