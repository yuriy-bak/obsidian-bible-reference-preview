import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "node_modules/",
      ".test-build/",
      ".agent*/",
      ".agent*",
      ".agent_backups/",
      "agent_output.json",
      "data/",
      "main.js",
      "**/*.js.map",
      "src/**/*.js",
      "scripts/",
      "tests/",
      "esbuild.config.mjs",
      "eslint.config.mjs"
    ]
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    // Reported only as warnings by the Obsidian plugin review; kept as warnings until they are fixed.
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "no-useless-escape": "warn"
    }
  }
]);
