/**
 * HTML escaping. Pure functions, no DOM access, so everything in this file
 * can be unit-tested in Node.
 */
import { encodeNonAsciiHTML } from 'entities';
import { ENTITY_CANDIDATE_SOURCE, isEntity } from './entities.js';
import { trackedReplace, wrapTracked } from './tracked-replace.js';

/** @type {Readonly<Record<string, string>>} */
const NAMED = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' });

/** Text wrapped around the output by the `wrap` option. */
export const WRAPPERS = Object.freeze({
  none: ['', ''],
  'pre-code': ['<pre><code>', '</code></pre>'],
  pre: ['<pre>', '</pre>'],
  code: ['<code>', '</code>'],
});

/**
 * @typedef {object} EscapeOptions
 * @property {'attribute' | 'text'} [characters]
 *   'attribute' (default): & < > " '. Safe in element text and quoted attributes.
 *   'text': & < > only. Fine in element text, NOT in attribute values.
 * @property {'keep' | 'numeric' | 'named'} [nonAscii]
 *   What to do with characters beyond ASCII (é, —, 😀). 'named' uses names
 *   such as &eacute; where HTML has one and numeric references otherwise.
 * @property {'decimal' | 'hex'} [numbers]  &#39; or &#x27;
 * @property {'numeric' | 'named'} [apostrophe]  &#39; (works everywhere) or &apos; (HTML5)
 * @property {boolean} [keepExistingEntities]
 *   Leave real entities already in the text (e.g. &amp;) as they are instead
 *   of double-escaping them.
 * @property {boolean} [lineBreaks]  turn line breaks into <br> plus a newline
 * @property {'keep' | '2' | '4'} [tabs]  turn tabs into this many spaces
 * @property {keyof typeof WRAPPERS} [wrap]  wrap the whole output in tags
 */

/** @type {Required<EscapeOptions>} */
export const DEFAULT_ESCAPE_OPTIONS = Object.freeze({
  characters: 'attribute',
  nonAscii: 'keep',
  numbers: 'decimal',
  apostrophe: 'numeric',
  keepExistingEntities: false,
  lineBreaks: false,
  tabs: 'keep',
  wrap: 'none',
});

/** @type {Map<string, RegExp>} */
const patternCache = new Map();

/** @param {Required<EscapeOptions>} o */
function patternFor(o) {
  const key = [
    o.characters,
    o.nonAscii !== 'keep',
    o.keepExistingEntities,
    o.lineBreaks,
    o.tabs !== 'keep',
  ].join();
  let pattern = patternCache.get(key);
  if (!pattern) {
    const alternatives = [];
    // Entities first, so `&amp;` is matched whole before its `&` is.
    if (o.keepExistingEntities) alternatives.push(ENTITY_CANDIDATE_SOURCE);
    alternatives.push(o.characters === 'text' ? '[&<>]' : `[&<>"']`);
    if (o.lineBreaks) alternatives.push('\\r\\n|\\r|\\n');
    if (o.tabs !== 'keep') alternatives.push('\\t');
    if (o.nonAscii !== 'keep') alternatives.push('[^\\0-\\x7F]');
    pattern = new RegExp(alternatives.join('|'), 'gu');
    patternCache.set(key, pattern);
  }
  return pattern;
}

/**
 * @param {number} codePoint
 * @param {'decimal' | 'hex'} numbers
 */
function numericReference(codePoint, numbers) {
  return numbers === 'hex' ? `&#x${codePoint.toString(16).toUpperCase()};` : `&#${codePoint};`;
}

/**
 * Escape text for HTML, reporting how many things were replaced and where.
 *
 * @param {string} text
 * @param {EscapeOptions} [options]
 */
export function escapeHtmlTracked(text, options = {}) {
  /** @type {Required<EscapeOptions>} */
  const o = { ...DEFAULT_ESCAPE_OPTIONS, ...options };
  const tabSpaces = o.tabs === 'keep' ? '' : ' '.repeat(Number(o.tabs));

  const result = trackedReplace(String(text), patternFor(o), (match) => {
    if (match[0] === '&' && match.length > 1) {
      // Entity-shaped. Real ones stay; for unknown ones (`&foo;`) the rest is
      // only letters, digits, `#` and `;`, so only the `&` needs escaping.
      return isEntity(match) ? match : `&amp;${match.slice(1)}`;
    }
    const named = NAMED[match];
    if (named) return named;
    if (match === "'") return o.apostrophe === 'named' ? '&apos;' : numericReference(39, o.numbers);
    if (match === '\t') return tabSpaces;
    if (match === '\n' || match === '\r' || match === '\r\n') return `<br>${match}`;

    // Beyond ASCII.
    const codePoint = /** @type {number} */ (match.codePointAt(0));
    if (o.nonAscii === 'named') {
      const encoded = encodeNonAsciiHTML(match);
      if (!encoded.startsWith('&#')) return encoded;
    }
    return numericReference(codePoint, o.numbers);
  });

  const [before, after] = WRAPPERS[o.wrap] ?? WRAPPERS.none;
  return wrapTracked(result, before, after);
}

/**
 * Escape text for HTML, and report how many things were replaced.
 *
 * @param {string} text
 * @param {EscapeOptions} [options]
 * @returns {{ text: string, count: number }}
 */
export function escapeHtmlWithCount(text, options) {
  const { text: escaped, count } = escapeHtmlTracked(text, options);
  return { text: escaped, count };
}

/**
 * Escape the HTML-significant characters so the text renders literally.
 * With the default options: & < > " ' become &amp; &lt; &gt; &quot; &#39;,
 * which is safe in element text and in quoted attribute values.
 *
 * This is NOT a sanitiser, and is not enough inside <script>, <style> or
 * URL-valued attributes such as href.
 *
 * @param {string} text
 * @param {EscapeOptions} [options]
 * @returns {string}
 */
export function escapeHtml(text, options) {
  return escapeHtmlTracked(text, options).text;
}
