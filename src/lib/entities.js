import { decodeHTMLStrict } from 'entities/decode';

/**
 * Something shaped like a complete entity: `&name;`, `&#123;` or `&#x1F600;`.
 * The trailing semicolon is required, so URL fragments such as `?a=1&copy=2`
 * or `AT&T` are never mistaken for entities.
 */
export const ENTITY_CANDIDATE_SOURCE = '&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);';

/**
 * True if `candidate` is a real HTML entity (e.g. `&amp;`, `&#39;`), as
 * opposed to something entity-shaped but unknown (e.g. `&foo;`).
 *
 * @param {string} candidate
 */
export function isEntity(candidate) {
  return decodeHTMLStrict(candidate) !== candidate;
}

/**
 * Distinct real entities found in `text`, in order of first appearance.
 *
 * @param {string} text
 * @param {{ limit?: number }} [options] stop after this many distinct entities
 * @returns {string[]}
 */
export function findEntities(text, { limit = Infinity } = {}) {
  const found = new Set();
  const pattern = new RegExp(ENTITY_CANDIDATE_SOURCE, 'g');
  for (const [match] of String(text).matchAll(pattern)) {
    if (!found.has(match) && isEntity(match)) {
      found.add(match);
      if (found.size >= limit) break;
    }
  }
  return [...found];
}
