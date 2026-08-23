// helpSearch.js — finding a sentence in 19,000 words of documentation.
//
// Separate from the viewer because it is the only part of a help browser with any logic in it, and
// because a search that quietly misses things is the failure mode here: a reader who searches for
// "sysex" and gets nothing concludes the program cannot do it, which is the opposite of what the
// documentation is for.
//
// Deliberately not an index. Five documents and 124 KB is a linear scan measured in single-digit
// milliseconds; building an inverted index would be more code, more state to invalidate, and no
// difference a person could feel.

import { documentOutline } from './markdown.js';

/** How much of the line to show around a hit — enough to judge relevance, short enough to scan. */
const SNIPPET_RADIUS = 60;

const fold = (text) => String(text ?? '').toLowerCase();

/**
 * The heading a line sits under, so a result can say where it is and be clicked to get there.
 *
 * Computed per document rather than per hit: a document's heading positions do not change between
 * queries, and the manual has 400 of them.
 */
export function headingIndex(text) {
  const lines = String(text ?? '').split('\n');
  const outline = documentOutline(text, { maxLevel: 6 });
  const byLine = [];
  let cursor = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (heading && cursor < outline.length) {
      const title = heading[2].replace(/\s+#+\s*$/, '').trim();
      // documentOutline skips fenced code, so a `# comment` inside a block must not consume an
      // outline entry — match by title before advancing.
      if (outline[cursor]?.title === title) cursor += 1;
    }
    byLine[i] = cursor > 0 ? outline[cursor - 1] : null;
  }
  return byLine;
}

function snippet(line, at, query) {
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(line.length, at + query.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${line.slice(start, end).trim()}${end < line.length ? '…' : ''}`;
}

/**
 * Every line in every document that contains the query.
 *
 * Results are grouped by document and capped per document rather than globally, so a query that
 * appears 200 times in the manual cannot bury the one hit in the cookbook. What is dropped is
 * counted and reported — a truncated result list that does not say it is truncated reads as
 * "that is all there is".
 */
export function searchHelp(docs, query, { perDocument = 8 } = {}) {
  const needle = fold(query).trim();
  if (needle.length < 2) return { query: needle, groups: [], total: 0 };

  const groups = [];
  let total = 0;

  for (const doc of docs ?? []) {
    const lines = String(doc.text ?? '').split('\n');
    const headings = headingIndex(doc.text);
    const hits = [];
    let found = 0;

    for (let i = 0; i < lines.length; i += 1) {
      const at = fold(lines[i]).indexOf(needle);
      if (at < 0) continue;
      found += 1;
      if (hits.length < perDocument) {
        hits.push({
          line: i,
          heading: headings[i]?.title ?? null,
          slug: headings[i]?.slug ?? null,
          text: snippet(lines[i], at, needle),
        });
      }
    }

    if (found > 0) {
      total += found;
      groups.push({ id: doc.id, title: doc.title, hits, found, hidden: found - hits.length });
    }
  }

  // Most hits first: with five documents that is a better proxy for "the page about this" than any
  // scoring function worth writing.
  groups.sort((a, b) => b.found - a.found);
  return { query: needle, groups, total };
}
