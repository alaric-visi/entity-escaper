import { decodeXML } from 'entities/decode';
import { trackedReplace, wrapTracked } from '../lib/tracked-replace.js';
import { countWith, pluralise } from '../lib/format.js';

/** @type {Record<string, string>} */
const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

const XML_ENTITY = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/;

/** Characters XML 1.0 forbids outright, even written as references. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\0-\x08\x0B\x0C\x0E-\x1F￾￿]|\p{Surrogate}/gu;

/** @param {string} input */
function forbiddenWarning(input) {
  const count = input.match(FORBIDDEN)?.length ?? 0;
  return count
    ? [
        `${pluralise(count, 'character')} (control characters) ${count === 1 ? "isn't" : "aren't"} allowed in XML 1.0 at all, even escaped. Remove ${count === 1 ? 'it' : 'them'} before using the output.`,
      ]
    : undefined;
}

/** @type {import('./types.js').Codec} */
export default {
  id: 'xml',
  label: 'XML',
  guidance:
    'Escapes text for XML element content and attribute values (including SVG, RSS and XHTML), with the five XML entities or a CDATA section.',

  text: {
    encode: {
      action: 'Escape',
      inputLabel: 'Text to escape',
      outputLabel: 'Escaped XML',
      placeholder: 'Paste text to put in an XML document…',
      describeCount: (n) => countWith(n, 'replaced'),
    },
    decode: {
      action: 'Unescape',
      inputLabel: 'XML to unescape',
      outputLabel: 'Unescaped text',
      placeholder: 'Paste escaped XML, e.g. Fish &amp; chips or <![CDATA[…]]>',
      describeCount: (n) => countWith(n, 'decoded'),
    },
  },

  options: [
    {
      type: 'select',
      id: 'method',
      label: 'Method',
      directions: ['encode'],
      default: 'entities',
      choices: [
        {
          value: 'entities',
          label: 'Entities (&amp; &lt; …)',
          hint: 'Works everywhere, including attribute values.',
        },
        {
          value: 'cdata',
          label: 'CDATA section',
          hint: 'Keeps long text readable. Element content only, never attributes.',
        },
      ],
    },
    {
      type: 'checkbox',
      id: 'keepExisting',
      label: 'Keep existing entities',
      directions: ['encode'],
      default: false,
      lossy: true,
      hint: 'Leaves &amp; &lt; &#39; and so on alone. Applies to the entities method.',
    },
  ],

  encode(input, options) {
    const warnings = forbiddenWarning(input);
    let result;
    if (options.method === 'cdata') {
      // "]]>" would end the section early, so split it across two sections.
      const body = trackedReplace(input, /\]\]>/g, () => ']]]]><![CDATA[>');
      result = wrapTracked(body, '<![CDATA[', ']]>');
    } else {
      const pattern = options.keepExisting
        ? new RegExp(`${XML_ENTITY.source}|[&<>"']`, 'g')
        : /[&<>"']/g;
      result = trackedReplace(input, pattern, (match) =>
        match.length > 1 ? match : XML_ESCAPES[match],
      );
    }
    return warnings ? { ...result, warnings } : result;
  },

  decode(input) {
    // Entities are decoded outside CDATA sections only; inside, text is literal.
    return trackedReplace(
      input,
      /<!\[CDATA\[([\s\S]*?)\]\]>|&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g,
      (match, groups) => (match.startsWith('<![CDATA[') ? groups[1] : decodeXML(match)),
    );
  },

  alreadyEncoded: {
    find(input) {
      const found = new Set();
      for (const [match] of input.matchAll(new RegExp(XML_ENTITY.source, 'g'))) {
        found.add(match);
        if (found.size === 3) break;
      }
      return [...found];
    },
    description: 'XML entities',
    keepOption: 'keepExisting',
  },
};
