const numberFormat = new Intl.NumberFormat('en-GB');

/**
 * Count characters as people see them: an emoji such as 😀 is one character,
 * even though JavaScript's `.length` counts it as two (a surrogate pair).
 *
 * @param {string} text
 */
export function countCharacters(text) {
  let count = text.length;
  for (let i = 0; i < text.length - 1; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        count--;
        i++;
      }
    }
  }
  return count;
}

/**
 * "1 character", "1,234 characters"
 *
 * @param {number} n
 * @param {string} singular
 * @param {string} [plural]
 */
export function pluralise(n, singular, plural = `${singular}s`) {
  return `${numberFormat.format(n)} ${n === 1 ? singular : plural}`;
}

/**
 * "1,234 replaced"
 *
 * @param {number} n
 * @param {string} word
 */
export function countWith(n, word) {
  return `${numberFormat.format(n)} ${word}`;
}

/**
 * Describe a character for messages: printable ones in quotes, others by code.
 *
 * @param {string} char
 */
export function describeChar(char) {
  const code = /** @type {number} */ (char.codePointAt(0));
  const hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(char) ? `"${char}"` : hex;
}
