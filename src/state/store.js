/**
 * A minimal state container: one plain object, replaced (never mutated) on
 * every change, with change listeners. That's all this app needs; there's no
 * reason to pull in a library.
 *
 * @template {object} S
 * @param {S} initialState
 */
export function createStore(initialState) {
  let state = Object.freeze({ ...initialState });
  /** @type {Set<(state: S, previous: S) => void>} */
  const listeners = new Set();

  return {
    /** @returns {S} */
    get() {
      return state;
    },

    /**
     * Merge a partial update. Listeners are only called if something changed.
     *
     * @param {Partial<S> | ((state: S) => Partial<S>)} patch
     */
    set(patch) {
      const changes = typeof patch === 'function' ? patch(state) : patch;
      const keys = /** @type {(keyof S)[]} */ (Object.keys(changes));
      const changed = keys.some((key) => !Object.is(changes[key], state[key]));
      if (!changed) return;

      const previous = state;
      state = Object.freeze({ ...state, ...changes });
      for (const listener of listeners) listener(state, previous);
    },

    /**
     * @param {(state: S, previous: S) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
