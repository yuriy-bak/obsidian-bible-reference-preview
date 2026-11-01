// Checks that the "What's new" section of both READMEs is about the current version in manifest.json
// and links to the changelog. CI runs it, so a stable release cannot keep the previous release's summary.
// Usage: npm run readme:check
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const READMES = [
    { path: "README.md", heading: "## What's new in " },
    { path: "README.ru.md", heading: "## Что нового в " },
];

let failed = false;
for (const { path, heading } of READMES) {
    const lines = readFileSync(path, "utf8").split("\n");
    const start = lines.findIndex((line) => line.startsWith(heading));
    if (start === -1) {
        console.error(`${path}: no "${heading}${version}" section.`);
        failed = true;
        continue;
    }
    const sectionVersion = lines[start].slice(heading.length).trim();
    if (sectionVersion !== version) {
        console.error(`${path}: "${lines[start]}" names ${sectionVersion}, manifest.json has ${version}. Rewrite the section for ${version}.`);
        failed = true;
    }
    const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
    const section = lines.slice(start, end === -1 ? undefined : end).join("\n");
    if (!section.includes("(CHANGELOG.md)")) {
        console.error(`${path}: the "${heading}${version}" section has no link to CHANGELOG.md.`);
        failed = true;
    }
}
if (failed) process.exit(1);
console.log(`README "What's new" sections match ${version}.`);
