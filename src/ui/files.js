/**
 * Reading a text file the user opened or dropped, and downloading output.
 */
import { pluralise } from '../lib/format.js';

/** Larger files make the editor sluggish; this is a text tool, not a file converter. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * @param {File} file
 * @returns {Promise<{ text: string } | { error: string }>}
 */
export async function readTextFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    return {
      error: `"${file.name}" is too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
    };
  }
  let text;
  try {
    text = await file.text();
  } catch {
    return { error: `"${file.name}" couldn't be read.` };
  }
  // NUL bytes don't appear in text files; they're the classic sign of binary data.
  if (text.includes('\0')) {
    return {
      error: `"${file.name}" looks like a binary file (an image, PDF or archive, say). Only text files can be opened.`,
    };
  }
  return { text };
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return pluralise(bytes, 'byte');
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A download name such as "notes-html-escaped.txt".
 *
 * @param {string | null} sourceName  name of the file the input came from, if any
 * @param {string} codecId
 * @param {string} action  e.g. "Escape", "Decode"
 */
export function downloadName(sourceName, codecId, action) {
  const stem =
    (sourceName ?? 'output').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'output';
  const done = action.toLowerCase().replace(/e$/, '') + 'ed';
  return `${stem}-${codecId}-${done}.txt`;
}

/**
 * Save `text` as a UTF-8 text file.
 *
 * @param {string} text
 * @param {string} filename
 */
export function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** @param {DataTransfer | null} transfer */
export function hasFiles(transfer) {
  return Boolean(transfer && [...transfer.types].includes('Files'));
}
