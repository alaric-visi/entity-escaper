import { describe, expect, it } from 'vitest';
import { decodeHTML } from 'entities/decode';
import { unescapeHtml, unescapeHtmlWithCount } from '../src/lib/unescape.js';
import { escapeHtml } from '../src/lib/escape.js';
import { findEntities, isEntity } from '../src/lib/entities.js';

/** Random strings biased towards characters and sequences that stress entity handling. */
function randomSamples(count, maxLength = 30) {
  const pieces = [
    ...`&<>"'ab1;#xX `,
    '&amp;',
    '&amp',
    '&lt;',
    '&copy',
    '&copy;',
    '&notit;',
    '&#39;',
    '&#x27;',
    '&#;',
    '&#x;',
    '&foo;',
    '😀',
    'é',
    '\n',
  ];
  const samples = [];
  for (let run = 0; run < count; run++) {
    const length = Math.floor(Math.random() * maxLength);
    let sample = '';
    for (let i = 0; i < length; i++) sample += pieces[Math.floor(Math.random() * pieces.length)];
    samples.push(sample);
  }
  return samples;
}

describe('unescapeHtml', () => {
  it.each([
    ['&amp;', '&'],
    ['&lt;p&gt;', '<p>'],
    ['&quot;hi&quot;', '"hi"'],
    ['&#39;', "'"],
    ['&#x27;', "'"],
    ['&apos;', "'"],
    ['&copy; 2026', '© 2026'],
    ['&#128512;', '😀'],
    ['&nbsp;', ' '],
  ])('decodes %s', (input, expected) => {
    expect(unescapeHtml(input)).toBe(expected);
  });

  it('decodes legacy entities without a semicolon, as browsers do', () => {
    expect(unescapeHtml('&copy 2026')).toBe('© 2026');
  });

  it('leaves unknown and malformed references alone', () => {
    expect(unescapeHtml('&foo; AT&T &#; &#x;')).toBe('&foo; AT&T &#; &#x;');
  });

  it('decodes only one level', () => {
    expect(unescapeHtml('&amp;lt;')).toBe('&lt;');
  });

  it('counts decoded entities', () => {
    expect(unescapeHtmlWithCount('&lt;b&gt; &foo; &amp;')).toEqual({
      text: '<b> &foo; &',
      count: 3,
    });
  });

  it('matches decoding the whole string at once', () => {
    for (const sample of randomSamples(3000)) {
      expect(unescapeHtml(sample)).toBe(decodeHTML(sample));
    }
  });

  it('round-trips: unescape(escape(x)) === x for any input', () => {
    for (const sample of randomSamples(3000)) {
      expect(unescapeHtml(escapeHtml(sample))).toBe(sample);
    }
  });
});

describe('entity detection', () => {
  it('recognises real entities only', () => {
    expect(isEntity('&amp;')).toBe(true);
    expect(isEntity('&#39;')).toBe(true);
    expect(isEntity('&#x1F600;')).toBe(true);
    expect(isEntity('&foo;')).toBe(false);
    expect(isEntity('&amp')).toBe(false);
  });

  it('finds distinct entities in order, up to a limit', () => {
    expect(findEntities('&lt;a&gt; &amp; &lt; &copy;')).toEqual([
      '&lt;',
      '&gt;',
      '&amp;',
      '&copy;',
    ]);
    expect(findEntities('&lt;a&gt; &amp; &lt; &copy;', { limit: 2 })).toEqual(['&lt;', '&gt;']);
  });

  it('ignores text that only looks like entities', () => {
    expect(findEntities('AT&T; ?a=1&copy=2 &foo; Tom & Jerry')).toEqual([]);
  });
});
