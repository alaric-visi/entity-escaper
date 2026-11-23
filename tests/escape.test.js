import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeHtmlWithCount } from '../src/lib/escape.js';

// The original single-file implementation, kept as a reference so we can
// prove the single-pass rewrite behaves identically.
function originalEscapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s as %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('escapes a realistic snippet', () => {
    expect(escapeHtml(`<a href="/x?a=1&b=2" title='hi'>Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;/x?a=1&amp;b=2&quot; title=&#39;hi&#39;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
  });

  it('re-escapes existing entities by default', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('leaves ordinary text, whitespace and Unicode untouched', () => {
    const text = 'Café – naïve 😀\n\tline two';
    expect(escapeHtml(text)).toBe(text);
  });

  it('handles the empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('coerces non-string input', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('matches the original implementation on random input', () => {
    const chars = [...`&<>"'abc xyz;#\n😀é`];
    for (let run = 0; run < 2000; run++) {
      const length = Math.floor(Math.random() * 40);
      let sample = '';
      for (let i = 0; i < length; i++) sample += chars[Math.floor(Math.random() * chars.length)];
      expect(escapeHtml(sample)).toBe(originalEscapeHtml(sample));
    }
  });

  it('handles large input quickly', () => {
    const big = '<div class="x">a & b</div>\n'.repeat(50_000); // ~1.35 MB
    const start = performance.now();
    const result = escapeHtml(big);
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.startsWith('&lt;div class=&quot;x&quot;&gt;a &amp; b&lt;/div&gt;')).toBe(true);
  });
});

describe('escapeHtml with keepExistingEntities', () => {
  const keep = { keepExistingEntities: true };

  it('leaves real named, decimal and hex entities alone', () => {
    expect(escapeHtml('Fish &amp; chips &copy; &#39;x&#39; &#x27;y&#x27;', keep)).toBe(
      'Fish &amp; chips &copy; &#39;x&#39; &#x27;y&#x27;',
    );
  });

  it('still escapes everything else around them', () => {
    expect(escapeHtml('<b>&amp; "x"</b> & more', keep)).toBe(
      '&lt;b&gt;&amp; &quot;x&quot;&lt;/b&gt; &amp; more',
    );
  });

  it('escapes entity-shaped text that is not a real entity', () => {
    expect(escapeHtml('&foo; &notarealthing;', keep)).toBe('&amp;foo; &amp;notarealthing;');
  });

  it('requires the semicolon, so URLs and names stay safe', () => {
    expect(escapeHtml('?a=1&copy=2 AT&T &amp', keep)).toBe('?a=1&amp;copy=2 AT&amp;T &amp;amp');
  });

  it('is idempotent: escaping its own output changes nothing', () => {
    const once = escapeHtml(`<p class="x">Tom & 'Jerry' &copy;</p>`, keep);
    expect(escapeHtml(once, keep)).toBe(once);
  });
});

describe('escapeHtmlWithCount', () => {
  it('counts each replaced character', () => {
    expect(escapeHtmlWithCount('<a> & "b"')).toEqual({
      text: '&lt;a&gt; &amp; &quot;b&quot;',
      count: 5,
    });
  });

  it('does not count kept entities', () => {
    expect(escapeHtmlWithCount('&amp; & &foo;', { keepExistingEntities: true })).toEqual({
      text: '&amp; &amp; &amp;foo;',
      count: 2,
    });
  });

  it('reports zero for plain text', () => {
    expect(escapeHtmlWithCount('hello').count).toBe(0);
  });
});
