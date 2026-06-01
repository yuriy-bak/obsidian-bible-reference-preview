## Bible Reference Preview 0.1.2

Release validation follow-up.

### Fixed

- Removed dynamic code execution / dynamic script injection findings from the production bundle by replacing legacy JSZip/browser polyfill fallbacks with safe esbuild shims.
- Added GitHub Actions artifact attestations workflow for release assets.
- Kept `npm run build` as the production release build.
- Bumped package, manifest, lockfile, and versions metadata to 0.1.2.

### Verification

- `npm run lint` passed.
- `npm run build` passed.
- `npm test` passed.
- Expanded dynamic code/script search found no runtime plugin findings.

### Notes for review

The remaining behavior recommendations are expected plugin functionality:

- Vault enumeration is used by the optional Reference Usage Index to scan Markdown files for Bible references. It is limited to Markdown files, supports excluded folders, skips the plugin data directory, applies file-size limits, and supports progress/cancel.
- Clipboard access is used only for explicit user-initiated copy actions from the Bible preview UI.
