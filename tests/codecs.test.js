import { describe, expect, it } from 'vitest';
import {
  CODECS,
  defaultOptions,
  getCodec,
  isValidOptionValue,
  sanitiseOptions,
} from '../src/codecs/index.js';
import { trackedReplace, wrapTracked } from '../src/lib/tracked-replace.js';
import { transform } from '../src/lib/transform.js';

/** Well-formed random strings full of characters that matter to some format. */
function randomSamples(count, maxLength = 40) {
  const pieces = [
    ...`&<>"'\\/%+=?#:;@$,!*()[]{}\`~^| \n\r\t\0\x7f\x1b`,
    'é',
    '—',
    '😀',
    '\u00a0',
    '\u2028',
    ']]>',
    '${',
    '&amp;',
    '&lt;',
    '&copy;',
    '&#39;',
    '%20',
    '%E9',
    '\\n',
    '\\u0041',
    'abc',
    'XYZ',
    '123',
  ];
  const samples = ['', ...pieces];
  for (let run = 0; run < count; run++) {
    const length = Math.floor(Math.random() * maxLength);
    let sample = '';
    for (let i = 0; i < length; i++) sample += pieces[Math.floor(Math.random() * pieces.length)];
    samples.push(sample);
  }
  return samples;
}

const SAMPLES = randomSamples(400);

/** Every single-option variation of a codec's defaults that should round-trip. */
function roundTripVariants(codec) {
  const base = defaultOptions(codec);
  const variants = [{ name: 'defaults', options: base }];
  for (const option of codec.options) {
    if (option.lossy) continue;
    const values = option.type === 'checkbox' ? [true] : option.choices.map((c) => c.value);
    for (const value of values) {
      if (value === option.default) continue;
      variants.push({ name: `${option.id}=${value}`, options: { ...base, [option.id]: value } });
    }
  }
  return variants;
}

