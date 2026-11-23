import { trackedReplace } from '../lib/tracked-replace.js';
import { countWith, pluralise } from '../lib/format.js';

/** @type {Record<string, string>} */
const SHORT_ESCAPES = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
  '\v': '\\v',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** @type {Record<string, string>} */
const QUOTES = { single: "'", double: '"', backtick: '`' };

/** @type {Record<string, string>} */
const DECODE_SINGLE = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };

/** @param {number} code */
const hex2 = (code) => code.toString(16).toUpperCase().padStart(2, '0');
/** @param {number} code */
const hex4 = (code) => code.toString(16).toUpperCase().padStart(4, '0');

/** @type {Map<string, RegExp>} */
const patterns = new Map();

/**
 * @param {string} quote
 * @param {boolean} nonAscii
 * @param {boolean} scriptSafe
 */
function encodePattern(quote, nonAscii, scriptSafe) {
  const key = `${quote}:${nonAscii}:${scriptSafe}`;
  let pattern = patterns.get(key);
  if (!pattern) {
    const alternatives = [
      // backslash, the quote in use, control characters, DEL, U+2028/2029
      `[\\\\${quote === '`' ? '`' : quote}\\0-\\x1F\\x7F\\u2028\\u2029]`,
      // lone surrogates (only matched alone thanks to the u flag)
      '[\\uD800-\\uDFFF]',
    ];
    if (quote === '`') alternatives.push('\\$\\{');
    if (scriptSafe) alternatives.push('<');
    if (nonAscii) alternatives.push('[^\\0-\\x7F]');
    pattern = new RegExp(alternatives.join('|'), 'gu');
    patterns.set(key, pattern);
  }
  return pattern;
}

/** @type {import('./types.js').Codec} */
export default {
  id: 'javascript',
  label: 'JavaScript',
  guidance:
    'Escapes text for use inside a JavaScript string literal; paste the result between quotes of the chosen style. Tick "Safe inside <script>" if the code sits inline in an HTML page.',

  text: {
    encode: {
      action: 'Escape',
      inputLabel: 'Text to escape',
      outputLabel: 'JavaScript string contents',
      placeholder: 'Paste text to put inside a JavaScript string…',
      describeCount: (n) => countWith(n, 'escaped'),
    },
    decode: {
      action: 'Unescape',
      inputLabel: 'JavaScript string to unescape',
      outputLabel: 'Unescaped text',
      placeholder: 'Paste string contents, e.g. It\\u2019s a \\"test\\"\\n',
      describeCount: (n) => countWith(n, 'decoded'),
    },
  },

  options: [
    {
      type: 'select',
      id: 'quote',
      label: 'String quotes',
      directions: ['encode'],
      default: 'single',
      choices: [
        { value: 'single', label: "Single ' '" },
        { value: 'double', label: 'Double " "' },
        { value: 'backtick', label: 'Template ` ` (also escapes ${)' },
      ],
    },
    {
      type: 'select',
      id: 'nonAscii',
      label: 'Non-ASCII (é, —, 😀)',
      directions: ['encode'],
      default: 'keep',
      choices: [
        { value: 'keep', label: 'Leave as is' },
        { value: 'escape', label: 'Escape (\\u00E9, \\u{1F600})', hint: 'Output is pure ASCII.' },
      ],
    },
    {
      type: 'checkbox',
      id: 'scriptSafe',
      label: 'Safe inside <script>',
      directions: ['encode'],
      default: false,
      hint: 'Escapes < as \\x3C so the text can never close the script tag early.',
    },
  ],

  encode(input, options) {
    const quote = QUOTES[String(options.quote)] ?? QUOTES.single;
    const pattern = encodePattern(
      quote,
      options.nonAscii === 'escape',
      Boolean(options.scriptSafe),
    );
    return trackedReplace(input, pattern, (match) => {
      if (match === quote) return `\\${quote}`;
      if (match === '${') return '\\${';
      if (match === '<') return '\\x3C';
      const short = SHORT_ESCAPES[match];
      if (short) return short;
      const code = /** @type {number} */ (match.codePointAt(0));
      if (code < 0x100) return `\\x${hex2(code)}`;
      if (code > 0xffff) return `\\u{${code.toString(16).toUpperCase()}}`;
      return `\\u${hex4(code)}`;
    });
  },

  decode(input) {
    let invalid = 0;
    const result = trackedReplace(
      input,
      /\\(u\{[0-9A-Fa-f]+\}|u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|\r\n|[0-7]{1,3}|[\s\S])?/g,
      (match, groups) => {
        const escape = groups[1];
        if (escape === undefined) {
          invalid++; // a lone backslash at the very end
          return match;
        }
        const first = escape[0];
        if (first === 'u' && escape.length > 1) {
          const code = parseInt(escape[1] === '{' ? escape.slice(2, -1) : escape.slice(1), 16);
          if (code > 0x10ffff) {
            invalid++;
            return match;
          }
          return String.fromCodePoint(code);
        }
        if (first === 'x' && escape.length === 3)
          return String.fromCharCode(parseInt(escape.slice(1), 16));
        if (first === 'u' || first === 'x') {
          invalid++; // \u or \x without enough hex digits
          return match;
        }
        if (/^[0-7]/.test(escape)) {
          // \0 is NUL; anything else is a legacy octal escape (max \377).
          let digits = escape;
          if (parseInt(digits, 8) > 0o377) digits = digits.slice(0, 2);
          return String.fromCharCode(parseInt(digits, 8)) + escape.slice(digits.length);
        }
        // A backslash before a line break is a line continuation.
        if (/^(?:\r\n|[\n\r\u2028\u2029])$/.test(escape)) return '';
        return DECODE_SINGLE[escape] ?? escape;
      },
    );
    return invalid
      ? {
          ...result,
          warnings: [
            `${pluralise(invalid, 'invalid escape')} left as ${invalid === 1 ? 'it is' : 'they are'}.`,
          ],
        }
      : result;
  },
};
