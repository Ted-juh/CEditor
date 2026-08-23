// helpDocs.test.js — the documentation bundle, and finding things in it.
//
// TWO JOBS. The first is freshness, the same contract `scriptingManual.test.js` has: the bundle is
// a generated file, so the only thing that stops it silently describing last month's manual is a
// test that regenerates it and compares. The cost of a baked artefact is staleness, and this is
// what is paid for it.
//
// The second is the search, because a help browser's real failure is not a crash — it is a reader
// searching for "sysex", getting nothing, and concluding the program cannot do it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { HELP_DOCS, HELP_GAPS, HELP_SECTIONS, helpDocById } from '../src/CE_Application/generated/helpDocs.js';
import { headingIndex, searchHelp } from '../src/CE_Application/utils/helpSearch.js';
import { HELP_DOCUMENTS, OUT, buildHelpBundle, renderModule } from '../scripts/generate-help-bundle.mjs';

// --- freshness ---------------------------------------------------------------------------------

test('the committed bundle matches what the generator produces', () => {
  // Fails when a shipped document changed and `npm run docs:help` was not run. That is the whole
  // reason a generated file is acceptable here.
  const expected = renderModule(buildHelpBundle());
  const actual = readFileSync(OUT, 'utf8');
  assert.equal(actual, expected,
    'src/CE_Application/generated/helpDocs.js is stale — run `npm run docs:help`');
});

test('every document named in the generator is in the bundle, with its text', () => {
  assert.equal(HELP_DOCS.length, HELP_DOCUMENTS.length);
  for (const doc of HELP_DOCS) {
    assert.ok(doc.text.length > 500, `${doc.title} is suspiciously short`);
    assert.ok(doc.title && doc.section && doc.blurb, `${doc.id} is missing index metadata`);
    assert.ok(doc.words > 100, `${doc.title} has no word count`);
    assert.ok(doc.opening.length > 20, `${doc.title} has no opening line for the index`);
  }
});

test('the stale editor manual is deliberately not shipped, and the gap is stated', () => {
  // It calls itself a historical snapshot on its own first line, its generator is not in the tree,
  // and the editor has replaced two of the files it read. Shipping it as the manual would be
  // shipping a document that is wrong about the program it is inside — but an index that simply
  // omits it reads as "there is no editor manual to have".
  assert.ok(!HELP_DOCS.some((doc) => doc.source.includes('editor-manual')),
    'the 2026-08-10 snapshot is being shipped as current documentation');
  assert.ok(HELP_GAPS.length > 0, 'the missing editor manual must be stated somewhere');
  assert.match(HELP_GAPS.join(' '), /editor manual/i);
});

test('sections are in reading order — what to read first, then the rest', () => {
  assert.equal(HELP_SECTIONS[0], 'Start here');
  for (const doc of HELP_DOCS) assert.ok(HELP_SECTIONS.includes(doc.section), doc.section);
});

test('helpDocById finds a document and refuses an unknown one', () => {
  assert.equal(helpDocById(HELP_DOCS[0].id)?.id, HELP_DOCS[0].id);
  assert.equal(helpDocById('no-such-doc'), null);
});

test('the bundle is not so large it becomes the reason the app is slow to start', () => {
  // Not a network budget — this is read off local disk — but 124 KB of documentation sitting in
  // the eager entry chunk is a parse cost on every launch. A limit that catches growth by an order
  // of magnitude, not one meant to be met.
  const bytes = HELP_DOCS.reduce((sum, doc) => sum + doc.text.length, 0);
  assert.ok(bytes < 600_000, `the help bundle is ${(bytes / 1024).toFixed(0)} KB`);
});

// --- search ---------------------------------------------------------------------------------

test('searching finds a term that is genuinely in the manual', () => {
  const results = searchHelp(HELP_DOCS, 'sysex');
  assert.ok(results.total > 0, 'a reader who searches for sysex and finds nothing concludes it is impossible');
  assert.ok(results.groups[0].hits[0].text.toLowerCase().includes('sysex'));
});

test('a hit knows which heading it is under, so it can be navigated to', () => {
  const results = searchHelp(HELP_DOCS, 'buildDump');
  const hit = results.groups.flatMap((g) => g.hits).find((h) => h.heading);
  assert.ok(hit, 'no hit could say where it was');
  assert.ok(hit.slug, 'a heading with no slug cannot be scrolled to');
});

test('search is case-insensitive, which is how people type', () => {
  assert.equal(searchHelp(HELP_DOCS, 'SYSEX').total, searchHelp(HELP_DOCS, 'sysex').total);
});

test('a term in no document returns nothing rather than everything', () => {
  assert.equal(searchHelp(HELP_DOCS, 'zzzzznotaword').total, 0);
});

test('one-character queries are ignored — they match everything and mean nothing', () => {
  assert.equal(searchHelp(HELP_DOCS, 'a').total, 0);
  assert.equal(searchHelp(HELP_DOCS, '').total, 0);
});

test('a common term cannot let one document bury the others', () => {
  // The per-document cap. Without it, 200 hits in the manual push the one hit in the cookbook off
  // the end of the list, and the cookbook is where the worked example is.
  const results = searchHelp(HELP_DOCS, 'script', { perDocument: 3 });
  for (const group of results.groups) {
    assert.ok(group.hits.length <= 3, `${group.title} returned ${group.hits.length} hits`);
  }
  assert.ok(results.groups.length > 1, 'more than one document should be represented');
});

test('what the cap hides is counted, not silently dropped', () => {
  // A truncated list that does not say it is truncated reads as "that is all there is".
  const results = searchHelp(HELP_DOCS, 'script', { perDocument: 2 });
  const truncated = results.groups.find((g) => g.found > 2);
  assert.ok(truncated, 'expected at least one document with more than two hits');
  assert.equal(truncated.hidden, truncated.found - truncated.hits.length);
  assert.ok(truncated.hidden > 0);
});

test('documents with the most hits come first', () => {
  const results = searchHelp(HELP_DOCS, 'panel');
  const counts = results.groups.map((g) => g.found);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});

test('the heading index does not credit a comment inside a code block', () => {
  // `# apt-get install thing` in a shell block is not a heading, and a hit on the line below it
  // must still be attributed to the real section above.
  const text = '# Real Heading\n\ntext\n\n```sh\n# not a heading\necho hit\n```\n';
  const index = headingIndex(text);
  const line = text.split('\n').indexOf('echo hit');
  assert.equal(index[line]?.title, 'Real Heading');
});
