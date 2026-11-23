import { DEFAULT_CODEC_ID, defaultCodecOptions } from '../codecs/index.js';

/** @typedef {'text' | 'changes' | 'preview'} View */
/** @typedef {'system' | 'light' | 'dark'} Theme */

/** @type {readonly View[]} */
export const VIEWS = Object.freeze(['text', 'changes', 'preview']);

/** @type {readonly Theme[]} */
export const THEMES = Object.freeze(['system', 'light', 'dark']);

/**
 * The shape of the app's state, with defaults.
 *
 * @typedef {object} AppState
 * @property {string} codec                  id of the selected format (see src/codecs)
 * @property {import('../codecs/types.js').Direction} direction
 * @property {string} input
 * @property {Record<string, import('../codecs/types.js').OptionValues>} codecOptions
 *   option values for every codec, keyed by codec id, so switching format
 *   and back keeps your settings
 * @property {View} view                     how the output is shown
 * @property {Theme} theme                   'system' follows the OS setting
 * @property {boolean} autoCopy              copy output straight after a paste
 * @property {boolean} rememberText          persist `input` in localStorage
 * @property {boolean} noticeDismissed       user chose "Escape anyway" (not persisted)
 * @property {string | null} clearedInput    text removed by Clear, while Undo is offered (not persisted)
 */

/** @returns {AppState} */
export function createDefaultState() {
  return {
    codec: DEFAULT_CODEC_ID,
    direction: 'encode',
    input: '',
    codecOptions: defaultCodecOptions(),
    view: 'text',
    theme: 'system',
    autoCopy: false,
    rememberText: true,
    noticeDismissed: false,
    clearedInput: null,
  };
}

/** Keys written to localStorage. Anything else is session-only. */
export const PERSISTED_KEYS = Object.freeze(
  /** @type {const} */ ([
    'codec',
    'direction',
    'input',
    'codecOptions',
    'view',
    'theme',
    'autoCopy',
    'rememberText',
  ]),
);
