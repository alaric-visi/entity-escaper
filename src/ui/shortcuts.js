/**
 * Page-wide keyboard shortcuts and platform-appropriate key labels.
 */

/**
 * True on macOS and iOS, where the shortcut modifier is ⌘ rather than Ctrl.
 * (`userAgentData` is newer than TypeScript's DOM types, hence the cast.)
 *
 * @param {Navigator & { userAgentData?: { platform?: string } }} [nav]
 */
export function isApplePlatform(nav = navigator) {
  const platform = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Show ⌘ instead of Ctrl in `<kbd data-mod-key>` elements on Apple devices.
 *
 * @param {ParentNode} root
 * @param {boolean} [apple]
 */
export function applyModifierLabels(root, apple = isApplePlatform()) {
  if (!apple) return;
  for (const key of root.querySelectorAll('[data-mod-key]')) {
    key.textContent = '⌘';
    key.setAttribute('title', 'Command');
  }
}

/**
 * Ctrl/⌘ + Enter → onCopy, Ctrl/⌘ + Shift + Enter → onSwap.
 *
 * Neither combination does anything by default in a textarea in current
 * browsers, so these don't steal anything.
 *
 * @param {EventTarget} target
 * @param {{ onCopy: () => void, onSwap: () => void }} handlers
 * @param {AbortSignal} signal
 */
export function bindShortcuts(target, { onCopy, onSwap }, signal) {
  target.addEventListener(
    'keydown',
    (event) => {
      const e = /** @type {KeyboardEvent} */ (event);
      if (e.defaultPrevented || e.isComposing || e.altKey) return;
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;

      e.preventDefault();
      if (e.shiftKey) onSwap();
      else onCopy();
    },
    { signal },
  );
}
