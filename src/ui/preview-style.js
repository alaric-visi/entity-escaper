/**
 * The stylesheet inside the preview frame.
 *
 * It's a constant (rather than built per theme) because the page's Content
 * Security Policy allows it by its SHA-256 hash, and the preview frame
 * inherits that policy. vite.config.js hashes this exact string at build
 * time, so editing it here is safe: the hash follows automatically.
 */
export const PREVIEW_STYLE = `
:root { color-scheme: dark; }
:root:has(body.light) { color-scheme: light; }
body { margin: 12px; font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e0e0e0; background: #252525; overflow-wrap: anywhere; }
body.light { color: #1d1f23; background: #f0f1f4; }
pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; }
pre { white-space: pre-wrap; }
a { color: #8b9cf4; }
body.light a { color: #4c51bf; }
`;
