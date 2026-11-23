# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

## 1.0.0 (2026-11-23)

First public release.

### Formats

- **HTML:** escape for element text or attribute values. Non-ASCII can be numeric or named (`&eacute;`), numeric references decimal or hex, and the apostrophe `&#39;` or `&apos;`. Options keep existing entities, turn line breaks into `<br>` and tabs into spaces, and wrap output in `<pre><code>`, `<pre>` or `<code>`. Unescaping decodes exactly as a browser does.
- **URL:** component, whole URL or form data. Decoding is lenient: invalid UTF-8 is left as is, with a warning. A hint appears when a whole URL is encoded as a component.
- **JavaScript string:** single, double or template quotes, optional ASCII-only output, and "safe inside `<script>`". Decoding handles every escape form, including legacy octal and line continuations.
- **JSON string:** output matches `JSON.stringify`, with optional ASCII-only output and "safe inside `<script>`". Strict decoding gives the position of the first problem, and also accepts a whole literal with its quotes.
- **Base64:** UTF-8 text, standard or URL-safe, optional 76-column wrapping. Decoding accepts either alphabet, padding and whitespace, and explains invalid input or binary data.
- **XML:** the five XML entities or a CDATA section, with `]]>` split safely, plus a warning about characters XML 1.0 forbids.

### Interface

- Swap the output back into the input.
- Text, Changes (highlighted replacements) and Preview (sandboxed rendering) views.
- A double-encoding warning with one-click fixes.
- Character and change counts, with errors and warnings shown under the output.
- Light and dark themes, following the system or chosen.
- Side-by-side layout on wide screens.
- Open or drop a text file, and download the output.
- Clear with Undo, and optional auto-copy after pasting.
- Keyboard shortcuts, and full keyboard operation.
- Settings and text remembered in `localStorage`, validated, with an opt-out for the text.

### Engineering

- Vanilla JavaScript with a codec registry: a new format is one file.
- Strict type checking from JSDoc.
- Content Security Policy injected at build time, plus a generated `_headers` file.
- Unit, integration, end-to-end and axe accessibility tests.
- CI, an optional GitHub Pages deploy, and Dependabot.
