import { escapeHtmlTracked, DEFAULT_ESCAPE_OPTIONS } from '../lib/escape.js';
import { unescapeHtmlTracked } from '../lib/unescape.js';
import { findEntities } from '../lib/entities.js';
import { countWith } from '../lib/format.js';

/** @type {import('./types.js').Codec} */
export default {
  id: 'html',
  label: 'HTML',
  guidance:
    'Makes text display literally in a web page. It is not sanitisation, and it is not enough inside <script> or <style>, or in URL attributes such as href: use the JavaScript, JSON or URL formats there.',
  preview: true,

  text: {
    encode: {
      action: 'Escape',
      inputLabel: 'Text to escape',
      outputLabel: 'Escaped HTML',
      placeholder: 'Paste text or HTML to escape…',
      describeCount: (n) => countWith(n, 'replaced'),
    },
    decode: {
      action: 'Unescape',
      inputLabel: 'HTML to unescape',
      outputLabel: 'Unescaped text',
      placeholder: 'Paste escaped HTML, e.g. &lt;p&gt;Hello&lt;/p&gt;',
      describeCount: (n) => countWith(n, 'decoded'),
    },
  },

  options: [
    {
      type: 'select',
      id: 'characters',
      label: 'Characters',
      directions: ['encode'],
      default: DEFAULT_ESCAPE_OPTIONS.characters,
      choices: [
        {
          value: 'attribute',
          label: `& < > " ' (anywhere)`,
          hint: 'Safe in element text and in quoted attribute values.',
        },
        {
          value: 'text',
          label: '& < > (element text only)',
          hint: 'Leaves quotes readable. Not safe inside attribute values.',
        },
      ],
    },
    {
      type: 'select',
      id: 'nonAscii',
      label: 'Non-ASCII (é, —, 😀)',
      directions: ['encode'],
      default: DEFAULT_ESCAPE_OPTIONS.nonAscii,
      choices: [
        {
          value: 'keep',
          label: 'Leave as is',
          hint: 'Fine for any UTF-8 page, which is nearly all of them.',
        },
        {
          value: 'numeric',
          label: 'Numeric (&#233;)',
          hint: 'Output is pure ASCII, for legacy encodings and some email tools.',
        },
        {
          value: 'named',
          label: 'Named (&eacute;)',
          hint: 'Readable names where HTML has them, numeric references otherwise.',
        },
      ],
    },
    {
      type: 'select',
      id: 'numbers',
      label: 'Numeric references',
      directions: ['encode'],
      default: DEFAULT_ESCAPE_OPTIONS.numbers,
      choices: [
        { value: 'decimal', label: 'Decimal (&#39;)' },
        { value: 'hex', label: 'Hex (&#x27;)' },
      ],
    },
    {
      type: 'select',
      id: 'apostrophe',
      label: 'Apostrophe',
      directions: ['encode'],
      default: DEFAULT_ESCAPE_OPTIONS.apostrophe,
      choices: [
        {
          value: 'numeric',
          label: 'Numeric (&#39;)',
          hint: 'Works in HTML, XHTML and old browsers.',
        },
        { value: 'named', label: '&apos;', hint: 'HTML5 and XML only.' },
      ],
    },
    {
      type: 'checkbox',
      id: 'keepExistingEntities',
      label: 'Keep existing entities',
      directions: ['encode'],
      default: false,
      lossy: true,
      hint: 'Leaves real entities such as &amp; alone instead of double-escaping them.',
    },
    {
      type: 'checkbox',
      id: 'lineBreaks',
      label: 'Line breaks → <br>',
      directions: ['encode'],
      default: false,
      lossy: true,
      hint: 'Keeps line breaks visible without <pre>. Not needed with <pre>.',
    },
    {
      type: 'select',
      id: 'tabs',
      label: 'Tabs',
      directions: ['encode'],
      default: DEFAULT_ESCAPE_OPTIONS.tabs,
      lossy: true,
      choices: [
        { value: 'keep', label: 'Leave as is' },
        { value: '2', label: '2 spaces' },
        { value: '4', label: '4 spaces' },
      ],
    },
    {
      type: 'select',
      id: 'wrap',
      label: 'Wrap output in',
      directions: ['encode'],
      default: DEFAULT_ESCAPE_OPTIONS.wrap,
      lossy: true,
      choices: [
        { value: 'none', label: 'Nothing' },
        {
          value: 'pre-code',
          label: '<pre><code>',
          hint: 'The usual markup for a code block: keeps spacing and line breaks.',
        },
        { value: 'pre', label: '<pre>' },
        {
          value: 'code',
          label: '<code>',
          hint: 'Inline code. Line breaks collapse unless styled.',
        },
      ],
    },
  ],

  encode(input, options) {
    return escapeHtmlTracked(
      input,
      /** @type {import('../lib/escape.js').EscapeOptions} */ (options),
    );
  },

  decode(input) {
    return unescapeHtmlTracked(input);
  },

  alreadyEncoded: {
    find: (input) => findEntities(input, { limit: 3 }),
    description: 'HTML entities',
    keepOption: 'keepExistingEntities',
  },
};
