// Sets a new stable version everywhere it is stored: manifest.json, package.json, package-lock.json,
// versions.json (with the current minAppVersion) and the version list of the bug report form.
// Usage: npm run release:bump -- 0.3.0
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    console.error("Usage: npm run release:bump -- <major.minor.patch>, for example 0.3.0");
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

if (!readFileSync("CHANGELOG.md", "utf8").includes(`## ${version} - `)) {
    console.log(`Now add a "## ${version} - <title>" section to the top of CHANGELOG.md.`);
}
console.log(`Version ${version} set (minAppVersion ${manifest.minAppVersion}).`);
