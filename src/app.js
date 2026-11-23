import { CODECS, getCodec } from './codecs/index.js';
import { transform, oppositeDirection } from './lib/transform.js';
import { copyText } from './lib/clipboard.js';
import { countCharacters, pluralise } from './lib/format.js';
import { createStore } from './state/store.js';
import { createDefaultState, PERSISTED_KEYS } from './state/app-state.js';
import { getStorage, loadState, createDebouncedSaver } from './state/persistence.js';
import { createButtonFeedback } from './ui/button-feedback.js';
import { applyModifierLabels, bindShortcuts } from './ui/shortcuts.js';
import { createOptionsPanel, describeOptions, readOptionChange } from './ui/options-panel.js';
import { createPreview, renderChanges } from './ui/output-views.js';
import { applyTheme, resolveTheme, watchSystemTheme } from './ui/theme.js';
import { downloadName, downloadText, hasFiles, readTextFile } from './ui/files.js';

/** @typedef {import('./state/app-state.js').AppState} AppState */
/** @typedef {import('./lib/transform.js').TransformResult} TransformResult */

/** How long "Undo clear" stays available. */
export const UNDO_CLEAR_MS = 5000;

/**
 * Above this many characters, typing is debounced so each keystroke doesn't
 * re-process the whole text. Pastes and opened files are processed at once.
 */
export const LARGE_INPUT_LENGTH = 100_000;
export const LARGE_INPUT_DELAY_MS = 200;

/** "Escape" → "Escaping", "Encode" → "Encoding" */
const gerund = (/** @type {string} */ verb) => `${verb.replace(/e$/, '')}ing`;

