# Contributing

Thanks for helping. Bug reports, new formats, accessibility fixes and documentation improvements are all welcome.

## Setting up

```sh
npm install
npx playwright install chromium   # once, for the end-to-end tests
npm run dev
```

Node.js 22.12 or later is required (`nvm use` reads `.nvmrc`). If you already have Chrome, you can skip the Playwright download and set `CHROME_PATH` instead, for example `CHROME_PATH=/usr/bin/google-chrome npm run test:e2e`.

## Before opening a pull request

```sh
npm run check      # lint, formatting, type check, unit tests, build
npm run test:e2e   # end-to-end and accessibility tests against the build
```

CI runs both on every pull request. `npm run format` fixes formatting.

## Ground rules

- **No framework.** The app is small enough that vanilla modules plus one `render(state)` function stay easy to follow.
- **Logic stays pure.** Formats (`src/codecs/`) and helpers (`src/lib/`) never touch the DOM, so they're tested in Node.
- **Types live in JSDoc** and are checked strictly (`npm run typecheck`). There is no TypeScript build step.
- **Colours live only in `src/styles/tokens.css`,** as `light-dark(light, dark)` pairs. Text needs at least 4.5:1 contrast and control outlines 3:1, in both themes. The current ratios are noted in comments.
- **Nothing inline.** No inline `<script>`, `<style>` or `style=""` attributes, and no `eval`: the Content Security Policy forbids them. Setting `element.style` from JavaScript is fine.
- **Every feature has tests.** New formats must pass the contract tests in `tests/codecs.test.js`. They do so automatically once the format is registered, as long as its round trips really work.

## Adding a format

See "Adding a format" in the [README](README.md#adding-a-format). Some guidance:

- Return `error` (with `text: ''`) only when the input can't be processed at all. Prefer lenient decoding plus `warnings` when part of the input is bad.
- Report positions 1-based in messages ("at position 5"), as people count.
- Keep `guidance` to one or two sentences about when to use the format, and when not to.
- Options that make decoding unable to restore the original need `lossy: true`, so the round-trip test skips them.

## Manual checks for UI changes

Automated axe scans catch roughly a third of accessibility problems, so for UI changes also check that:

- everything works with the keyboard alone (Tab, Shift+Tab, arrow keys in groups, Enter and Space), with a visible focus ring
- it works in both light and dark themes, and at 200% zoom
- it works on a phone-sized screen, with no sideways scrolling
- status changes (copied, errors, warnings) are announced by a screen reader such as VoiceOver or NVDA

## Changelog

Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
