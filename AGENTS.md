# AGENTS.md

Guidance for AI coding agents (and humans in a hurry) working in this repository.

## What this is

A static, client-side web app that escapes and unescapes text for HTML, URLs, JavaScript strings, JSON strings, Base64 and XML. It uses vanilla JavaScript (ES modules) built with Vite, with no framework and no backend. The only runtime dependency is `entities`.

## Commands

| Task                 | Command                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| Install              | `npm ci` (Node 22.12+, see `.nvmrc`)                                           |
| Dev server           | `npm run dev`                                                                  |
| Everything CI checks | `npm run check` (lint, Prettier, `tsc` type check, Vitest, build)              |
| Browser tests        | `npm run test:e2e` (needs `npx playwright install chromium`, or `CHROME_PATH`) |
| Fix formatting       | `npm run format`                                                               |
| Production build     | `npm run build` → `dist/`                                                      |

Run `npm run check` and `npm run test:e2e` after changes. Both must pass.

## Map

- `src/codecs/`: one file per format. `types.js` is the contract and `index.js` is the registry. **A new format is one file plus one line in `index.js`.** The UI, storage and contract tests are generated from the registry.
- `src/lib/`: pure helpers (no DOM). `tracked-replace.js` gives codecs their counts and highlight ranges.
- `src/state/`: `store.js` (tiny store), `app-state.js` (shape, defaults, `PERSISTED_KEYS`), `persistence.js` (localStorage v2, validated against the registry, migrates v1).
- `src/app.js`: queries the DOM once, then a single `render(state)` updates everything. Events call `store.set()`.
- `src/ui/`: options panel (built from codec option definitions), output views, preview, theme, files, shortcuts.
- `src/styles/tokens.css`: every colour, as `light-dark(light, dark)`.
- `vite.config.js`: generates the Content Security Policy (`<meta>` in `index.html`) and `dist/_headers`.
- `tests/`: Vitest (Node, plus jsdom for `app.test.js`). `e2e/`: Playwright, including axe scans.

## Rules

- Keep `base: './'` in `vite.config.js`. Relative paths are what let the build run in any sub-folder of another site (see `docs/embedding.md`).
- **Nothing inline:** no inline `<script>`/`<style>`, no `style=""` attributes, no `eval` or `new Function` in `src/`. The CSP blocks them. The preview frame's stylesheet is the one exception, allowed by a hash that `vite.config.js` computes from `src/ui/preview-style.js`. Edit the style there, never by hand in the CSP.
- Codecs and `src/lib/` must stay pure (no DOM, no globals beyond standard JS and `TextEncoder`/`TextDecoder`/`atob`/`btoa`).
- Types are JSDoc, checked with `strict` (`jsconfig.json`). Keep `npm run typecheck` clean, and don't add `// @ts-ignore` without a comment explaining why.
- New UI must work with the keyboard alone, in both themes, and on narrow screens. Use native controls (`button`, `select`, radio groups, `details`) rather than ARIA re-implementations.
- If you add state that should survive a reload, add it to `PERSISTED_KEYS` and validate it in `loadState()`. Bump the storage key and add a migration only if the shape changes incompatibly.
- `public/theme-init.js` duplicates the storage key; keep it in step with `src/state/persistence.js`.

## Installing it into another site

Build, then copy the contents of `dist/` (not `_headers`) into a folder of the host site. In Astro that's `public/<path>/`. Link to it with a trailing slash. Headers and CSP considerations are covered in [`docs/embedding.md`](docs/embedding.md). Don't port the app into the host's framework unless asked; it's designed to be dropped in as built files.
