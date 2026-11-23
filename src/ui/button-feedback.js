/**
 * Temporary feedback on a button ("Copied!" / "Copy failed"), plus an
 * optional screen-reader announcement.
 *
 * A new call cancels any pending reset, so rapid clicks don't make the label
 * flicker back early.
 *
 * @param {HTMLButtonElement} button
 * @param {object} options
 * @param {Record<string, { label: string, announce?: string }>} options.states
 * @param {(message: string) => void} [options.announce]
 * @param {number} [options.resetAfterMs]
 */
export function createButtonFeedback(button, { states, announce, resetAfterMs = 1500 }) {
  const defaultLabel = button.textContent.trim();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let resetTimer;

  function reset() {
    clearTimeout(resetTimer);
    button.textContent = defaultLabel;
    delete button.dataset.state;
  }

  /** @param {string} stateName */
  function show(stateName) {
    const state = states[stateName];
    if (!state) throw new Error(`Unknown feedback state: ${stateName}`);

    clearTimeout(resetTimer);
    button.textContent = state.label;
    button.dataset.state = stateName;
    announce?.(state.announce ?? state.label);
    resetTimer = setTimeout(reset, resetAfterMs);
  }

  return { show, reset };
}
