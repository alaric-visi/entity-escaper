/**
 * The "Changes" (highlighted) and "Preview" (rendered) views of the output.
 */
import { PREVIEW_STYLE } from './preview-style.js';

/** Past these sizes, highlighting would make the page sluggish. */
export const MAX_HIGHLIGHT_LENGTH = 200_000;
export const MAX_HIGHLIGHT_RANGES = 20_000;

/**
 * Show `text` with each changed range wrapped in <mark>.
 *
 * @param {HTMLElement} container
 * @param {string} text
 * @param {Array<[number, number]>} ranges
 */
export function renderChanges(container, text, ranges) {
  if (!text) {
    const empty = document.createElement('p');
    empty.className = 'changes__message';
    empty.textContent = 'Nothing to show yet.';
    container.replaceChildren(empty);
    return;
  }
  if (text.length > MAX_HIGHLIGHT_LENGTH || ranges.length > MAX_HIGHLIGHT_RANGES) {
    const message = document.createElement('p');
    message.className = 'changes__message';
    message.textContent = 'This output is too large to highlight. Switch to Text to see it.';
    container.replaceChildren(message);
    return;
  }

  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const [start, end] of ranges) {
    if (start > last) fragment.append(text.slice(last, start));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    fragment.append(mark);
    last = end;
  }
  if (last < text.length) fragment.append(text.slice(last));
  container.replaceChildren(fragment);
}

/**
 * A complete document for the sandboxed preview frame. The frame has
 * `sandbox=""` (no scripts, forms, popups or same-origin access) and this CSP
 * also blocks every network request, so pasted markup can't phone home.
 *
 * Whitespace is deliberately *not* preserved: the preview shows what a real
 * page would do, so collapsed line breaks are visible.
 *
 * @param {string} html
 * @param {'light' | 'dark'} [theme]
 */
export function previewDocument(html, theme = 'dark') {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>${PREVIEW_STYLE}</style></head><body class="${theme}">${html}</body></html>`;
}

/**
 * Updates the preview frame, debounced so typing doesn't reload it on every
 * keystroke.
 *
 * @param {HTMLIFrameElement} frame
 * @param {number} [delayMs]
 */
export function createPreview(frame, delayMs = 150) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {string | undefined} */
  let shown;

  /**
   * @param {string} html
   * @param {'light' | 'dark'} theme
   */
  function update(html, theme) {
    const document = previewDocument(html, theme);
    if (document === shown) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      shown = document;
      frame.srcdoc = document;
    }, delayMs);
  }

  function cancel() {
    clearTimeout(timer);
  }

  return { update, cancel };
}
