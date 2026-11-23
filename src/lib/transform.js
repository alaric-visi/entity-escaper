import { getCodec } from '../codecs/index.js';

/** @typedef {import('../codecs/types.js').Direction} Direction */

/**
 * @param {Direction} direction
 * @returns {Direction}
 */
export function oppositeDirection(direction) {
  return direction === 'encode' ? 'decode' : 'encode';
}

/**
 * @typedef {object} TransformResult
 * @property {string} output
 * @property {number | null} count
 * @property {Array<[number, number]> | null} ranges
 * @property {string | undefined} error
 * @property {string[]} warnings
 * @property {string[]} alreadyEncoded  examples, when encoding text that already looks encoded
 */

/**
 * Everything the UI shows that is derived from the input, in one pure call.
 *
 * @param {{ codec: string, direction: Direction, input: string, options: import('../codecs/types.js').OptionValues }} params
 * @returns {TransformResult}
 */
export function transform({ codec: codecId, direction, input, options }) {
  const codec = getCodec(codecId);
  const result =
    direction === 'decode' ? codec.decode(input, options) : codec.encode(input, options);
  const keepOption = codec.alreadyEncoded?.keepOption;
  const alreadyEncoded =
    direction === 'encode' && codec.alreadyEncoded && !(keepOption && options[keepOption])
      ? codec.alreadyEncoded.find(input)
      : [];

  return {
    output: result.error ? '' : result.text,
    count: result.error ? null : result.count,
    ranges: result.error ? null : result.ranges,
    error: result.error,
    warnings: result.warnings ?? [],
    alreadyEncoded,
  };
}
