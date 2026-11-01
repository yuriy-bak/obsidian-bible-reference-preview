// Sets a new stable version everywhere it is stored: manifest.json, package.json, package-lock.json,
// versions.json (with the current minAppVersion) and the version list of the bug report form.
// Turns the "## Unreleased" section of CHANGELOG.md into "## <version> - <title>".
// Usage: npm run release:bump -- 0.3.1 "Getting started hints"
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [version, title] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    console.error('Usage: npm run release:bump -- <major.minor.patch> "<release title>", for example 0.3.1 "Getting started hints"');
    process.exit(1);
}

const UNRELEASED_HEADING = /^## Unreleased[ \t]*$/m;
const changelog = readFileSync("CHANGELOG.md", "utf8");
const hasUnreleased = UNRELEASED_HEADING.test(changelog);
if (hasUnreleased && !title?.trim()) {
    console.error('CHANGELOG.md has an "## Unreleased" section: give the release title, for example npm run release:bump -- 0.3.1 "Getting started hints"');
    process.exit(1);
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const manifest = readJson("manifest.json");
manifest.version = version;
writeJson("manifest.json", manifest);

const packageJson = readJson("package.json");
packageJson.version = version;
writeJson("package.json", packageJson);

const packageLock = readJson("package-lock.json");
packageLock.version = version;
if (packageLock.packages?.[""]) packageLock.packages[""].version = version;
writeJson("package-lock.json", packageLock);

const versions = readJson("versions.json");
versions[version] = manifest.minAppVersion;
writeJson("versions.json", versions);

execFileSync(process.execPath, ["scripts/sync-issue-form-versions.mjs"], { stdio: "inherit" });

if (hasUnreleased) {
    writeFileSync("CHANGELOG.md", changelog.replace(UNRELEASED_HEADING, `## ${version} - ${title.trim()}`));
    console.log(`CHANGELOG.md: "## Unreleased" is now "## ${version} - ${title.trim()}". Check that it lists every change since the last release.`);
} else if (!changelog.includes(`## ${version} - `)) {
    console.log(`Now add a "## ${version} - <title>" section to the top of CHANGELOG.md.`);
}
console.log(`Version ${version} set (minAppVersion ${manifest.minAppVersion}).`);
console.log(`Now rewrite "What's new in ${version}" in README.md and "Что нового в ${version}" in README.ru.md: CI fails until both name this version (npm run readme:check).`);
