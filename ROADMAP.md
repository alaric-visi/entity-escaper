# Roadmap

Entity Escaper 1.0 is feature-complete for its main job: escaping and unescaping text, correctly, in six formats. What's in it is in [CHANGELOG.md](CHANGELOG.md). Below are ideas for what could come next, roughly in order of value. Suggestions and pull requests are welcome.

## Ideas

### Performance

- **Lazy-load the entity tables.** They make up about 20 KB of the 33 KB of gzipped JavaScript. Only HTML unescaping, the "already escaped" check and named non-ASCII encoding need them. Loading them with a dynamic `import()` on first use would roughly halve the initial download. This needs `transform()` to become async or "not ready yet"-aware.
- **A Web Worker for very large inputs.** Typing above 100,000 characters is already debounced, but multi-megabyte inputs still block the page briefly.

### Features

- **Shareable links.** Put the state in the URL fragment (`#…`, never the query string, so the text isn't sent to a server), compressed with `CompressionStream`, with a size cap.
- **Binary files for Base64.** Encode an image or other file to Base64, or to a `data:` URI, and decode Base64 back to a downloadable file.
- **More formats.** Candidates: CSS string and identifier escaping, Unicode escapes (`é`, `U+00E9`), quoted-printable, Punycode for domain names, SQL string literals, regular expression escaping, and Markdown. Each is one file in `src/codecs/`.
- **Offline and installable (PWA).** Add a manifest and a service worker scoped to the app's folder, so it also works when embedded in a sub-folder of another site.

### Quality

- **Firefox and WebKit in CI.** Playwright supports them; the clipboard test needs a different approach there, as clipboard permissions are Chromium-only in Playwright.
- **Translations.** All interface text is in `index.html` and the codec definitions, so extracting it is straightforward.

## Not planned

- **A framework (React, Vue and so on).** The app is small, and vanilla modules plus one `render()` keep it light and easy to embed.
- **Server-side processing.** Everything stays in the browser, by design.
