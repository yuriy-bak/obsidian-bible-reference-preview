# Changelog

## Unreleased

## 0.1.3 - Reference usage snippets

- Added contextual Reference Usage result snippets around matched Bible references.
- Limited snippets to 30 characters before and 140 characters after the matched reference.
- Added ellipses when Reference Usage snippets are truncated.
- Highlighted matched references inside Reference Usage results in both the side pane and modal results view.
- Documented Reference Usage Index snippets in README.

## 0.1.2 - Release validation follow-up

- Removed dynamic code execution and dynamic script element findings from the production bundle by replacing legacy JSZip/browser polyfill fallbacks with safe esbuild shims.
- Added GitHub artifact attestations for release assets.
- Hardened future release asset publishing so the GitHub Actions workflow builds, attests, and uploads the same assets.

## 0.1.1 - Mobile performance and release bundle update

- Changed the default `npm run build` script to create a production plugin bundle.
- Added `npm run build:dev` for the larger inline-sourcemap development bundle.
- Added `npm run build:analyze` for production bundle analysis with `meta.json`.
- Removed the unused `@melloware/coloris` dependency.
- Reduced the production `main.js` bundle size by enabling production minification and UTF-8 output.
- Added mobile-specific Reference Usage Index limits and more frequent mobile yielding.
- Added progress and cancel UI for Reference Usage Index build/rebuild.
- Added progress and cancel UI for the safe in-memory part of EPUB import.
- On mobile, tapping the same already-previewed Bible reference again now lets the editor place the cursor so the reference can be edited.
- Disabled automatic editor-focus restoration on mobile when opening the Bible side panel to avoid visible panel flicker.
- Hardened custom CSS color validation for link and floating preview background settings.
- Moved CSS color validation into a standalone testable module.
- Removed TSV import support from the plugin import flow; EPUB is now the only supported import format.

## 0.1.0 - Initial release

- Added Russian and English interface localization.
- Added interface language setting.
- Added EPUB import.
- Added Bible Index v2 with multiple translations.
- Added translation ordering and deletion.
- Added Bible reference parsing based on imported book metadata and aliases.
- Added dynamic one-chapter book detection via `chapterCount`.
- Added editor highlighting for recognized Bible references.
- Added floating Bible preview with copy, collapse/expand, drag, and mobile layout.
- Added current-paragraph and clicked-reference preview modes.
- Added command and configurable shortcut interception for opening the Bible reference under cursor.
