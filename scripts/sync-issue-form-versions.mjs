// Fills the plugin version list of the bug report form from versions.json.
// `--check` only reports whether the form is up to date (used in CI).
import { readFileSync, writeFileSync } from "node:fs";

const FORM_PATH = ".github/ISSUE_TEMPLATE/bug_report.yml";
const LISTED_VERSIONS = 6;
const EXTRA_OPTIONS = ["Beta (BRAT)", "Older"];

const compareVersionsDescending = (a, b) => {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const diff = (right[i] ?? 0) - (left[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
};

const versions = Object.keys(JSON.parse(readFileSync("versions.json", "utf8")))
    .sort(compareVersionsDescending)
    .slice(0, LISTED_VERSIONS);
const form = readFileSync(FORM_PATH, "utf8");
const block = /( *)# versions:start\n[\s\S]*?# versions:end\n/;
const match = form.match(block);
if (!match) throw new Error(`${FORM_PATH}: no "# versions:start" / "# versions:end" markers`);

const indent = match[1];
const options = [...versions, ...EXTRA_OPTIONS].map((option) => `${indent}  - "${option}"\n`).join("");
const updated = form.replace(block, `${indent}# versions:start\n${indent}options:\n${options}${indent}# versions:end\n`);

if (process.argv.includes("--check")) {
    if (updated !== form) {
        console.error(`${FORM_PATH} is out of date with versions.json. Run: npm run issue-form:versions`);
        process.exit(1);
    }
} else if (updated !== form) {
    writeFileSync(FORM_PATH, updated);
    console.log(`Updated ${FORM_PATH}`);
}
