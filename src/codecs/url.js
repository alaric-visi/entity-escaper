import { trackedReplace } from '../lib/tracked-replace.js';
import { countWith, pluralise } from '../lib/format.js';

const utf8 = new TextEncoder();

/**
 * Characters each variant leaves alone. Everything else is percent-encoded
 * as UTF-8 bytes.
 *
 * @type {Record<string, string>}
 */
const SAFE = {
  // encodeURIComponent: unreserved characters only
  component: "A-Za-z0-9\\-_.!~*'()",
  // encodeURI: unreserved plus the characters that give a URL its structure
  uri: "A-Za-z0-9\\-_.!~*'();,/?:@&=+$#",
  // application/x-www-form-urlencoded (space becomes +)
  form: 'A-Za-z0-9*\\-._',
};

/** What decodeURI refuses to decode, so a full URL keeps its structure. */
const RESERVED = new Set(';,/?:@&=+$#');

/** @param {string} char */
function percentEncode(char) {
  let out = '';
  for (const byte of utf8.encode(char))
    out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  return out;
}

/** @type {Map<string, RegExp>} */
const encodePatterns = new Map();

/**
 * @param {string} variant
 * @param {boolean} keepExisting
 */
function encodePattern(variant, keepExisting) {
  const key = `${variant}:${keepExisting}`;
  let pattern = encodePatterns.get(key);
  if (!pattern) {
    const unsafe = `[^${SAFE[variant] ?? SAFE.component}]`;
    // With keepExisting, a valid %XX is matched whole and left alone.
    pattern = new RegExp(keepExisting ? `%[0-9A-Fa-f]{2}|${unsafe}` : unsafe, 'gu');
    encodePatterns.set(key, pattern);
  }
  return pattern;
}

/** Bytes in a UTF-8 sequence, from its first byte; 0 if it can't start one. */
function sequenceLength(/** @type {number} */ byte) {
  if (byte < 0x80) return 1;
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return 0;
}

/** @type {import('./types.js').Codec} */
export default {
  id: 'url',
  label: 'URL',
  guidance:
    'Percent-encoding for URLs. Use "Component" for a single query value or path segment, and "Whole URL" when the slashes, ? and & must keep working.',

  text: {
    encode: {
      action: 'Encode',
      inputLabel: 'Text to encode',
      outputLabel: 'Encoded URL text',
      placeholder: 'Paste text to percent-encode, e.g. a search term or file name…',
      describeCount: (n) => countWith(n, 'encoded'),
    },
    decode: {
      action: 'Decode',
      inputLabel: 'URL text to decode',
      outputLabel: 'Decoded text',
      placeholder: 'Paste percent-encoded text, e.g. caf%C3%A9%20menu',
      describeCount: (n) => countWith(n, 'decoded'),
    },
  },

  options: [
    {
      type: 'select',
      id: 'variant',
      label: 'Encode as',
      directions: ['encode', 'decode'],
      default: 'component',
      choices: [
        {
          value: 'component',
          label: 'Component (query value, path segment)',
          hint: 'Like encodeURIComponent: also encodes / ? & = # so they can sit inside one value.',
        },
        {
          value: 'uri',
          label: 'Whole URL',
          hint: 'Like encodeURI: keeps / ? & = # : working. Leaves encoded ones (%2F) alone when decoding.',
        },
        {
          value: 'form',
          label: 'Form data (space as +)',
          hint: 'application/x-www-form-urlencoded, as sent by HTML forms and URLSearchParams.',
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'keepExisting',
      label: 'Keep existing %-encoding',
      directions: ['encode'],
      default: false,
      lossy: true,
      hint: 'Leaves valid sequences such as %20 alone instead of encoding the % again.',
    },
  ],

  encode(input, options) {
    const variant = String(options.variant ?? 'component');
    // A lone surrogate can't be UTF-8 encoded; TextEncoder turns it into U+FFFD.
    const hasLoneSurrogate = /\p{Surrogate}/u.test(input);
    const result = trackedReplace(
      input,
      encodePattern(variant, Boolean(options.keepExisting)),
      (match) => {
        if (match[0] === '%' && match.length === 3) return match;
        if (variant === 'form' && match === ' ') return '+';
        return percentEncode(match);
      },
    );
    const warnings = [];
    if (variant === 'component' && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(input.trim())) {
      warnings.push(
        'This looks like a whole URL, so its :// / ? & are being encoded too. Choose "Whole URL" in the options to keep it working as a link.',
      );
    }
    if (hasLoneSurrogate)
      warnings.push('Broken characters (lone surrogates) were encoded as U+FFFD (�).');
    return warnings.length ? { ...result, warnings } : result;
  },

  decode(input, options) {
    const variant = String(options.variant ?? 'component');
    let invalid = 0;
    // One byte plus any continuation bytes (%80–%BF) after it: normally one
    // character, so counts and highlights are per character.
    const sequence = '%[0-9A-Fa-f]{2}(?:%[89ABab][0-9A-Fa-f])*';
    const pattern = new RegExp(variant === 'form' ? `\\+|${sequence}` : sequence, 'g');

    const result = trackedReplace(input, pattern, (run) => {
      if (run === '+') return ' ';
      // Decode one UTF-8 sequence at a time, so a single bad byte doesn't
      // stop the valid ones around it from decoding.
      const bytes = /** @type {string[]} */ (run.match(/%[0-9A-Fa-f]{2}/g));
      let out = '';
      let i = 0;
      while (i < bytes.length) {
        const length = sequenceLength(parseInt(bytes[i].slice(1), 16));
        if (length && i + length <= bytes.length) {
          const sequence = bytes.slice(i, i + length).join('');
          try {
            const char = decodeURIComponent(sequence);
            out += variant === 'uri' && RESERVED.has(char) ? sequence : char;
            i += length;
            continue;
          } catch {
            // Not valid UTF-8: fall through and leave the first byte as it is.
          }
        }
        out += bytes[i];
        invalid++;
        i++;
      }
      return out;
    });

    return invalid
      ? {
          ...result,
          warnings: [
            `${pluralise(invalid, 'percent sequence')} ${invalid === 1 ? "isn't" : "aren't"} valid UTF-8 and ${invalid === 1 ? 'was' : 'were'} left as ${invalid === 1 ? 'it is' : 'they are'}.`,
          ],
        }
      : result;
  },

  alreadyEncoded: {
    find(input) {
      const found = new Set();
      for (const [match] of input.matchAll(/%[0-9A-Fa-f]{2}/g)) {
        found.add(match.toUpperCase());
        if (found.size === 3) break;
      }
      return [...found];
    },
    description: 'percent-encoding',
    keepOption: 'keepExisting',
  },
};
