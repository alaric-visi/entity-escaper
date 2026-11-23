/**
 * Save and restore settings (and, if allowed, the input text) in localStorage.
 *
 * Storage can be missing, disabled, full or hold junk from an older version,
 * so every access is guarded and everything read back is validated.
 */
import { CODECS, DIRECTIONS, isCodecId, sanitiseOptions } from '../codecs/index.js';
import { THEMES, VIEWS } from './app-state.js';

/** @typedef {import('./app-state.js').AppState} AppState */

/** Namespaced and versioned, since the tool shares an origin with the rest of the site. */
export const STORAGE_KEY = 'entity-escaper:v2';

/** The first, HTML-only version stored { mode: 'escape' | 'unescape', keepExistingEntities, ... } here. */
export const LEGACY_STORAGE_KEY = 'entity-escaper:v1';

/** About 2 MB in UTF-16, comfortably inside the usual 5 MB per-origin quota. */
export const MAX_SAVED_INPUT_LENGTH = 1_000_000;

/**
 * localStorage if it is usable, otherwise null. Some browsers throw on mere
 * access (blocked cookies), others only when writing (some private modes).
 *
 * @returns {Storage | null}
 */
export function getStorage() {
  try {
    const storage = window.localStorage;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * @param {Pick<Storage, 'getItem'>} storage
 * @param {string} key
 * @returns {Record<string, unknown> | null}
 */
function readJson(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Turn a record saved by the HTML-only first version (v1) into the v2 shape.
 *
 * @param {Record<string, unknown>} legacy
 */
function migrateV1(legacy) {
  return {
    codec: 'html',
    direction: legacy.mode === 'unescape' ? 'decode' : 'encode',
    codecOptions: { html: { keepExistingEntities: legacy.keepExistingEntities } },
    autoCopy: legacy.autoCopy,
    rememberText: legacy.rememberText,
    input: legacy.input,
  };
}

/**
 * Read saved state. Unknown keys and wrongly-typed values are ignored, and
 * data saved by the previous version is migrated.
 *
 * @param {Pick<Storage, 'getItem'> | null} storage
 * @returns {Partial<AppState>}
 */
export function loadState(storage) {
  if (!storage) return {};

  let saved = readJson(storage, STORAGE_KEY);
  if (!saved) {
    const legacy = readJson(storage, LEGACY_STORAGE_KEY);
    if (legacy) saved = migrateV1(legacy);
  }
  if (!saved) return {};

  /** @type {Partial<AppState>} */
  const state = {};
  if (isCodecId(saved.codec)) state.codec = /** @type {string} */ (saved.codec);
  if (DIRECTIONS.includes(/** @type {any} */ (saved.direction))) {
    state.direction = /** @type {AppState['direction']} */ (saved.direction);
  }
  if (VIEWS.includes(/** @type {any} */ (saved.view))) {
    state.view = /** @type {AppState['view']} */ (saved.view);
  }
  if (THEMES.includes(/** @type {any} */ (saved.theme))) {
    state.theme = /** @type {AppState['theme']} */ (saved.theme);
  }
  if (typeof saved.autoCopy === 'boolean') state.autoCopy = saved.autoCopy;
  if (typeof saved.rememberText === 'boolean') state.rememberText = saved.rememberText;

  const savedOptions = saved.codecOptions;
  if (savedOptions && typeof savedOptions === 'object') {
    state.codecOptions = Object.fromEntries(
      CODECS.map((codec) => [
        codec.id,
        sanitiseOptions(codec, /** @type {Record<string, unknown>} */ (savedOptions)[codec.id]),
      ]),
    );
  }

  if (state.rememberText !== false && typeof saved.input === 'string') state.input = saved.input;
  return state;
}

/**
 * Write state. The input is only stored when `rememberText` is on and it
 * isn't huge; turning `rememberText` off removes any stored text.
 *
 * @param {Pick<Storage, 'setItem' | 'removeItem'> | null} storage
 * @param {AppState} state
 * @returns {boolean} whether the write succeeded
 */
export function saveState(storage, state) {
  if (!storage) return false;

  /** @type {Record<string, unknown>} */
  const record = {
    codec: state.codec,
    direction: state.direction,
    view: state.view,
    theme: state.theme,
    codecOptions: state.codecOptions,
    autoCopy: state.autoCopy,
    rememberText: state.rememberText,
  };
  if (state.rememberText && state.input.length <= MAX_SAVED_INPUT_LENGTH) {
    record.input = state.input;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
    storage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    // Quota exceeded or storage revoked mid-session: keep working without it.
    return false;
  }
}

/**
 * Save at most once per `delayMs`, so a fast typist (or a huge paste) doesn't
 * serialise the whole input on every keystroke. Call `flush()` on pagehide.
 *
 * @param {Pick<Storage, 'setItem' | 'removeItem'> | null} storage
 * @param {() => AppState} getState
 * @param {number} [delayMs]
 */
export function createDebouncedSaver(storage, getState, delayMs = 300) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  function flush() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    saveState(storage, getState());
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  }

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }

  return { schedule, flush, cancel };
}
