import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const testBuildDirectory = resolve(".test-build");

await rm(testBuildDirectory, {
  recursive: true,
  force: true,
});
