/**
 * Copy text to the clipboard.
 *
 * Uses the async Clipboard API where available (secure contexts only) and
 * falls back to the legacy `execCommand('copy')` path otherwise, e.g. when the
 * page is served over plain HTTP or the browser denies permission.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true only if the copy actually succeeded
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or document not focused: try the legacy path.
    }
  }
  return legacyCopy(text);
}

/**
 * Copy via a temporary, off-screen textarea so the user's own selection
 * and focus are left as they were.
 *
 * @param {string} text
 * @returns {boolean}
 */
function legacyCopy(text) {
  const previouslyFocused = /** @type {HTMLElement | null} */ (document.activeElement);
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.setAttribute('aria-hidden', 'true');
  Object.assign(scratch.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
  document.body.append(scratch);
  scratch.select();

  let copied;
  try {
    // execCommand returns false when the copy is not allowed: check it.
    copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    scratch.remove();
    previouslyFocused?.focus?.();
  }
  return copied;
}
