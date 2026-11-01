# Releasing

A checklist for every release, for a person or an AI assistant. Go through it top to bottom.

## Beta (for testing with BRAT)

Every finished feature or fix goes out as a beta first. Betas do not touch `main` or the community catalog.

Every PR with a change users notice adds a line to the `## Unreleased` section at the top of `CHANGELOG.md` (create the section if it is missing). Internal changes go last and start with "Internal:". So the stable release finds the list already collected.

1. Pick the version: the next stable version plus `-beta.N`. After stable `0.3.0`, betas are `0.3.1-beta.1`, `0.3.1-beta.2`, … Look at the latest [pre-releases](https://github.com/yuriy-bak/obsidian-bible-reference-preview/releases) first: several branches may be in progress, so take the next free number. A beta numbered below the latest stable version is not offered by BRAT.
2. Run **Actions → Beta release → Run workflow** with that version and the branch of the PR.
3. Install it with BRAT and check the change on desktop and, if it touches the UI, on a phone.

## Stable release

Only when the owner decides to release.

1. **Version.** The next patch version after the latest stable release, the same base as the betas (betas `0.3.1-beta.N` → `0.3.1`). A new minor version (`0.4.0`) only for a large feature, by the owner's decision.
2. **Bump.** On a new branch, run `npm run release:bump -- <version> "<short title>"`. It updates `manifest.json`, `package.json`, `package-lock.json`, `versions.json` and the plugin version list of the bug report form, and renames `## Unreleased` in `CHANGELOG.md` to `## <version> - <short title>`.
3. **minAppVersion.** If the release needs a newer Obsidian, change `minAppVersion` in `manifest.json` before step 2, so `versions.json` gets the right value.
4. **CHANGELOG.md.** Check the `## <version> - <short title>` section: everything users notice since the last stable release, from all the betas. If there was no `## Unreleased` section, write it by hand. Internal changes go last and are marked "Internal".
5. **README.md and README.ru.md.** Both files, same content:
   - "What's new in <version>" / «Что нового в <version>»: rewrite for the new version, 3–5 main changes since the previous stable release, with the link to `CHANGELOG.md` kept. `npm run readme:check` (also run by CI) fails until both name the version in `manifest.json`;
   - new features, settings and commands in Features;
   - Roadmap: remove what is done;
   - new import sources in Importing a translation;
   - screenshots and GIF, if the UI they show has changed.
6. **Roadmap issues.** Put `Closes #N` in the PR description for each roadmap issue the release completes, so the issues close on merge.
7. **Checks.** `npm run lint`, `npm test` and `npm run readme:check` pass. CI also checks that the bug report form lists the new version.
8. **PR → merge.** When the PR lands on `main`, the `Release` workflow creates the tag (no `v` prefix) and the GitHub Release with the CHANGELOG section as notes, and attaches `main.js`, `manifest.json` and `styles.css`.
9. **After the release.** Check that the release has the three files. The community catalog picks the new version up by itself within a few hours.

The `description` in `manifest.json` reaches the community catalog only with a stable release.
