/**
 * Light/dark theme. Colours come from light-dark() in tokens.css, which
 * follows `color-scheme`; this module only sets data-theme on <html> for an
 * explicit choice (and removes it to follow the system).
 */

/** @typedef {import('../state/app-state.js').Theme} Theme */

const PREFERS_LIGHT = '(prefers-color-scheme: light)';

/**
 * @param {Theme} theme
 * @param {HTMLElement} [root]
 */
export function applyTheme(theme, root = document.documentElement) {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

/**
 * The theme actually showing: an explicit choice, or the system's.
 *
 * @param {Theme} theme
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return typeof matchMedia === 'function' && matchMedia(PREFERS_LIGHT).matches ? 'light' : 'dark';
}

/**
 * Call `onChange` when the system theme changes (only matters on "System").
 *
 * @param {() => void} onChange
 * @param {AbortSignal} signal
 */
export function watchSystemTheme(onChange, signal) {
  if (typeof matchMedia !== 'function') return;
  matchMedia(PREFERS_LIGHT).addEventListener('change', onChange, { signal });
}
