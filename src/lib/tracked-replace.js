/**
 * Like `String.prototype.replace` with a callback, but also reports how many
 * matches actually changed and where each replacement landed in the output,
 * which is what the "Changes" view highlights.
 *
 * Return the match unchanged from `replacer` to leave it alone; it then isn't
 * counted or highlighted.
 *
 * @param {string} text
 * @param {RegExp} pattern must have the `g` flag
 * @param {(match: string, groups: RegExpMatchArray) => string} replacer
 * @returns {{ text: string, count: number, ranges: Array<[number, number]> }}
 */
export function trackedReplace(text, pattern, replacer) {
  if (!pattern.global) throw new TypeError('trackedReplace needs a global (g) pattern');

  /** @type {string[]} */
  const parts = [];
  /** @type {Array<[number, number]>} */
  const ranges = [];
  let outputLength = 0;
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    const index = /** @type {number} */ (match.index);
    if (index > last) {
      parts.push(text.slice(last, index));
      outputLength += index - last;
    }
    const original = match[0];
    const replacement = replacer(original, match);
    if (replacement !== original) {
      ranges.push([outputLength, outputLength + replacement.length]);
    }
    parts.push(replacement);
    outputLength += replacement.length;
    last = index + original.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return { text: parts.join(''), count: ranges.length, ranges };
}

/**
 * Add fixed text before and after a tracked result, shifting its ranges and
 * marking the additions as changes.
 *
 * @param {{ text: string, count: number, ranges: Array<[number, number]> }} result
 * @param {string} before
 * @param {string} after
 */
export function wrapTracked(result, before, after) {
  if (!before && !after) return result;
  /** @type {Array<[number, number]>} */
  const ranges = [];
  if (before) ranges.push([0, before.length]);
  for (const [start, end] of result.ranges)
    ranges.push([start + before.length, end + before.length]);
  const bodyEnd = before.length + result.text.length;
  if (after) ranges.push([bodyEnd, bodyEnd + after.length]);
  return { text: before + result.text + after, count: result.count, ranges };
}
