/**
 * The codec registry. To add a format: create src/codecs/<name>.js exporting
 * a Codec (see types.js), then add it to this list. The UI, persistence and
 * the contract tests all pick it up from here.
 */
import html from './html.js';
import url from './url.js';
import javascript from './javascript.js';
import json from './json.js';
import base64 from './base64.js';
import xml from './xml.js';

/** @typedef {import('./types.js').Codec} Codec */
/** @typedef {import('./types.js').Direction} Direction */
/** @typedef {import('./types.js').OptionValues} OptionValues */
/** @typedef {import('./types.js').CodecOption} CodecOption */

/** @type {readonly Codec[]} */
export const CODECS = Object.freeze([html, url, javascript, json, base64, xml]);

export const DEFAULT_CODEC_ID = 'html';

/** @type {readonly Direction[]} */
export const DIRECTIONS = Object.freeze(['encode', 'decode']);

/**
 * @param {string} id
 * @returns {Codec}
 */
export function getCodec(id) {
  return CODECS.find((codec) => codec.id === id) ?? CODECS[0];
}

/** @param {unknown} id */
export function isCodecId(id) {
  return CODECS.some((codec) => codec.id === id);
}

/**
 * @param {Codec} codec
 * @returns {OptionValues}
 */
export function defaultOptions(codec) {
  return Object.fromEntries(codec.options.map((option) => [option.id, option.default]));
}

/** @returns {Record<string, OptionValues>} defaults for every codec, keyed by id */
export function defaultCodecOptions() {
  return Object.fromEntries(CODECS.map((codec) => [codec.id, defaultOptions(codec)]));
}

/**
 * Is `value` an allowed value for `option`?
 *
 * @param {CodecOption} option
 * @param {unknown} value
 */
export function isValidOptionValue(option, value) {
  return option.type === 'checkbox'
    ? typeof value === 'boolean'
    : option.choices.some((choice) => choice.value === value);
}

/**
 * Codec defaults, overlaid with any valid values from `values` (e.g. read
 * back from storage). Unknown keys and invalid values are dropped.
 *
 * @param {Codec} codec
 * @param {unknown} values
 * @returns {OptionValues}
 */
export function sanitiseOptions(codec, values) {
  const result = defaultOptions(codec);
  if (!values || typeof values !== 'object') return result;
  for (const option of codec.options) {
    const value = /** @type {Record<string, unknown>} */ (values)[option.id];
    if (isValidOptionValue(option, value))
      result[option.id] = /** @type {string | boolean} */ (value);
  }
  return result;
}

/**
 * The options that affect a given direction.
 *
 * @param {Codec} codec
 * @param {Direction} direction
 */
export function optionsFor(codec, direction) {
  return codec.options.filter((option) => option.directions.includes(direction));
}
