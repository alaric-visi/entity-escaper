// Applies a saved Light/Dark choice before the page is painted, so it doesn't
// flash the wrong theme. Loaded as a plain, render-blocking script (not a
// module, not inline) so the Content Security Policy can stay script-src 'self'.
// Keep the storage key in step with src/state/persistence.js.
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('entity-escaper:v2') || 'null');
    if (saved && (saved.theme === 'light' || saved.theme === 'dark')) {
      document.documentElement.setAttribute('data-theme', saved.theme);
    }
  } catch {
    // Storage blocked or unreadable: the system theme applies.
  }
})();