/** @param {ParentNode} root */
function queryElements(root) {
  /** @param {string} selector */
  const $ = (selector) => {
    const element = root.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`);
    return element;
  };
  /** @param {string} name */
  const radios = (name) =>
    /** @type {NodeListOf<HTMLInputElement>} */ (root.querySelectorAll(`input[name="${name}"]`));

  return {
    themeSelect: /** @type {HTMLSelectElement} */ ($('#theme-select')),
    codecSelect: /** @type {HTMLSelectElement} */ ($('#codec-select')),
    directionRadios: radios('direction'),
    encodeLabel: $('#direction-encode-label'),
    decodeLabel: $('#direction-decode-label'),
    guidance: $('#codec-guidance'),
    optionsPanel: /** @type {HTMLDetailsElement} */ ($('#options-panel')),
    optionsTitle: $('#options-title'),
    optionsCurrent: $('#options-current'),
    codecOptions: $('#codec-options'),
    input: /** @type {HTMLTextAreaElement} */ ($('#input')),
    inputLabel: $('#input-label'),
    inputCount: $('#input-count'),
    inputPanel: $('.panel--input'),
    inputMessage: $('#input-message'),
    openFileBtn: /** @type {HTMLButtonElement} */ ($('#open-file-btn')),
    fileInput: /** @type {HTMLInputElement} */ ($('#file-input')),
    clearBtn: /** @type {HTMLButtonElement} */ ($('#clear-btn')),
    notice: $('#encoded-notice'),
    noticeDescription: $('#notice-description'),
    noticeExamples: $('#notice-examples'),
    noticeConsequence: $('#notice-consequence'),
    noticeDecode: /** @type {HTMLButtonElement} */ ($('[data-action="decode"]')),
    noticeKeep: /** @type {HTMLButtonElement} */ ($('[data-action="keep"]')),
    noticeDismiss: /** @type {HTMLButtonElement} */ ($('[data-action="dismiss"]')),
    swapBtn: /** @type {HTMLButtonElement} */ ($('#swap-btn')),
    output: /** @type {HTMLTextAreaElement} */ ($('#output')),
    outputLabel: $('#output-label'),
    outputStats: $('#output-stats'),
    viewRadios: radios('view'),
    viewChangesRadio: /** @type {HTMLInputElement} */ ($('#view-changes')),
    viewPreviewRadio: /** @type {HTMLInputElement} */ ($('#view-preview')),
    viewPreviewLabel: $('#view-preview-label'),
    changes: $('#output-changes'),
    preview: $('#output-preview'),
    previewFrame: /** @type {HTMLIFrameElement} */ ($('#preview-frame')),
    problems: $('#output-problems'),
    optAutoCopy: /** @type {HTMLInputElement} */ ($('#opt-auto-copy')),
    optRemember: /** @type {HTMLInputElement} */ ($('#opt-remember')),
    copyBtn: /** @type {HTMLButtonElement} */ ($('#copy-btn')),
    downloadBtn: /** @type {HTMLButtonElement} */ ($('#download-btn')),
    status: $('#status'),
  };
}

/**
 * Remembers the last transform so state changes that don't affect the output
 * (ticking "auto-copy", switching view) don't re-process the text.
 */
function createDeriver() {
  /** @type {unknown[]} */
  let lastKey = [];
  /** @type {TransformResult} */
  let lastResult;

  /**
   * @param {AppState} state
   * @returns {TransformResult}
   */
  return (state) => {
    const options = state.codecOptions[state.codec];
    const key = [state.codec, state.direction, state.input, options];
    if (!lastResult || key.some((part, i) => part !== lastKey[i])) {
      lastKey = key;
      lastResult = transform({
        codec: state.codec,
        direction: state.direction,
        input: state.input,
        options,
      });
    }
    return lastResult;
  };
}

/**
 * Wire the page up. Kept separate from main.js so tests can run it against
 * a fresh DOM.
 *
 * @param {object} [options]
 * @param {ParentNode} [options.root]
 * @param {Storage | null} [options.storage] pass null to disable persistence
 */
export function init({ root = document, storage = getStorage() } = {}) {
  const els = queryElements(root);
  const listeners = new AbortController();
  const { signal } = listeners;
  const derive = createDeriver();
  const optionsPanel = createOptionsPanel(els.codecOptions);
  const preview = createPreview(els.previewFrame);

  for (const codec of CODECS) els.codecSelect.add(new Option(codec.label, codec.id));

  // ---- State --------------------------------------------------------------

  /** Set while debounced typing in a very large text waits to be committed. */
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let pendingInputTimer;

  /** Name of the file the input was loaded from, for the download name. */
  /** @type {string | null} */
  let sourceFileName = null;

  const saved = loadState(storage);
  const store = createStore({
    ...createDefaultState(),
    ...saved,
    // Text the browser restored into the field (back/forward, some reloads)
    // is newer than anything saved, so it wins.
    input: els.input.value || saved.input || '',
  });

  const saver = createDebouncedSaver(storage, store.get);
  store.subscribe((state, previous) => {
    if (!PERSISTED_KEYS.some((key) => state[key] !== previous[key])) return;
    saver.schedule();
    // Turning "remember" off should forget the text right away.
    if (state.rememberText !== previous.rememberText) saver.flush();
  });

  /**
   * Update one option of the current codec.
   *
   * @param {string} id
   * @param {string | boolean} value
   */
  function setOption(id, value) {
    store.set((state) => ({
      codecOptions: {
        ...state.codecOptions,
        [state.codec]: { ...state.codecOptions[state.codec], [id]: value },
      },
    }));
  }

  // ---- Feedback -----------------------------------------------------------

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let announceTimer;

  /** @param {string} message */
  function announce(message) {
    // Clear, then set after a beat, so the same message twice in a row is
    // still read out by screen readers.
    clearTimeout(announceTimer);
    els.status.textContent = '';
    announceTimer = setTimeout(() => {
      els.status.textContent = message;
    }, 50);
  }

  const copyFeedback = createButtonFeedback(els.copyBtn, {
    announce,
    states: {
      success: { label: 'Copied!', announce: 'Output copied to clipboard' },
      error: {
        label: 'Copy failed',
        announce: 'Copy failed. Select the output and copy it manually.',
      },
    },
  });

  // ---- Rendering ----------------------------------------------------------

  /** @type {{ text: string, ranges: unknown } | undefined} */
  let changesRenderedFor;

  /**
   * @param {AppState} state
   * @param {TransformResult} result
   */
  function renderNotice(state, result) {
    const codec = getCodec(state.codec);
    const show =
      state.direction === 'encode' &&
      !state.noticeDismissed &&
      result.alreadyEncoded.length > 0 &&
      Boolean(codec.alreadyEncoded);
    els.notice.hidden = !show;
    if (!show || !codec.alreadyEncoded) {
      els.input.removeAttribute('aria-describedby');
      return;
    }

    const { encode, decode } = codec.text;
    const keepOption = codec.options.find(
      (option) => option.id === codec.alreadyEncoded?.keepOption,
    );
    els.noticeDescription.textContent = codec.alreadyEncoded.description;
    els.noticeExamples.replaceChildren(
      ...result.alreadyEncoded.flatMap((example, i) => {
        const code = document.createElement('code');
        code.textContent = example;
        return i === 0 ? [code] : [', ', code];
      }),
    );
    els.noticeConsequence.textContent = `${gerund(encode.action)} it again will double-${encode.action.toLowerCase()} them.`;
    els.noticeDecode.textContent = `${decode.action} instead`;
    els.noticeKeep.hidden = !keepOption;
    els.noticeKeep.textContent = keepOption?.label ?? '';
    els.noticeDismiss.textContent = `${encode.action} anyway`;
    els.input.setAttribute('aria-describedby', 'encoded-notice');
  }

  /**
   * @param {AppState} state
   * @param {TransformResult} result
   */
  function renderOutputViews(state, result) {
    const codec = getCodec(state.codec);
    const changesAvailable = result.ranges !== null;
    const previewAvailable = Boolean(codec.preview);

    els.viewChangesRadio.disabled = !changesAvailable;
    els.viewPreviewRadio.hidden = !previewAvailable;
    els.viewPreviewLabel.hidden = !previewAvailable;

    // Remember the preferred view, but fall back to Text where it doesn't apply.
    let view = state.view;
    if ((view === 'changes' && !changesAvailable) || (view === 'preview' && !previewAvailable))
      view = 'text';
    for (const radio of els.viewRadios) radio.checked = radio.value === view;

    els.output.hidden = view !== 'text';
    els.changes.hidden = view !== 'changes';
    els.preview.hidden = view !== 'preview';

    if (view === 'changes' && result.ranges) {
      if (
        changesRenderedFor?.text !== result.output ||
        changesRenderedFor?.ranges !== result.ranges
      ) {
        renderChanges(els.changes, result.output, result.ranges);
        changesRenderedFor = { text: result.output, ranges: result.ranges };
      }
    }
    if (view === 'preview') preview.update(result.output, resolveTheme(state.theme));
  }

  /**
   * @param {TransformResult} result
   * @param {string} action  e.g. "Unescape", for "Can't unescape this: …"
   */
  function renderProblems(result, action) {
    const items = [];
    if (result.error) {
      const p = document.createElement('p');
      p.className = 'problem problem--error';
      p.textContent = `Can't ${action.toLowerCase()} this: ${result.error}`;
      items.push(p);
    }
    for (const warning of result.warnings) {
      const p = document.createElement('p');
      p.className = 'problem problem--warning';
      p.textContent = warning;
      items.push(p);
    }
    // Only touch the live region when something changed, to avoid repeat announcements.
    const signature = items.map((p) => p.className + p.textContent).join('|');
    if (els.problems.dataset.signature !== signature) {
      els.problems.replaceChildren(...items);
      els.problems.dataset.signature = signature;
    }
  }

  /** @param {AppState} state */
  function render(state) {
    const codec = getCodec(state.codec);
    const text = codec.text[state.direction];
    const result = derive(state);
    const options = state.codecOptions[state.codec];

    // Theme
    applyTheme(state.theme);
    els.themeSelect.value = state.theme;

    // Format and direction
    els.codecSelect.value = codec.id;
    for (const radio of els.directionRadios) radio.checked = radio.value === state.direction;
    els.encodeLabel.textContent = codec.text.encode.action;
    els.decodeLabel.textContent = codec.text.decode.action;
    els.guidance.textContent = codec.guidance;

    // Options
    const hasOptions = optionsPanel.render(codec, state.direction, options);
    els.optionsPanel.hidden = !hasOptions;
    els.optionsTitle.textContent = `${codec.label} options`;
    els.optionsCurrent.textContent = describeOptions(codec, state.direction, options);

    // Input
    els.inputLabel.textContent = text.inputLabel;
    els.input.placeholder = text.placeholder;
    // Only write when different, or the caret jumps to the end while typing.
    // Never while debounced typing is waiting to be committed.
    if (pendingInputTimer === undefined && els.input.value !== state.input) {
      els.input.value = state.input;
    }
    els.inputCount.textContent = pluralise(countCharacters(state.input), 'character');
    renderNotice(state, result);

    // Output
    els.outputLabel.textContent = text.outputLabel;
    els.output.value = result.output;
    const characters = pluralise(countCharacters(result.output), 'character');
    els.outputStats.textContent =
      result.output && result.count !== null
        ? `${characters} · ${text.describeCount(result.count)}`
        : characters;
    renderOutputViews(state, result);
    renderProblems(result, text.action);

    // Settings and buttons
    els.optAutoCopy.checked = state.autoCopy;
    els.optRemember.checked = state.rememberText;
    const undoAvailable = state.clearedInput !== null;
    els.clearBtn.textContent = undoAvailable ? 'Undo clear' : 'Clear';
    els.clearBtn.disabled = !state.input && !undoAvailable;
    els.copyBtn.disabled = result.output.length === 0;
    els.downloadBtn.disabled = result.output.length === 0;
    els.swapBtn.disabled = Boolean(result.error);
  }

  store.subscribe(render);

  // ---- Input -------------------------------------------------------------

  /** @param {string} message */
  function setInputMessage(message) {
    els.inputMessage.textContent = message;
  }

  /**
   * Put new input text into state, with the bookkeeping that goes with it.
   *
   * @param {string} input
   */
  function commitInput(input) {
    clearTimeout(pendingInputTimer);
    pendingInputTimer = undefined;
    const state = store.get();
    /** @type {Partial<AppState>} */
    const patch = { input };

    // New typing replaces whatever Undo would have restored.
    if (state.clearedInput !== null) {
      cancelUndo();
      patch.clearedInput = null;
    }
    // "Escape anyway" lasts until the text no longer looks encoded.
    const detector = getCodec(state.codec).alreadyEncoded;
    if (state.noticeDismissed && (!detector || detector.find(input).length === 0)) {
      patch.noticeDismissed = false;
    }
    store.set(patch);
  }

  /** Commit debounced typing now, before anything reads the state. */
  function flushPendingInput() {
    if (pendingInputTimer !== undefined) commitInput(els.input.value);
  }

  /** @param {File} file */
  async function loadFile(file) {
    flushPendingInput();
    const result = await readTextFile(file);
    if ('error' in result) {
      setInputMessage(result.error);
      announce(result.error);
      return;
    }
    sourceFileName = file.name;
    cancelUndo();
    store.set({ input: result.text, clearedInput: null, noticeDismissed: false });
    const message = `Opened "${file.name}" (${pluralise(countCharacters(result.text), 'character')}).`;
    setInputMessage(message);
    announce(message);
  }

  // ---- Actions ------------------------------------------------------------

  function downloadOutput() {
    flushPendingInput();
    const state = store.get();
    const { output } = derive(state);
    if (!output) return;
    const action = getCodec(state.codec).text[state.direction].action;
    const filename = downloadName(sourceFileName, state.codec, action);
    downloadText(output, filename);
    announce(`Downloading ${filename}`);
  }

  async function copyOutput() {
    flushPendingInput();
    const { output } = derive(store.get());
    if (!output) return;
    const copied = await copyText(output);
    copyFeedback.show(copied ? 'success' : 'error');
  }

  function swap() {
    flushPendingInput();
    const state = store.get();
    const result = derive(state);
    if (result.error) return;
    const direction = oppositeDirection(state.direction);
    cancelUndo();
    store.set({ input: result.output, direction, noticeDismissed: false, clearedInput: null });
    const action = getCodec(state.codec).text[direction].action.toLowerCase();
    announce(`Swapped. Now ${gerund(action)}.`);
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let undoTimer;

  function cancelUndo() {
    clearTimeout(undoTimer);
    undoTimer = undefined;
  }

  function clearOrUndo() {
    flushPendingInput();
    const { input, clearedInput } = store.get();
    cancelUndo();
    setInputMessage('');

    if (clearedInput !== null) {
      store.set({ input: clearedInput, clearedInput: null });
      announce('Text restored');
      els.input.focus();
      return;
    }

    store.set({ input: '', clearedInput: input, noticeDismissed: false });
    sourceFileName = null;
    announce('Text cleared. Undo is available for a few seconds.');
    undoTimer = setTimeout(() => {
      const hadFocus = document.activeElement === els.clearBtn;
      store.set({ clearedInput: null });
      // The button is now disabled, so don't leave focus stranded on it.
      if (hadFocus) els.input.focus();
    }, UNDO_CLEAR_MS);
  }

  // ---- Events -------------------------------------------------------------

  els.input.addEventListener(
    'input',
    (event) => {
      const input = els.input.value;
      const inputType = /** @type {InputEvent} */ (event).inputType ?? '';
      setInputMessage('');

      // Keep typing responsive in very large texts; pastes and drops apply at once.
      clearTimeout(pendingInputTimer);
      if (input.length > LARGE_INPUT_LENGTH && !inputType.startsWith('insertFrom')) {
        pendingInputTimer = setTimeout(() => commitInput(els.input.value), LARGE_INPUT_DELAY_MS);
        return;
      }
      commitInput(input);

      if (inputType === 'insertFromPaste' && store.get().autoCopy) copyOutput();
    },
    { signal },
  );

  els.themeSelect.addEventListener(
    'change',
    () => store.set({ theme: /** @type {AppState['theme']} */ (els.themeSelect.value) }),
    { signal },
  );
  // On "System", follow the OS switching between light and dark (the preview needs telling).
  watchSystemTheme(() => render(store.get()), signal);

  els.codecSelect.addEventListener(
    'change',
    () => store.set({ codec: els.codecSelect.value, noticeDismissed: false }),
    { signal },
  );

  for (const radio of els.directionRadios) {
    radio.addEventListener(
      'change',
      () => {
        if (radio.checked)
          store.set({ direction: /** @type {AppState['direction']} */ (radio.value) });
      },
      { signal },
    );
  }

  for (const radio of els.viewRadios) {
    radio.addEventListener(
      'change',
      () => {
        if (radio.checked) store.set({ view: /** @type {AppState['view']} */ (radio.value) });
      },
      { signal },
    );
  }

  els.codecOptions.addEventListener(
    'change',
    (event) => {
      const change = readOptionChange(event);
      if (change) setOption(change.id, change.value);
    },
    { signal },
  );

  els.clearBtn.addEventListener('click', clearOrUndo, { signal });
  els.swapBtn.addEventListener('click', swap, { signal });
  els.copyBtn.addEventListener('click', copyOutput, { signal });
  els.downloadBtn.addEventListener('click', downloadOutput, { signal });

  // Open a file with the button, or by dropping it anywhere on the page.
  els.openFileBtn.addEventListener('click', () => els.fileInput.click(), { signal });
  els.fileInput.addEventListener(
    'change',
    () => {
      const file = els.fileInput.files?.[0];
      if (file) loadFile(file);
      els.fileInput.value = ''; // so choosing the same file again still fires
    },
    { signal },
  );
  const dropTarget = root === document ? document : root;
  dropTarget.addEventListener(
    'dragover',
    (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      if (!hasFiles(dragEvent.dataTransfer)) return;
      // Without this the browser would open the file and leave the page.
      dragEvent.preventDefault();
      if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'copy';
      els.inputPanel.classList.add('is-drop-target');
    },
    { signal },
  );
  dropTarget.addEventListener(
    'dragleave',
    (event) => {
      // relatedTarget is null when the pointer leaves the window.
      if (!(/** @type {DragEvent} */ (event).relatedTarget)) {
        els.inputPanel.classList.remove('is-drop-target');
      }
    },
    { signal },
  );
  dropTarget.addEventListener(
    'drop',
    (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      els.inputPanel.classList.remove('is-drop-target');
      const file = dragEvent.dataTransfer?.files?.[0];
      if (!hasFiles(dragEvent.dataTransfer) || !file) return;
      dragEvent.preventDefault();
      loadFile(file);
    },
    { signal },
  );
  els.optAutoCopy.addEventListener(
    'change',
    () => store.set({ autoCopy: els.optAutoCopy.checked }),
    {
      signal,
    },
  );
  els.optRemember.addEventListener(
    'change',
    () => store.set({ rememberText: els.optRemember.checked }),
    {
      signal,
    },
  );

  els.notice.addEventListener(
    'click',
    (event) => {
      const button = /** @type {HTMLElement} */ (event.target).closest('button[data-action]');
      if (!button) return;
      const codec = getCodec(store.get().codec);
      const action = button.getAttribute('data-action');
      if (action === 'decode') {
        store.set({ direction: 'decode' });
        announce(`Switched to ${codec.text.decode.action.toLowerCase()}`);
      } else if (action === 'keep' && codec.alreadyEncoded?.keepOption) {
        setOption(codec.alreadyEncoded.keepOption, true);
        announce(`${codec.alreadyEncoded.description} will be kept as they are`);
      } else if (action === 'dismiss') {
        store.set({ noticeDismissed: true });
      }
      // The notice (and the button that had focus) has gone, so move focus somewhere useful.
      els.input.focus();
    },
    { signal },
  );

  bindShortcuts(root === document ? document : root, { onCopy: copyOutput, onSwap: swap }, signal);
  applyModifierLabels(root);

  // bfcache restores can leave the field and the state out of step.
  window.addEventListener(
    'pageshow',
    () => {
      if (els.input.value !== store.get().input) store.set({ input: els.input.value });
    },
    { signal },
  );
  window.addEventListener(
    'pagehide',
    () => {
      flushPendingInput();
      saver.flush();
    },
    { signal },
  );

  render(store.get());

  return {
    store,
    /** Remove every listener and timer (used by tests). */
    destroy() {
      listeners.abort();
      cancelUndo();
      clearTimeout(pendingInputTimer);
      clearTimeout(announceTimer);
      copyFeedback.reset();
      preview.cancel();
      saver.cancel();
    },
  };
}
