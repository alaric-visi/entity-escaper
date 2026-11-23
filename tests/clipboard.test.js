// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/lib/clipboard.js';

function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

describe('copyText', () => {
  beforeEach(() => {
    document.execCommand = vi.fn(() => true);
  });

  afterEach(() => {
    setClipboard(undefined);
    delete document.execCommand;
    vi.restoreAllMocks();
  });

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    setClipboard({ writeText: vi.fn(() => Promise.reject(new Error('denied'))) });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back when the Clipboard API is missing (insecure context)', async () => {
    setClipboard(undefined);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports failure when execCommand returns false (bug in the original)', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);

    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('reports failure when execCommand throws', async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error('nope');
    });

    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('cleans up the scratch textarea and restores focus', async () => {
    setClipboard(undefined);
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();

    await copyText('hello');

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});
