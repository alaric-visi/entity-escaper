/**
 * The contract every codec in src/codecs/ implements. Types only: this file
 * has no runtime code.
 *
 * Adding a format = one new file exporting a `Codec`, plus one line in
 * src/codecs/index.js. The UI (format picker, labels, options panel, notices,
 * views) is generated from these objects.
 */

/** @typedef {'encode' | 'decode'} Direction */

/** @typedef {Record<string, string | boolean>} OptionValues */

/**
 * @typedef {object} Choice
 * @property {string} value
 * @property {string} label
 * @property {string} [hint]  shown under the control while this choice is selected
 */

/**
 * @typedef {object} SelectOption
 * @property {'select'} type
 * @property {string} id
 * @property {string} label
 * @property {Direction[]} directions  which directions the option affects
 * @property {Choice[]} choices
 * @property {string} default
 * @property {boolean} [lossy]  non-default values mean decoding won't give back the original
 */

/**
 * @typedef {object} CheckboxOption
 * @property {'checkbox'} type
 * @property {string} id
 * @property {string} label
 * @property {Direction[]} directions
 * @property {boolean} default
 * @property {string} [hint]
 * @property {boolean} [lossy]
 */

/** @typedef {SelectOption | CheckboxOption} CodecOption */

/**
 * @typedef {object} CodecResult
 * @property {string} text
 * @property {number | null} count  how many things changed; null when not meaningful
 * @property {Array<[number, number]> | null} ranges
 *   [start, end) offsets in `text` that were produced by a change, for the
 *   "Changes" view; null when the output is wholly new (e.g. Base64)
 * @property {string} [error]  set when the input can't be processed; `text` is then ''
 * @property {string[]} [warnings]  processed, but something deserves attention
 */

/**
 * @typedef {object} DirectionText
 * @property {string} action       button-style verb: "Escape", "Decode"
 * @property {string} inputLabel
 * @property {string} outputLabel
 * @property {string} placeholder
 * @property {(count: number) => string} describeCount  e.g. 3 → "3 replaced"
 */

/**
 * @typedef {object} AlreadyEncoded
 * @property {(input: string) => string[]} find  up to three examples found in the input
 * @property {string} description  plural noun phrase: "HTML entities"
 * @property {string} [keepOption]  id of the checkbox option that leaves them alone
 */

/**
 * @typedef {object} Codec
 * @property {string} id
 * @property {string} label
 * @property {string} guidance  one or two sentences on when (not) to use it
 * @property {Record<Direction, DirectionText>} text
 * @property {CodecOption[]} options
 * @property {(input: string, options: OptionValues) => CodecResult} encode
 * @property {(input: string, options: OptionValues) => CodecResult} decode
 * @property {boolean} [preview]  output can be shown rendered in a sandboxed page
 * @property {AlreadyEncoded} [alreadyEncoded]  warn before double-encoding
 */

export {};
