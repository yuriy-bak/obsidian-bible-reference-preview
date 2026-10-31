# Contributing

## Commands

Use the npm scripts from `package.json` for local development and verification:

```bash
npm run lint
npm run typecheck
npm run build
npm run build:dev
npm run build:analyze
npm test
```

## Scripts

- `npm run lint` checks the TypeScript and JavaScript sources with ESLint.
- `npm run typecheck` runs TypeScript type checking without emitting files.
- `npm run build` type-checks the project and builds the production Obsidian plugin bundle.
- `npm run build:dev` type-checks the project and builds a larger development bundle with an inline source map for debugging.
- `npm run build:analyze` builds the production bundle and writes `meta.json` for bundle-size analysis.
- `npm test` runs the production build, builds CommonJS test modules into `.test-build/`, and runs parser/importer tests and the integration tests: `tests/integration/` loads the real plugin from `main.ts` against a stub of the `obsidian` module (`tests/obsidian-stub/`: plugin API, an in-memory vault and workspace, a jsdom DOM) and checks import, translation switching, the editor, the reading mode and the usage index together.

## Repository hygiene

- `.test-build/` is test output and should not be committed.
- Generated `src/**/*.js` files should not be committed; source files live in `src/**/*.ts`.
- `main.js` is the Obsidian plugin build artifact used for manual installation and releases.
- `npm run build` creates the production `main.js` by default; use `npm run build:dev` only when you need an inline source map for debugging.

## Releasing

- The step-by-step checklist for betas and stable releases is in [RELEASING.md](RELEASING.md). `npm run release:bump -- <version>` sets the version in `manifest.json`, `package.json`, `package-lock.json`, `versions.json` and the bug report form; then add a `## <version> - <title>` section to `CHANGELOG.md`.
- When that change lands on `main`, the `Release` workflow creates the `<version>` tag and GitHub Release with the CHANGELOG section as notes, and attaches attested `main.js`, `manifest.json`, and `styles.css`.
- To publish a beta for BRAT, run the `Beta release` workflow manually (Actions → Beta release → Run workflow) with a pre-release version such as `0.2.0-beta.1` and the branch to build. It creates a pre-release with that tag and attested assets; the version is set only in the released `manifest.json`, nothing is committed, so `main` and the community catalog are unaffected.
- Releases published manually are picked up by the same workflow, which builds, attests, and uploads the assets. To redo the assets of an existing release, run the workflow manually with its tag.

## Import and indexing

- Translations are imported through the plugin settings (**Import Bible**) or the **Import Bible file** command. Each supported format is a Bible source in `src/infrastructure/sources/` (`BibleSource`): it recognizes its own files (`canHandle`), declares its file types and size limit, and reads books and verses for `BibleIndexBuilder`. `createBibleSources()` lists the sources; the first one that recognizes a file takes it, so a narrower format goes before a more general one. Adding a format means adding a source and one line to that list; the file picker and the "not recognized" error pick it up.
- Versification: verse numbering differs between translations (the Synodal Psalm 22 is Psalm 23 in English Bibles). `src/versification/schemes/*.vrs` are the Paratext schemes English, Original, Septuagint, Vulgate and Russian Protestant, copied unchanged from [sillsdev/machine.py](https://github.com/sillsdev/machine.py) (MIT, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)). `npm run generate:versification` turns them into `src/versification/builtinVersificationData.ts` with the 66 canonical books only; a test fails if the generated file is out of date. The import stores the detected scheme (`versification`, best match of verse counts per chapter) and the book order (`bookOrder`) of each translation in `bibles-index.json`; translations imported before 0.3.0 get them detected once in the background after loading.
- The Reference Usage Index scans Markdown files in the vault to find Bible reference usages.
- Large Markdown files can be skipped by the Reference Usage Index according to its size limit to avoid slow indexing and UI freezes.
- Long Reference Usage Index builds and the safe in-memory part of EPUB import show progress and can be cancelled.

