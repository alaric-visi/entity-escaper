// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init, LARGE_INPUT_DELAY_MS, LARGE_INPUT_LENGTH, UNDO_CLEAR_MS } from '../src/app.js';
import { STORAGE_KEY } from '../src/state/persistence.js';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const bodyMarkup = html.match(/<body>([\s\S]*)<\/body>/)[1];

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const $ = (selector) => document.querySelector(selector);

function type(value, inputType = 'insertText') {
  const input = $('#input');
  input.value = value;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
}

function press(key, modifiers = {}) {
  document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  );
}

function selectCodec(id) {
  $('#codec-select').value = id;
  $('#codec-select').dispatchEvent(new Event('change', { bubbles: true }));
}

function setOption(id, value) {
  const control = $(`[data-option-id="${id}"]`);
  if (control.type === 'checkbox') control.checked = value;
  else control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function mockClipboard(impl = () => Promise.resolve()) {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('app', () => {
  let app;
  const start = (options = {}) => (app = init({ storage: null, ...options }));

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = bodyMarkup;
  });

  afterEach(() => {
    app?.destroy();
    app = undefined;
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    delete document.execCommand;
  });

  describe('escaping and copying', () => {
    it('escapes HTML as the user types, by default', () => {
      start();
      type('<b>"Hi" & \'bye\'</b>');
      expect($('#output').value).toBe('&lt;b&gt;&quot;Hi&quot; &amp; &#39;bye&#39;&lt;/b&gt;');
    });

    it('disables copy while there is nothing to copy', () => {
      start();
      expect($('#copy-btn').disabled).toBe(true);
      type('x');
      expect($('#copy-btn').disabled).toBe(false);
      type('');
      expect($('#copy-btn').disabled).toBe(true);
    });

    it('picks up text restored by the browser before init', () => {
      $('#input').value = '<restored>';
      start();
      expect($('#output').value).toBe('&lt;restored&gt;');
    });

    it('shows success feedback, announces it, then resets', async () => {
      const writeText = mockClipboard();
      start();
      type('<p>');

      $('#copy-btn').click();
      await vi.waitFor(() => expect($('#copy-btn').dataset.state).toBe('success'));
      expect(writeText).toHaveBeenCalledWith('&lt;p&gt;');
      vi.advanceTimersByTime(50);
      expect($('#status').textContent).toMatch(/copied/i);

      vi.advanceTimersByTime(1500);
      expect($('#copy-btn').textContent).toBe('Copy to clipboard');
      expect($('#copy-btn').dataset.state).toBeUndefined();
    });

    it('shows failure feedback when copying fails', async () => {
      document.execCommand = vi.fn(() => false);
      start();
      type('<p>');
      $('#copy-btn').click();
      await vi.waitFor(() => expect($('#copy-btn').dataset.state).toBe('error'));
      expect($('#copy-btn').textContent).toBe('Copy failed');
    });

    it('restarts the reset timer on repeated clicks instead of flickering', async () => {
      mockClipboard();
      start();
      type('<p>');

      $('#copy-btn').click();
      await vi.waitFor(() => expect($('#copy-btn').dataset.state).toBe('success'));
      vi.advanceTimersByTime(1000);
      $('#copy-btn').click();
      await vi.advanceTimersByTimeAsync(0);
      vi.advanceTimersByTime(1000);
      expect($('#copy-btn').textContent).toBe('Copied!');
      vi.advanceTimersByTime(500);
      expect($('#copy-btn').textContent).toBe('Copy to clipboard');
    });
  });

  describe('direction', () => {
    it('unescapes and relabels the panels', () => {
      start();
      $('#direction-decode').click();
      type('&lt;p&gt;Fish &amp; chips&lt;/p&gt;');
      expect($('#output').value).toBe('<p>Fish & chips</p>');
      expect($('#input-label').textContent).toBe('HTML to unescape');
      expect($('#output-label').textContent).toBe('Unescaped text');
      expect($('#output-stats').textContent).toBe('19 characters · 5 decoded');
    });

    it('hides the options panel when a direction has no options', () => {
      start();
      expect($('#options-panel').hidden).toBe(false);
      $('#direction-decode').click();
      expect($('#options-panel').hidden).toBe(true);
    });
  });

  describe('formats', () => {
    it('lists every format and relabels everything for the chosen one', () => {
      start();
      const formats = [...$('#codec-select').options].map((option) => option.textContent);
      expect(formats).toEqual(['HTML', 'URL', 'JavaScript', 'JSON', 'Base64', 'XML']);

      selectCodec('url');
      type('café menu?');
      expect($('#output').value).toBe('caf%C3%A9%20menu%3F');
      expect($('#direction-encode-label').textContent).toBe('Encode');
      expect($('#direction-decode-label').textContent).toBe('Decode');
      expect($('#codec-guidance').textContent).toMatch(/Percent-encoding/);
      expect($('#options-title').textContent).toBe('URL options');
      expect($('#output-stats').textContent).toBe('19 characters · 3 encoded');
    });

    it('builds the options panel from the format definition', () => {
      start();
      selectCodec('javascript');
      const ids = [...document.querySelectorAll('#codec-options [data-option-id]')].map(
        (el) => el.dataset.optionId,
      );
      expect(ids).toEqual(['quote', 'nonAscii', 'scriptSafe']);
      expect($('#codec-options label[for="opt-quote"]').textContent).toBe('String quotes');
    });

    it('applies option changes immediately and summarises them', () => {
      start();
      type(`<a title="x">`);
      setOption('characters', 'text');
      expect($('#output').value).toBe('&lt;a title="x"&gt;');
      expect($('#options-current').textContent).toBe('& < > (element text only)');
      expect($('#opt-characters-hint').textContent).toMatch(/Not safe inside attribute values/);

      setOption('wrap', 'pre-code');
      expect($('#output').value).toBe('<pre><code>&lt;a title="x"&gt;</code></pre>');
      expect($('#options-current').textContent).toBe('& < > (element text only) · <pre><code>');
    });

    it('keeps each format’s options when switching away and back', () => {
      start();
      setOption('characters', 'text');
      selectCodec('url');
      setOption('variant', 'form');
      selectCodec('html');
      expect($('[data-option-id="characters"]').value).toBe('text');
      selectCodec('url');
      expect($('[data-option-id="variant"]').value).toBe('form');
    });

    it('shows decode errors, and disables copy and swap until fixed', () => {
      start();
      selectCodec('base64');
      $('#direction-decode').click();
      type('SGVsbG8*');
      expect($('#output').value).toBe('');
      expect($('#output-problems').textContent).toMatch(
        /Can't decode this: "\*" isn't a Base64 character/,
      );
      expect($('#copy-btn').disabled).toBe(true);
      expect($('#swap-btn').disabled).toBe(true);

      type('SGVsbG8h');
      expect($('#output').value).toBe('Hello!');
      expect($('#output-problems').textContent).toBe('');
      expect($('#swap-btn').disabled).toBe(false);
    });

    it('shows warnings without blocking the output', () => {
      start();
      selectCodec('url');
      $('#direction-decode').click();
      type('caf%C3%A9 %E0%A4');
      expect($('#output').value).toBe('café %E0%A4');
      expect($('.problem--warning').textContent).toMatch(/aren't valid UTF-8/);
    });
  });

  describe('output views', () => {
    it('highlights what changed', () => {
      start();
      type('a<b>');
      $('#view-changes').click();
      expect($('#output').hidden).toBe(true);
      expect($('#output-changes').hidden).toBe(false);
      const marks = [...document.querySelectorAll('#output-changes mark')].map(
        (m) => m.textContent,
      );
      expect(marks).toEqual(['&lt;', '&gt;']);
      expect($('#output-changes').textContent).toBe('a&lt;b&gt;');
    });

    it('renders a sandboxed, network-blocked preview for HTML', () => {
      start();
      type('<b>bold?</b>');
      $('#view-preview').click();
      vi.advanceTimersByTime(150);
      const frame = $('#preview-frame');
      expect(frame.getAttribute('sandbox')).toBe('');
      expect(frame.srcdoc).toContain('&lt;b&gt;bold?&lt;/b&gt;');
      expect(frame.srcdoc).toContain("default-src 'none'");
    });

    it('only offers views that make sense for the format, remembering the choice', () => {
      start();
      $('#view-preview').click();
      selectCodec('url');
      expect($('#view-preview').hidden).toBe(true);
      expect($('#view-text').checked).toBe(true);
      expect($('#output').hidden).toBe(false);

      selectCodec('base64');
      expect($('#view-changes').disabled).toBe(true);

      selectCodec('html');
      expect($('#view-preview').checked).toBe(true);
    });
  });

  describe('counts', () => {
    it('shows input length, output length and replacements', () => {
      start();
      type('<a>😀');
      expect($('#input-count').textContent).toBe('4 characters');
      expect($('#output-stats').textContent).toBe('10 characters · 2 replaced');
    });

    it('uses the singular and thousands separators', () => {
      start();
      type('x');
      expect($('#input-count').textContent).toBe('1 character');
      type('x'.repeat(1234));
      expect($('#input-count').textContent).toBe('1,234 characters');
    });
  });

  describe('swap', () => {
    it('moves the output into the input and flips the direction', () => {
      start();
      type('<p>Hi</p>');
      $('#swap-btn').click();
      expect($('#input').value).toBe('&lt;p&gt;Hi&lt;/p&gt;');
      expect($('#direction-decode').checked).toBe(true);
      expect($('#output').value).toBe('<p>Hi</p>');
    });

    it.each(['html', 'url', 'javascript', 'json', 'base64', 'xml'])(
      'swapping twice gets back to the original text (%s)',
      (codec) => {
        start();
        selectCodec(codec);
        const original = `<a title="x">Tom & 'Jerry' café 😀\n${'${y}'}</a>`;
        type(original);
        $('#swap-btn').click();
        $('#swap-btn').click();
        expect($('#input').value).toBe(original);
        expect($('#direction-encode').checked).toBe(true);
      },
    );
  });

  describe('clear and undo', () => {
    it('clears, offers undo, and restores the text', () => {
      start();
      type('keep me');
      $('#clear-btn').click();
      expect($('#input').value).toBe('');
      expect($('#clear-btn').textContent).toBe('Undo clear');
      expect($('#clear-btn').disabled).toBe(false);

      $('#clear-btn').click();
      expect($('#input').value).toBe('keep me');
      expect($('#clear-btn').textContent).toBe('Clear');
    });

    it('stops offering undo after a few seconds', () => {
      start();
      type('gone');
      $('#clear-btn').click();
      vi.advanceTimersByTime(UNDO_CLEAR_MS);
      expect($('#clear-btn').textContent).toBe('Clear');
      expect($('#clear-btn').disabled).toBe(true);
    });

    it('drops the undo once the user starts typing again', () => {
      start();
      type('old');
      $('#clear-btn').click();
      type('new');
      expect($('#clear-btn').textContent).toBe('Clear');
      $('#clear-btn').click();
      expect($('#input').value).toBe('');
    });
  });

  describe('double-encoding notice', () => {
    it('appears when the input already has entities, with examples', () => {
      start();
      type('plain & simple');
      expect($('#encoded-notice').hidden).toBe(true);

      type('Fish &amp; chips &copy;');
      expect($('#encoded-notice').hidden).toBe(false);
      expect($('#notice-examples').textContent).toBe('&amp;, &copy;');
      expect($('#input').getAttribute('aria-describedby')).toBe('encoded-notice');
    });

    it('"Unescape instead" switches direction', () => {
      start();
      type('&lt;b&gt;');
      $('[data-action="decode"]').click();
      expect($('#direction-decode').checked).toBe(true);
      expect($('#output').value).toBe('<b>');
      expect($('#encoded-notice').hidden).toBe(true);
      expect(document.activeElement).toBe($('#input'));
    });

    it('"Keep existing entities" turns the option on', () => {
      start();
      type('&amp; <b>');
      $('[data-action="keep"]').click();
      expect($('[data-option-id="keepExistingEntities"]').checked).toBe(true);
      expect($('#output').value).toBe('&amp; &lt;b&gt;');
      expect($('#encoded-notice').hidden).toBe(true);
    });

    it('"Escape anyway" hides it until the entities are gone', () => {
      start();
      type('&amp;');
      $('[data-action="dismiss"]').click();
      expect($('#encoded-notice').hidden).toBe(true);
      type('&amp; still here');
      expect($('#encoded-notice').hidden).toBe(true);
      type('none now');
      type('&lt; back again');
      expect($('#encoded-notice').hidden).toBe(false);
    });

    it('uses the wording of the current format', () => {
      start();
      selectCodec('url');
      type('already%20encoded');
      expect($('#encoded-notice').hidden).toBe(false);
      expect($('#notice-description').textContent).toBe('percent-encoding');
      expect($('#notice-examples').textContent).toBe('%20');
      expect($('#notice-consequence').textContent).toBe(
        'Encoding it again will double-encode them.',
      );
      expect($('[data-action="decode"]').textContent).toBe('Decode instead');
      expect($('[data-action="keep"]').textContent).toBe('Keep existing %-encoding');
      expect($('[data-action="dismiss"]').textContent).toBe('Encode anyway');

      $('[data-action="keep"]').click();
      expect($('#output').value).toBe('already%20encoded');
    });

    it('never appears when decoding, or for formats without a check', () => {
      start();
      $('#direction-decode').click();
      type('&amp;');
      expect($('#encoded-notice').hidden).toBe(true);
      $('#direction-encode').click();
      selectCodec('base64');
      expect($('#encoded-notice').hidden).toBe(true);
    });
  });

  describe('keyboard shortcuts', () => {
    it('Ctrl+Enter copies from inside the textarea', async () => {
      const writeText = mockClipboard();
      start();
      type('<p>');
      $('#input').focus();
      press('Enter', { ctrlKey: true });
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('&lt;p&gt;'));
    });

    it('⌘+Shift+Enter swaps', () => {
      start();
      type('<p>');
      $('#input').focus();
      press('Enter', { metaKey: true, shiftKey: true });
      expect($('#direction-decode').checked).toBe(true);
      expect($('#input').value).toBe('&lt;p&gt;');
    });

    it('plain Enter still types a newline (is not intercepted)', () => {
      start();
      $('#input').focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      $('#input').dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('auto-copy on paste', () => {
    it('copies after a paste only when the option is on', async () => {
      const writeText = mockClipboard();
      start();
      type('<a>', 'insertFromPaste');
      await vi.advanceTimersByTimeAsync(0);
      expect(writeText).not.toHaveBeenCalled();

      $('#opt-auto-copy').click();
      type('<b>', 'insertFromPaste');
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('&lt;b&gt;'));

      writeText.mockClear();
      type('<b>x', 'insertText');
      await vi.advanceTimersByTimeAsync(0);
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('restores text, format, direction, options and view on the next visit', () => {
      const storage = memoryStorage();
      start({ storage });
      selectCodec('url');
      setOption('variant', 'form');
      $('#direction-decode').click();
      $('#view-changes').click();
      $('#opt-auto-copy').click();
      type('a+b%21');
      vi.advanceTimersByTime(300);
      app.destroy();

      document.body.innerHTML = bodyMarkup;
      start({ storage });
      expect($('#codec-select').value).toBe('url');
      expect($('[data-option-id="variant"]').value).toBe('form');
      expect($('#direction-decode').checked).toBe(true);
      expect($('#view-changes').checked).toBe(true);
      expect($('#opt-auto-copy').checked).toBe(true);
      expect($('#input').value).toBe('a+b%21');
      expect($('#output-changes').textContent).toBe('a b!');
    });

    it('forgets the text immediately when "Remember" is unticked', () => {
      const storage = memoryStorage();
      start({ storage });
      type('private');
      vi.advanceTimersByTime(300);
      expect(storage.getItem(STORAGE_KEY)).toContain('private');

      $('#opt-remember').click();
      expect(storage.getItem(STORAGE_KEY)).not.toContain('private');

      app.destroy();
      document.body.innerHTML = bodyMarkup;
      start({ storage });
      expect($('#input').value).toBe('');
      expect($('#opt-remember').checked).toBe(false);
    });

    it('saves pending changes on pagehide', () => {
      const storage = memoryStorage();
      start({ storage });
      type('quick exit');
      window.dispatchEvent(new Event('pagehide'));
      expect(storage.getItem(STORAGE_KEY)).toContain('quick exit');
    });
  });

  describe('theme', () => {
    it('applies an explicit choice and follows the system otherwise', () => {
      start();
      expect($('#theme-select').value).toBe('system');
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

      $('#theme-select').value = 'light';
      $('#theme-select').dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      $('#theme-select').value = 'system';
      $('#theme-select').dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    it('remembers the choice and tells the preview', () => {
      const storage = memoryStorage();
      start({ storage });
      $('#theme-select').value = 'light';
      $('#theme-select').dispatchEvent(new Event('change', { bubbles: true }));
      type('<b>x</b>');
      $('#view-preview').click();
      vi.advanceTimersByTime(300);
      expect($('#preview-frame').srcdoc).toContain('<body class="light">');
      expect(JSON.parse(storage.getItem(STORAGE_KEY)).theme).toBe('light');
    });
  });

  describe('files', () => {
    function chooseFile(file) {
      Object.defineProperty($('#file-input'), 'files', { value: [file], configurable: true });
      $('#file-input').dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('"Open file…" loads a text file into the input', async () => {
      start();
      const click = vi.spyOn($('#file-input'), 'click').mockImplementation(() => {});
      $('#open-file-btn').click();
      expect(click).toHaveBeenCalled();

      chooseFile(new File(['<p>from a file</p>'], 'snippet.html', { type: 'text/html' }));
      await vi.waitFor(() => expect($('#input').value).toBe('<p>from a file</p>'));
      expect($('#output').value).toBe('&lt;p&gt;from a file&lt;/p&gt;');
      expect($('#input-message').textContent).toBe('Opened "snippet.html" (18 characters).');
    });

    it('refuses binary and oversized files with a message', async () => {
      start();
      type('unchanged');
      chooseFile(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0])], 'image.png'));
      await vi.waitFor(() =>
        expect($('#input-message').textContent).toMatch(/looks like a binary file/),
      );
      expect($('#input').value).toBe('unchanged');

      chooseFile(new File(['x'.repeat(5 * 1024 * 1024 + 1)], 'huge.txt'));
      await vi.waitFor(() =>
        expect($('#input-message').textContent).toMatch(/too large .* limit is 5\.0 MB/),
      );
      expect($('#input').value).toBe('unchanged');
    });

    it('downloads the output, named after the opened file', async () => {
      start();
      const createObjectURL = vi.fn(() => 'blob:test');
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = vi.fn();
      const clicked = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        clicked.push({ download: this.download, href: this.href });
      });

      expect($('#download-btn').disabled).toBe(true);
      chooseFile(new File(['<b>'], 'notes.md'));
      await vi.waitFor(() => expect($('#download-btn').disabled).toBe(false));
      $('#download-btn').click();

      expect(clicked).toEqual([{ download: 'notes-html-escaped.txt', href: 'blob:test' }]);
      expect(await createObjectURL.mock.calls[0][0].text()).toBe('&lt;b&gt;');
    });
  });

  describe('very large input', () => {
    const big = (extra) => 'x'.repeat(LARGE_INPUT_LENGTH) + extra;

    it('debounces typing, but applies pastes at once', () => {
      start();
      type(big('<'));
      expect($('#output').value).toBe('');
      vi.advanceTimersByTime(LARGE_INPUT_DELAY_MS);
      expect($('#output').value.endsWith('&lt;')).toBe(true);

      type(big('>'), 'insertFromPaste');
      expect($('#output').value.endsWith('&gt;')).toBe(true);
    });

    it('commits pending typing before copying', async () => {
      const writeText = mockClipboard();
      start();
      type(big('&'));
      $('#copy-btn').disabled = false; // as if the previous output were still showing
      $('#copy-btn').click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(writeText.mock.calls[0][0].endsWith('&amp;')).toBe(true);
    });
  });

  describe('keyboard-only operation', () => {
    it('every control is a native, focusable form control', () => {
      start();
      type('x'); // enables Clear and Copy
      const controls = [
        '#theme-select',
        '#codec-select',
        '#direction-encode',
        '#direction-decode',
        '#options-panel summary',
        '[data-option-id="characters"]',
        '[data-option-id="keepExistingEntities"]',
        '#input',
        '#open-file-btn',
        '#clear-btn',
        '#swap-btn',
        '#view-text',
        '#view-changes',
        '#view-preview',
        '#output',
        '#opt-auto-copy',
        '#opt-remember',
        '#copy-btn',
        '#download-btn',
        '.app__shortcuts',
      ];
      for (const selector of controls) {
        const el = $(selector);
        expect(el, selector).not.toBeNull();
        expect(['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'SUMMARY'], selector).toContain(
          el.tagName,
        );
        expect(el.disabled, selector).toBeFalsy();
      }
      // The highlighted view is scrollable, so it must be reachable too.
      expect($('#output-changes').tabIndex).toBe(0);
    });
  });
});
