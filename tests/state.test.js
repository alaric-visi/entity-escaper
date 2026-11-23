import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '../src/state/store.js';
import { createDefaultState } from '../src/state/app-state.js';
import { defaultCodecOptions } from '../src/codecs/index.js';
import {
  LEGACY_STORAGE_KEY,
  MAX_SAVED_INPUT_LENGTH,
  STORAGE_KEY,
  createDebouncedSaver,
  loadState,
  saveState,
} from '../src/state/persistence.js';

/** A minimal in-memory Storage. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

describe('createStore', () => {
  it('merges updates and notifies listeners with the previous state', () => {
    const store = createStore({ a: 1, b: 2 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ a: 5 });

    expect(store.get()).toEqual({ a: 5, b: 2 });
    expect(listener).toHaveBeenCalledWith({ a: 5, b: 2 }, { a: 1, b: 2 });
  });

  it('accepts an updater function', () => {
    const store = createStore({ count: 1 });
    store.set((s) => ({ count: s.count + 1 }));
    expect(store.get().count).toBe(2);
  });

  it('skips listeners when nothing changed', () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ a: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns frozen state and supports unsubscribing', () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(Object.isFrozen(store.get())).toBe(true);
    unsubscribe();
    store.set({ a: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('persistence', () => {
  afterEach(() => vi.useRealTimers());

  const codecOptions = defaultCodecOptions();
  const state = {
    ...createDefaultState(),
    codec: 'url',
    direction: 'decode',
    view: 'changes',
    input: 'hello',
    autoCopy: true,
    codecOptions: { ...codecOptions, url: { ...codecOptions.url, variant: 'form' } },
  };

  it('round-trips format, direction, view, options, settings and text', () => {
    const storage = memoryStorage();
    expect(saveState(storage, state)).toBe(true);
    expect(loadState(storage)).toEqual({
      codec: 'url',
      direction: 'decode',
      view: 'changes',
      theme: 'system',
      input: 'hello',
      autoCopy: true,
      rememberText: true,
      codecOptions: state.codecOptions,
    });
  });

  it('never saves session-only state', () => {
    const storage = memoryStorage();
    saveState(storage, { ...state, noticeDismissed: true, clearedInput: 'secret' });
    const raw = storage.getItem(STORAGE_KEY);
    expect(raw).not.toContain('noticeDismissed');
    expect(raw).not.toContain('secret');
  });

  it('does not store the text when rememberText is off', () => {
    const storage = memoryStorage();
    saveState(storage, { ...state, rememberText: false });
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).not.toHaveProperty('input');
    expect(loadState(storage)).not.toHaveProperty('input');
  });

  it('skips very large text but still saves settings', () => {
    const storage = memoryStorage();
    saveState(storage, { ...state, input: 'x'.repeat(MAX_SAVED_INPUT_LENGTH + 1) });
    const loaded = loadState(storage);
    expect(loaded).not.toHaveProperty('input');
    expect(loaded.codec).toBe('url');
  });

  it('ignores corrupt or wrongly-typed data', () => {
    expect(loadState(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual({});
    expect(loadState(memoryStorage({ [STORAGE_KEY]: '"a string"' }))).toEqual({});
    expect(
      loadState(
        memoryStorage({
          [STORAGE_KEY]: JSON.stringify({
            codec: 'morse',
            direction: 'sideways',
            view: 'hologram',
            theme: 'sepia',
            autoCopy: 'yes',
            input: 42,
          }),
        }),
      ),
    ).toEqual({});
  });

  it('drops invalid option values but keeps valid ones', () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({
        codecOptions: { html: { characters: 'text', wrap: 'blink' }, nope: { x: 1 } },
      }),
    });
    const { codecOptions: loaded } = loadState(storage);
    expect(loaded.html.characters).toBe('text');
    expect(loaded.html.wrap).toBe('none');
    expect(loaded).not.toHaveProperty('nope');
    expect(loaded.url).toEqual(codecOptions.url);
  });

  it('migrates data saved by the HTML-only first version (v1) and removes it on the next save', () => {
    const storage = memoryStorage({
      [LEGACY_STORAGE_KEY]: JSON.stringify({
        mode: 'unescape',
        keepExistingEntities: true,
        autoCopy: true,
        rememberText: true,
        input: '&lt;old&gt;',
      }),
    });
    const loaded = loadState(storage);
    expect(loaded).toMatchObject({
      codec: 'html',
      direction: 'decode',
      autoCopy: true,
      input: '&lt;old&gt;',
    });
    expect(loaded.codecOptions.html.keepExistingEntities).toBe(true);

    saveState(storage, { ...createDefaultState(), ...loaded });
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('works without storage at all', () => {
    expect(loadState(null)).toEqual({});
    expect(saveState(null, state)).toBe(false);
  });

  it('survives a storage that throws (e.g. quota exceeded)', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(loadState(storage)).toEqual({});
    expect(saveState(storage, state)).toBe(false);
  });

  it('debounces saves and flushes on demand', () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    let current = state;
    const saver = createDebouncedSaver(storage, () => current, 300);

    saver.schedule();
    current = { ...state, input: 'later' };
    saver.schedule();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();

    vi.advanceTimersByTime(300);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).input).toBe('later');

    current = { ...state, input: 'flushed' };
    saver.schedule();
    saver.flush();
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).input).toBe('flushed');
  });
});
