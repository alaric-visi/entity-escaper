import { trackedReplace } from '../lib/tracked-replace.js';
import { countWith, describeChar } from '../lib/format.js';

/** @type {Record<string, string>} */
const SHORT_ESCAPES = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** @type {Record<string, string>} */
const DECODE_SINGLE = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/** @param {number} code */
const u4 = (code) => `\\u${code.toString(16).padStart(4, '0')}`;

/** @type {Map<string, RegExp>} */
const patterns = new Map();

/**
 * @param {boolean} nonAscii
 * @param {boolean} scriptSafe
 */
function encodePattern(nonAscii, scriptSafe) {
  const key = `${nonAscii}:${scriptSafe}`;
  let pattern = patterns.get(key);
  if (!pattern) {
    // With the `u` flag, \uD800-\uDFFF only matches *lone* surrogates; a
    // valid pair such as 😀 is one code point and is left alone unless
    // non-ASCII escaping is on.
    let chars = '"\\\\\\0-\\x1F\\u2028\\u2029\\uD800-\\uDFFF';
    if (scriptSafe) chars += '<>&';
    if (nonAscii) chars += '\\x80-\\u{10FFFF}';
    pattern = new RegExp(`[${chars}]`, 'gu');
    patterns.set(key, pattern);
  }
  return pattern;
}

/**
 * Decode JSON string contents strictly. Returns an error message with the
 * position of the first problem instead of guessing.
 *
 * @param {string} input
 * @returns {import('./types.js').CodecResult}
 */
function decodeStrict(input) {
  /** @type {string | undefined} */
  let error;
  const result = trackedReplace(
    input,
    // Raw control characters are matched on purpose: JSON forbids them unescaped.
    // eslint-disable-next-line no-control-regex
    /\\(?:u([0-9A-Fa-f]{4})|([\s\S]))?|["\0-\x1F]/g,
    (match, groups) => {
      if (error) return match;
      const index = /** @type {number} */ (groups.index);
      if (match === '"') {
        error = `Unescaped " at position ${index + 1}. Inside a JSON string it must be written \\".`;
      } else if (match.length === 1 && match !== '\\') {
        error = `Unescaped control character ${describeChar(match)} at position ${index + 1}. JSON needs it written as an escape, e.g. \\n.`;
      } else if (groups[1]) {
        return String.fromCharCode(parseInt(groups[1], 16));
      } else if (groups[2] !== undefined && groups[2] in DECODE_SINGLE) {
        return DECODE_SINGLE[groups[2]];
      } else {
        const what =
          groups[2] === undefined
            ? 'a lone \\ at the end'
            : `\\${groups[2] === 'u' ? 'u without 4 hex digits' : groups[2]}`;
        error = `Invalid escape (${what}) at position ${index + 1}. JSON only allows \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX.`;
      }
      return match;
    },
  );
  return error ? { text: '', count: null, ranges: null, error } : result;
}

/** @type {import('./types.js').Codec} */
export default {
  id: 'json',
  label: 'JSON',
  guidance:
    'Escapes text for use inside a JSON string value (between the double quotes). Unescaping is strict, so it doubles as a check that a JSON string is valid.',

  text: {
    encode: {
      action: 'Escape',
      inputLabel: 'Text to escape',
      outputLabel: 'JSON string contents',
      placeholder: 'Paste text to put inside a JSON string…',
      describeCount: (n) => countWith(n, 'escaped'),
    },
    decode: {
      action: 'Unescape',
      inputLabel: 'JSON string to unescape',
      outputLabel: 'Unescaped text',
      placeholder: 'Paste string contents (with or without the quotes), e.g. Line 1\\nLine 2',
      describeCount: (n) => countWith(n, 'decoded'),
    },
  },

  options: [
    {
      type: 'select',
      id: 'nonAscii',
      label: 'Non-ASCII (é, —, 😀)',
      directions: ['encode'],
      default: 'keep',
      choices: [
        { value: 'keep', label: 'Leave as is', hint: 'Valid JSON; files are UTF-8 by definition.' },
        {
          value: 'escape',
          label: 'Escape (\\u00e9)',
          hint: 'Pure ASCII output, as JSON.stringify does in some languages.',
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'scriptSafe',
      label: 'Safe inside <script>',
      directions: ['encode'],
      default: false,
      hint: 'Escapes < > & as \\u003C \\u003E \\u0026 for JSON embedded in an HTML page.',
    },
  ],

  encode(input, options) {
    const pattern = encodePattern(options.nonAscii === 'escape', Boolean(options.scriptSafe));
    return trackedReplace(input, pattern, (match) => {
      const short = SHORT_ESCAPES[match];
      if (short) return short;
      // JSON's only escape for a character beyond U+FFFF is its surrogate pair.
      let escaped = '';
      for (let i = 0; i < match.length; i++) escaped += u4(match.charCodeAt(i));
      return escaped;
    });
  },

  decode(input) {
    const result = decodeStrict(input);
    // Accept a whole JSON string literal, quotes included, if that's what was pasted.
    if (result.error && input.length >= 2 && input.startsWith('"') && input.endsWith('"')) {
      const inner = decodeStrict(input.slice(1, -1));
      if (!inner.error) {
        return { ...inner, warnings: ['The surrounding quotes were removed.'] };
      }
    }
    return result;
  },
};
