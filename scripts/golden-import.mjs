// Golden test for EPUB import: imports the same EPUB files with the base ref and with the
// working tree and compares the produced JSON byte for byte (import timestamps excluded).
// Usage: node scripts/golden-import.mjs <epub-path>... (base ref: GOLDEN_BASE_REF, default origin/main)
// EPUB files are not stored in the repository, so this script is not part of `npm test`.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rm, symlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const epubPaths = process.argv.slice(2).map((path) => resolve(path));
if (epubPaths.length === 0) {
  console.error("Usage: node scripts/golden-import.mjs <epub-path>...");
  process.exit(2);
}

const root = resolve(".");
const baseRef = process.env.GOLDEN_BASE_REF ?? "origin/main";
const goldenDirectory = join(root, ".golden");
const baseWorktree = join(goldenDirectory, "base");

await prepareBaseWorktree();
run("npm", ["run", "build:test-modules"], root);
run("npm", ["run", "build:test-modules"], baseWorktree);

let failed = false;
for (const epubPath of epubPaths) {
  const name = basename(epubPath).replace(/\.epub$/i, "");
  const baseOut = join(goldenDirectory, "out", name, "base");
  const headOut = join(goldenDirectory, "out", name, "head");
  run("node", [join(root, "scripts/golden-import-dump.mjs"), join(baseWorktree, ".test-build"), epubPath, baseOut], root);
  run("node", [join(root, "scripts/golden-import-dump.mjs"), join(root, ".test-build"), epubPath, headOut], root);
  const differences = await compareDirectories(baseOut, headOut);
  if (differences.length === 0) {
    console.log(`${name}: identical to ${baseRef}`);
  } else {
    failed = true;
    console.log(`${name}: ${differences.length} file(s) differ from ${baseRef}:`);
    for (const difference of differences.slice(0, 20)) {
      console.log(`  ${difference}`);
    }
  }
}

process.exit(failed ? 1 : 0);

async function prepareBaseWorktree() {
  if (existsSync(baseWorktree)) {
    run("git", ["worktree", "remove", "--force", baseWorktree], root);
  }
  await rm(baseWorktree, { recursive: true, force: true });
  run("git", ["worktree", "add", "--detach", baseWorktree, baseRef], root);
  await symlink(join(root, "node_modules"), join(baseWorktree, "node_modules"), "dir");
}

async function compareDirectories(left, right) {
  const leftFiles = await listFiles(left);
  const rightFiles = await listFiles(right);
  const allFiles = [...new Set([...leftFiles, ...rightFiles])].sort();
  const differences = [];

  for (const file of allFiles) {
    if (!leftFiles.includes(file) || !rightFiles.includes(file)) {
      differences.push(`${file}: only in ${leftFiles.includes(file) ? "base" : "head"}`);
      continue;
    }

    const leftText = await readFile(join(left, file), "utf8");
    const rightText = await readFile(join(right, file), "utf8");
    if (leftText !== rightText) {
      differences.push(`${file}: ${describeFirstDifference(leftText, rightText)}`);
    }
  }

  return differences;
}

async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      result.push(...await listFiles(directory, relativePath));
    } else {
      result.push(relativePath);
    }
  }
  return result;
}

function describeFirstDifference(left, right) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  for (let index = 0; index < Math.max(leftLines.length, rightLines.length); index += 1) {
    if (leftLines[index] !== rightLines[index]) {
      return `line ${index + 1}\n    base: ${leftLines[index] ?? "<none>"}\n    head: ${rightLines[index] ?? "<none>"}`;
    }
  }
  return "different content";
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
}
