import { decodeHTML } from 'entities/decode';
import { trackedReplace } from './tracked-replace.js';

/**
 * Anything that could start a character reference. Kept deliberately loose
 * (optional `;`, optional digits) so that every sequence the HTML decoder
 * would act on is matched; non-entities decode to themselves and are left as
 * they are.
 */
const REFERENCE_PATTERN = /&(?:#[xX][0-9a-fA-F]*|#[0-9]*|[a-zA-Z][a-zA-Z0-9]*);?/g;

/**
 * Decode HTML character references exactly as a browser would in element
 * text: named (`&copy;`), decimal (`&#39;`) and hex (`&#x27;`), including the
 * legacy forms browsers accept without a semicolon (`&copy`).
 *
 * @param {string} text
 */
export function unescapeHtmlTracked(text) {
  return trackedReplace(String(text), REFERENCE_PATTERN, (match) => decodeHTML(match));
}

/**
 * @param {string} text
 * @returns {{ text: string, count: number }}
 */
export function unescapeHtmlWithCount(text) {
  const { text: decoded, count } = unescapeHtmlTracked(text);
  return { text: decoded, count };
}

/**
 * @param {string} text
 * @returns {string}
 */
export function unescapeHtml(text) {
  return unescapeHtmlTracked(text).text;
}
