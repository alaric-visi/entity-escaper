# Using Entity Escaper inside another website

Entity Escaper builds to plain static files with **relative paths**, so you can serve it from any folder of an existing site, for example `https://example.com/tools/entity-escaper/`. This guide covers doing that with any static site, using Astro as the worked example.

## 1. Build it

```sh
npm ci
npm run build      # or `npm run check` to lint, type-check and test first
```

`dist/` now contains everything the tool needs:

```
dist/
├── index.html        the page, including its Content Security Policy <meta> tag
├── theme-init.js     applies a saved theme before first paint
├── favicon.svg
├── assets/           hashed JS and CSS (safe to cache for a year)
└── _headers          optional response headers for Netlify / Cloudflare Pages (see step 4)
```

## 2. Put it in your site

Copy the **contents** of `dist/` (except `_headers`; see step 4) into the folder it should be served from.

**Astro:** anything in `public/` is copied to the build output unchanged, so use:

```
your-astro-site/
└── public/
    └── tools/
        └── entity-escaper/
            ├── index.html
            ├── theme-init.js
            ├── favicon.svg
            └── assets/…
```

The tool is then served at `/tools/entity-escaper/`. Astro doesn't process these files, which is what you want: they're already built.

## 3. Link to it with a trailing slash

Because asset paths are relative (`./assets/…`), the page must be loaded from a URL ending in `/`:

- ✅ `/tools/entity-escaper/` or `/tools/entity-escaper/index.html`
- ❌ `/tools/entity-escaper`: the browser would look for `/tools/assets/…`

Some hosts redirect the slash-less form to the slash form automatically and some don't, so always link with the trailing slash. After deploying, check that the page loads styled from the address you link to.

## 4. Headers (optional, recommended)

**Already included:** the Content Security Policy is in a `<meta>` tag in `index.html`, so it travels with the files and needs no host configuration.

**Optional extras:** `dist/_headers` adds `frame-ancestors`, `nosniff`, a referrer policy and long-term caching for `assets/`. Its paths (`/*`, `/assets/*`) assume the tool is at the site root. Netlify and Cloudflare Pages only read a `_headers` file at the root of the published site, so for a sub-folder:

1. Don't copy `dist/_headers` into the sub-folder (it would be ignored there).
2. Add the rules to your site's own `_headers` file (in Astro, `public/_headers`), with the paths changed to the folder:

   ```
   /tools/entity-escaper/*
     X-Content-Type-Options: nosniff
     Referrer-Policy: no-referrer
     Content-Security-Policy: frame-ancestors 'self'

   /tools/entity-escaper/assets/*
     Cache-Control: public, max-age=31536000, immutable
   ```

   On Netlify you can use `[[headers]]` blocks in `netlify.toml` instead.

**If your site already sends a site-wide `Content-Security-Policy` header:** the browser applies it on top of the tool's own policy, so the stricter rules win. The tool needs:

- `script-src 'self'`
- `style-src 'self'` plus the `'sha256-…'` hash from `dist/index.html` (for the preview frame's stylesheet)
- `img-src 'self' data:`
- `frame-src 'self'`

Either allow those for the tool's path, or leave the tool's path out of the site-wide header. The hash changes only if `src/ui/preview-style.js` changes.

## 5. Keep it up to date

Choose whichever suits how you work:

- **Copy on release.** Rebuild here and copy `dist/` over the old folder. This is the simplest option, with nothing to configure.
- **Git submodule with a build step.** Add this repo as a submodule, for example at `vendor/entity-escaper`, and build it before your site:

  ```json
  {
    "scripts": {
      "prebuild": "npm --prefix vendor/entity-escaper ci && npm --prefix vendor/entity-escaper run build && node scripts/copy-entity-escaper.mjs"
    }
  }
  ```

  Here `scripts/copy-entity-escaper.mjs` does the copy, without `_headers`:

  ```js
  import { cp, rm } from 'node:fs/promises';
  const target = 'public/tools/entity-escaper';
  await rm(target, { recursive: true, force: true });
  await cp('vendor/entity-escaper/dist', target, {
    recursive: true,
    filter: (path) => !path.endsWith('_headers'),
  });
  ```

  Your host then needs Node 22.12+ for the build. Netlify reads `NODE_VERSION`.

- **Download from CI.** The CI workflow could also publish `dist/` as a release asset. This isn't set up, but it's a small addition to `.github/workflows/`.

## Things to know

- **Storage is per origin.** Settings and text are saved in `localStorage` under `entity-escaper:v2`. That key is namespaced, so it won't clash with your site, but two copies of the tool on the same domain share it.
- **Look and feel.** All colours, type and spacing are CSS custom properties in `src/styles/tokens.css`, as `light-dark()` pairs. Change them there and rebuild to match your site.
- **Inside your site's layout.** The tool is a full page with its own header. To show it inside a page that has your site's navigation, embed it:

  ```html
  <iframe
    src="/tools/entity-escaper/"
    title="Entity Escaper"
    style="width: 100%; height: 56rem; border: 0"
  ></iframe>
  ```

  `frame-ancestors 'self'` allows this from the same domain.