describe('codec registry contract', () => {
  it('has unique ids', () => {
    const ids = CODECS.map((codec) => codec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(CODECS.map((codec) => [codec.id, codec]))('%s', (_id, codec) => {
    it('describes itself for the UI', () => {
      expect(codec.label).toBeTruthy();
      expect(codec.guidance.length).toBeGreaterThan(20);
      for (const direction of ['encode', 'decode']) {
        const text = codec.text[direction];
        expect(text.action).toMatch(/^[A-Z]/);
        expect(text.inputLabel).toBeTruthy();
        expect(text.outputLabel).toBeTruthy();
        expect(text.placeholder).toBeTruthy();
        expect(text.describeCount(2)).toMatch(/2/);
      }
    });

    it('has valid option definitions', () => {
      const ids = codec.options.map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const option of codec.options) {
        expect(option.label).toBeTruthy();
        expect(option.directions.length).toBeGreaterThan(0);
        expect(isValidOptionValue(option, option.default)).toBe(true);
        if (option.type === 'select') expect(option.choices.length).toBeGreaterThan(1);
      }
    });

    it('points its "already encoded" check at a real checkbox option', () => {
      const keep = codec.alreadyEncoded?.keepOption;
      if (!keep) return;
      expect(codec.options.find((option) => option.id === keep)?.type).toBe('checkbox');
    });

    it.each(roundTripVariants(codec).map((v) => [v.name, v.options]))(
      'round-trips with %s',
      (_name, options) => {
        for (const sample of SAMPLES) {
          const encoded = codec.encode(sample, options);
          expect(encoded.error).toBeUndefined();
          const decoded = codec.decode(encoded.text, options);
          expect(decoded.error).toBeUndefined();
          expect(decoded.text).toBe(sample);
        }
      },
    );

    it('reports ranges that lie inside the output and in order', () => {
      for (const direction of ['encode', 'decode']) {
        for (const sample of SAMPLES.slice(0, 100)) {
          const result = codec[direction](sample, defaultOptions(codec));
          if (!result.ranges) continue;
          let last = 0;
          for (const [start, end] of result.ranges) {
            expect(start).toBeGreaterThanOrEqual(last);
            expect(end).toBeGreaterThanOrEqual(start);
            expect(end).toBeLessThanOrEqual(result.text.length);
            last = end;
          }
        }
      }
    });
  });
});

describe('options helpers', () => {
  it('sanitiseOptions keeps valid values and drops the rest', () => {
    const html = getCodec('html');
    expect(
      sanitiseOptions(html, {
        characters: 'text',
        wrap: 'marquee',
        keepExistingEntities: 'yes',
        junk: 1,
      }),
    ).toEqual({ ...defaultOptions(html), characters: 'text' });
    expect(sanitiseOptions(html, null)).toEqual(defaultOptions(html));
  });

  it('getCodec falls back to the first codec', () => {
    expect(getCodec('nope').id).toBe('html');
  });
});

describe('trackedReplace', () => {
  it('records where each changed replacement lands', () => {
    expect(trackedReplace('a<b>c', /[<>]/g, (m) => (m === '<' ? '&lt;' : '&gt;'))).toEqual({
      text: 'a&lt;b&gt;c',
      count: 2,
      ranges: [
        [1, 5],
        [6, 10],
      ],
    });
  });

  it('ignores matches that are returned unchanged', () => {
    expect(trackedReplace('aXbX', /X/g, (m) => m)).toEqual({ text: 'aXbX', count: 0, ranges: [] });
  });

  it('refuses a non-global pattern', () => {
    expect(() => trackedReplace('x', /x/, (m) => m)).toThrow(TypeError);
  });

  it('wrapTracked shifts ranges and marks the wrapper', () => {
    const inner = trackedReplace('<', /</g, () => '&lt;');
    expect(wrapTracked(inner, '<code>', '</code>')).toEqual({
      text: '<code>&lt;</code>',
      count: 1,
      ranges: [
        [0, 6],
        [6, 10],
        [10, 17],
      ],
    });
  });
});

describe('transform', () => {
  it('reports examples of existing encoding only when encoding without "keep"', () => {
    const base = {
      codec: 'html',
      input: 'Fish &amp; chips',
      options: defaultOptions(getCodec('html')),
    };
    expect(transform({ ...base, direction: 'encode' }).alreadyEncoded).toEqual(['&amp;']);
    expect(transform({ ...base, direction: 'decode' }).alreadyEncoded).toEqual([]);
    expect(
      transform({
        ...base,
        direction: 'encode',
        options: { ...base.options, keepExistingEntities: true },
      }).alreadyEncoded,
    ).toEqual([]);
  });

  it('blanks the output when the codec reports an error', () => {
    const result = transform({
      codec: 'base64',
      direction: 'decode',
      input: 'not base64!',
      options: {},
    });
    expect(result.output).toBe('');
    expect(result.error).toMatch(/Base64 character/);
    expect(result.ranges).toBeNull();
  });
});

describe('HTML codec', () => {
  const html = getCodec('html');
  const escape = (text, options = {}) =>
    html.encode(text, { ...defaultOptions(html), ...options }).text;

  it('element-text mode leaves quotes alone', () => {
    expect(escape(`<a title="x">'hi'</a>`, { characters: 'text' })).toBe(
      `&lt;a title="x"&gt;'hi'&lt;/a&gt;`,
    );
  });

  it('encodes non-ASCII as numeric or named references', () => {
    expect(escape('Café — 😀', { nonAscii: 'numeric' })).toBe('Caf&#233; &#8212; &#128512;');
    expect(escape('Café — 😀', { nonAscii: 'numeric', numbers: 'hex' })).toBe(
      'Caf&#xE9; &#x2014; &#x1F600;',
    );
    expect(escape('Café — 😀 ア', { nonAscii: 'named' })).toBe(
      'Caf&eacute; &mdash; &#128512; &#12450;',
    );
  });

  it('offers &apos; and hex apostrophes', () => {
    expect(escape("'", { apostrophe: 'named' })).toBe('&apos;');
    expect(escape("'", { numbers: 'hex' })).toBe('&#x27;');
  });

  it('applies the output helpers', () => {
    expect(escape('a\n\tb', { lineBreaks: true, tabs: '2' })).toBe('a<br>\n  b');
    expect(escape('a\r\nb', { lineBreaks: true })).toBe('a<br>\r\nb');
    expect(escape('<x>', { wrap: 'pre-code' })).toBe('<pre><code>&lt;x&gt;</code></pre>');
    expect(escape('<x>', { wrap: 'code' })).toBe('<code>&lt;x&gt;</code>');
  });
});

describe('URL codec', () => {
  const url = getCodec('url');
  const enc = (text, options = {}) => url.encode(text, { ...defaultOptions(url), ...options }).text;
  const dec = (text, options = {}) => url.decode(text, { ...defaultOptions(url), ...options });

  it('matches encodeURIComponent and encodeURI', () => {
    for (const sample of SAMPLES) {
      expect(enc(sample)).toBe(encodeURIComponent(sample));
      expect(enc(sample, { variant: 'uri' })).toBe(encodeURI(sample));
    }
  });

  it('matches URLSearchParams for form data', () => {
    for (const sample of SAMPLES) {
      const expected = new URLSearchParams({ q: sample }).toString().slice(2);
      expect(enc(sample, { variant: 'form' })).toBe(expected);
    }
  });

  it('leaves reserved characters encoded when decoding a whole URL', () => {
    expect(dec('a%2Fb%20c', { variant: 'uri' }).text).toBe('a%2Fb c');
    expect(dec('a%2Fb%20c').text).toBe('a/b c');
  });

  it('decodes what it can and leaves invalid sequences, with a warning', () => {
    const result = dec('caf%C3%A9 %E0%A4 %ZZ 100%');
    expect(result.text).toBe('café %E0%A4 %ZZ 100%');
    expect(result.warnings?.[0]).toMatch(/2 percent sequences aren't valid UTF-8/);
  });

  it('hints when a whole URL is encoded as a component', () => {
    expect(url.encode('https://example.com/a?b=c', defaultOptions(url)).warnings?.[0]).toMatch(
      /looks like a whole URL/,
    );
    expect(url.encode('https://example.com/a?b=c', { variant: 'uri' }).warnings).toBeUndefined();
    expect(url.encode('just a value', defaultOptions(url)).warnings).toBeUndefined();
  });

  it('can keep existing percent-encoding', () => {
    expect(enc('50% off/a%20b', { keepExisting: true })).toBe('50%25%20off%2Fa%20b');
  });
});

describe('JavaScript codec', () => {
  const js = getCodec('javascript');
  const enc = (text, options = {}) => js.encode(text, { ...defaultOptions(js), ...options }).text;

  it('produces a string body that JavaScript itself evaluates back to the input', () => {
    for (const quote of ['single', 'double', 'backtick']) {
      const q = { single: "'", double: '"', backtick: '`' }[quote];
      for (const sample of SAMPLES) {
        for (const nonAscii of ['keep', 'escape']) {
          const body = enc(sample, { quote, nonAscii, scriptSafe: true });
          expect(new Function(`return ${q}${body}${q};`)()).toBe(sample);
        }
      }
    }
  });

  it('keeps </script> from closing the tag when asked', () => {
    expect(enc('</script>', { scriptSafe: true })).toBe('\\x3C/script>');
  });

  it('decodes legacy and unusual escapes leniently', () => {
    const result = js.decode('\\101\\0 \\q \\u{1F600} line\\\ncontinued \\u12', {});
    expect(result.text).toBe('A\0 q 😀 linecontinued \\u12');
    expect(result.warnings?.[0]).toMatch(/1 invalid escape/);
  });
});

describe('JSON codec', () => {
  const json = getCodec('json');
  const enc = (text, options = {}) =>
    json.encode(text, { ...defaultOptions(json), ...options }).text;

  it('matches JSON.stringify by default', () => {
    for (const sample of SAMPLES) {
      expect(`"${enc(sample)}"`).toBe(
        JSON.stringify(sample)
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029'),
      );
    }
  });

  it('produces valid JSON with every option', () => {
    for (const sample of SAMPLES) {
      const body = enc(sample, { nonAscii: 'escape', scriptSafe: true });
      expect(JSON.parse(`"${body}"`)).toBe(sample);
      expect(body).toMatch(/^[\x20-\x7f]*$/); // printable ASCII (and DEL, which is ASCII)
    }
  });

  it('rejects invalid JSON strings with a clear position', () => {
    expect(json.decode('bad " quote', {}).error).toMatch(/Unescaped " at position 5/);
    expect(json.decode('bad \\x41', {}).error).toMatch(/Invalid escape \(\\x\) at position 5/);
    expect(json.decode('two\nlines', {}).error).toMatch(/control character U\+000A at position 4/);
  });

  it('accepts a whole string literal, quotes included', () => {
    expect(json.decode('"say \\"hi\\""', {})).toMatchObject({
      text: 'say "hi"',
      warnings: ['The surrounding quotes were removed.'],
    });
  });
});

describe('Base64 codec', () => {
  const b64 = getCodec('base64');
  const enc = (text, options = {}) => b64.encode(text, { ...defaultOptions(b64), ...options }).text;

  it('matches Node’s Buffer encoding (UTF-8)', () => {
    for (const sample of SAMPLES) {
      expect(enc(sample)).toBe(Buffer.from(sample, 'utf8').toString('base64'));
      expect(enc(sample, { variant: 'url' })).toBe(
        Buffer.from(sample, 'utf8').toString('base64url'),
      );
    }
  });

  it('wraps lines at 76 characters', () => {
    const lines = enc('x'.repeat(200), { wrapLines: true }).split('\n');
    expect(lines.slice(0, -1).every((line) => line.length === 76)).toBe(true);
  });

  it('decodes either alphabet, with or without padding and whitespace', () => {
    expect(b64.decode('SGVs\nbG8/', {}).text).toBe('Hello?');
    expect(b64.decode('SGVsbG8_', {}).text).toBe('Hello?');
    expect(b64.decode('SGk=', {}).text).toBe('Hi');
    expect(b64.decode('SGk', {}).text).toBe('Hi');
  });

  it('explains invalid input and binary data', () => {
    expect(b64.decode('SGk*', {}).error).toMatch(/"\*" isn't a Base64 character/);
    expect(b64.decode('SGVsbG8', {}).error).toBeUndefined();
    expect(b64.decode('A', {}).error).toMatch(/length is wrong/);
    expect(b64.decode('S=Gk', {}).error).toMatch(/padding/);
    expect(b64.decode('/9j/4AAQSkZJRg==', {}).error).toMatch(/binary data/);
  });
});

describe('XML codec', () => {
  const xml = getCodec('xml');
  const enc = (text, options = {}) => xml.encode(text, { ...defaultOptions(xml), ...options });

  it('uses the five XML entities', () => {
    expect(enc(`<a b="c">'&'</a>`).text).toBe(
      '&lt;a b=&quot;c&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('splits ]]> safely inside CDATA', () => {
    expect(enc('a]]>b', { method: 'cdata' }).text).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
  });

  it('only decodes entities outside CDATA sections', () => {
    expect(xml.decode('&lt;<![CDATA[&lt;]]>&copy;', {}).text).toBe('<&lt;&copy;');
  });

  it('warns about characters XML 1.0 forbids', () => {
    expect(enc('a\x01b').warnings?.[0]).toMatch(/1 character .* isn't allowed in XML 1\.0/);
  });
});
