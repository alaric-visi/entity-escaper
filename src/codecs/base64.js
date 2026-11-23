import { describeChar, pluralise } from '../lib/format.js';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** @param {Uint8Array} bytes */
function bytesToBase64(bytes) {
  // btoa wants a "binary string"; build it in chunks to stay within argument limits.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** @param {string} base64 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * @param {string} error
 * @returns {import('./types.js').CodecResult}
 */
const failure = (error) => ({ text: '', count: null, ranges: null, error });

/** @type {import('./types.js').Codec} */
export default {
  id: 'base64',
  label: 'Base64',
  guidance:
    'Encodes text (as UTF-8) into Base64 and back. Base64 is an encoding, not encryption: anyone can decode it.',

  text: {
    encode: {
      action: 'Encode',
      inputLabel: 'Text to encode',
      outputLabel: 'Base64',
      placeholder: 'Paste text to encode as Base64…',
      describeCount: (n) => pluralise(n, 'byte'),
    },
    decode: {
      action: 'Decode',
      inputLabel: 'Base64 to decode',
      outputLabel: 'Decoded text',
      placeholder: 'Paste Base64 or Base64URL, e.g. SGVsbG8sIHdvcmxkIQ==',
      describeCount: (n) => pluralise(n, 'byte'),
    },
  },

  options: [
    {
      type: 'select',
      id: 'variant',
      label: 'Alphabet',
      directions: ['encode'],
      default: 'standard',
      choices: [
        { value: 'standard', label: 'Standard (+ / =)' },
        {
          value: 'url',
          label: 'URL-safe (- _ , no padding)',
          hint: 'Base64URL, as used in JWTs and URLs. Decoding accepts either alphabet.',
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'wrapLines',
      label: 'Wrap lines at 76 characters',
      directions: ['encode'],
      default: false,
      hint: 'MIME style, for email. Decoding ignores line breaks either way.',
    },
  ],

  encode(input, options) {
    // TextEncoder turns lone surrogates into U+FFFD, so mention it.
    const warnings = /\p{Surrogate}/u.test(input)
      ? ['Broken characters (lone surrogates) were encoded as U+FFFD (�).']
      : undefined;
    const bytes = utf8Encoder.encode(input);
    let text = bytesToBase64(bytes);
    if (options.variant === 'url') {
      text = text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    if (options.wrapLines) text = text.replace(/.{76}(?=.)/g, '$&\n');
    return { text, count: bytes.length, ranges: null, ...(warnings && { warnings }) };
  },

  decode(input) {
    const compact = input.replace(/\s+/g, '');
    const invalid = /[^A-Za-z0-9+/=_-]/.exec(compact);
    if (invalid) {
      return failure(`${describeChar(invalid[0])} isn't a Base64 character.`);
    }
    const normalised = compact.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (normalised.includes('=')) return failure('"=" padding can only appear at the end.');
    if (normalised.length % 4 === 1) {
      return failure(
        'The length is wrong for Base64: it looks truncated or has a stray character.',
      );
    }

    const bytes = base64ToBytes(normalised + '='.repeat((4 - (normalised.length % 4)) % 4));
    try {
      return { text: utf8Decoder.decode(bytes), count: bytes.length, ranges: null };
    } catch {
      return failure(
        `Decoded ${pluralise(bytes.length, 'byte')}, but they aren't UTF-8 text. This is probably binary data, such as an image or a compressed file.`,
      );
    }
  },
};
