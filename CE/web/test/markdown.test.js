// markdown.test.js — the renderer behind the in-app documentation.
//
// Two things are being pinned here and they are not equally important.
//
// The FIRST is safety, and it is the reason this renderer exists rather than a dependency. It runs
// inside WebView2, where `window` carries the bridge to C++, and its output goes through `{@html}`.
// A library would have arrived with an HTML passthrough that has to be turned off; here escaping is
// the first thing that happens, and these tests say so in the terms an attacker would.
//
// The SECOND is that the subset actually covers the documents it ships. A renderer that silently
// drops tables is worse than one that refuses them, because the scripting manual is largely tables.
// The last test in this file renders every shipped document and checks nothing vanished.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  documentOutline,
  documentTitle,
  escapeHtml,
  headingSlug,
  renderInline,
  renderMarkdown,
  safeHref,
} from '../src/CE_Application/utils/markdown.js';
import { HELP_DOCS } from '../src/CE_Application/generated/helpDocs.js';

// --- safety ---------------------------------------------------------------------------------

test('a document cannot introduce a tag', () => {
  const html = renderMarkdown('Text with <script>alert(1)</script> in it.');
  assert.ok(!html.includes('<script'), 'a script tag survived into the output');
  assert.match(html, /&lt;script&gt;/);
});

test('a document cannot introduce an event handler', () => {
  // The attribute text survives as TEXT, which is the point — it is escaped, so there is no tag
  // for it to be an attribute of. What must not appear is an opening angle bracket in front of it.
  const html = renderMarkdown('<img src=x onerror="alert(1)">');
  assert.ok(!html.includes('<img'), 'raw HTML must not pass through');
  assert.match(html, /&lt;img/, 'and it should still be readable as the text it is');
  assert.ok(!/<[a-z]+[^>]*\son\w+=/i.test(html), 'an event handler landed on a real tag');
});

test('a javascript: link renders as text, not as a link', () => {
  // This one is not theoretical: the bridge is on `window`, so a clickable javascript: URL inside
  // the documentation viewer would be a way into the C++ side.
  const html = renderMarkdown('[click me](javascript:alert(1))');
  assert.ok(!html.includes('<a '), 'a javascript: href was made clickable');
  assert.ok(html.includes('click me'), 'and the label should still be readable');
});

test('data: and file: links are refused the same way', () => {
  for (const href of ['data:text/html,<script>x</script>', 'file:///etc/passwd', 'vbscript:x']) {
    assert.equal(safeHref(href), null, href);
  }
});

test('http, https and in-page anchors are allowed', () => {
  assert.equal(safeHref('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHref('http://example.com'), 'http://example.com');
  assert.equal(safeHref('#a-section'), '#a-section');
});

test('a relative link becomes plain text — there is no file to open in here', () => {
  const html = renderMarkdown('see [the plan](./other-doc.md) for more');
  assert.ok(!html.includes('<a '), 'a link that goes nowhere is worse than no link');
  assert.match(html, /the plan/);
});

test('quotes and ampersands in text cannot break out of an attribute', () => {
  assert.equal(escapeHtml(`a"b&c<d>e'f`), 'a&quot;b&amp;c&lt;d&gt;e&#39;f');
});

// --- the subset -----------------------------------------------------------------------------

test('headings carry a slug an anchor can reach', () => {
  const html = renderMarkdown('## What it does\n');
  assert.match(html, /<h2 id="what-it-does">What it does<\/h2>/);
  // Punctuation is stripped, then runs of whitespace collapse to one hyphen — GitHub's rule, so
  // a `#value-range-0127` link written for the repository still lands here.
  assert.equal(headingSlug('Value / range — 0..127'), 'value-range-0127');
});

test('a code span containing asterisks stays literal', () => {
  // The reason code spans are extracted before inline formatting: the manual is full of these.
  const html = renderInline(escapeHtml('use `a ** b` not **bold**'));
  assert.match(html, /<code>a \*\* b<\/code>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test('fenced code is escaped and keeps its language', () => {
  const html = renderMarkdown('```js\nif (a < b) return "x";\n```');
  assert.match(html, /<pre><code class="language-js">/);
  assert.match(html, /a &lt; b/);
  assert.ok(!html.includes('<b>'));
});

test('a fence containing markdown does not render as markdown', () => {
  const html = renderMarkdown('```\n# not a heading\n- not a list\n```');
  assert.ok(!html.includes('<h1'), 'a comment inside a code block became a heading');
  assert.ok(!html.includes('<li>'));
});

test('lists, ordered and not, and a wrapped bullet', () => {
  const html = renderMarkdown('- one\n- two that wraps\n  onto the next line\n');
  assert.match(html, /<ul><li>one<\/li><li>two that wraps onto the next line<\/li><\/ul>/);
  assert.match(renderMarkdown('1. first\n2. second'), /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('a pipe table needs its divider before it is a table', () => {
  const table = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
  assert.match(table, /<table>.*<th>a<\/th>.*<td>1<\/td>.*<\/table>/s);

  // A line with pipes and no divider under it is a sentence, not a header row.
  const notTable = renderMarkdown('press Ctrl+A | Ctrl+B to select');
  assert.ok(!notTable.includes('<table'));
});

test('blockquotes, rules and strikethrough', () => {
  assert.match(renderMarkdown('> a note\n> continued'), /<blockquote><p>a note<\/p><p>continued<\/p><\/blockquote>/);
  assert.match(renderMarkdown('---'), /<hr>/);
  assert.match(renderMarkdown('~~gone~~'), /<del>gone<\/del>/);
});

test('an outline skips headings inside code blocks', () => {
  const outline = documentOutline('# Real\n\n```sh\n# apt-get install thing\n```\n\n## Also real');
  assert.deepEqual(outline.map((h) => h.title), ['Real', 'Also real']);
});

test('the title is the first H1, or null', () => {
  assert.equal(documentTitle('# The Manual\n\n## Section'), 'The Manual');
  assert.equal(documentTitle('no heading here'), null);
});

test('empty and junk input produce nothing rather than throwing', () => {
  for (const junk of [null, undefined, '', '\n\n\n']) assert.equal(renderMarkdown(junk), '');
});

// --- against the real documents ---------------------------------------------------------------

test('every shipped document renders, and none of them renders to almost nothing', () => {
  // The failure this guards: a construct the renderer does not know is DROPPED rather than passed
  // through, and a 14,000-word manual quietly becomes three paragraphs. Comparing rendered length
  // to source length catches that without pinning the exact HTML of a document that will change.
  for (const doc of HELP_DOCS) {
    const html = renderMarkdown(doc.text);
    assert.ok(html.length > doc.text.length * 0.5,
      `${doc.title} rendered to ${html.length} chars from ${doc.text.length} — content was dropped`);
    assert.ok(!html.includes('<script'), `${doc.title} produced a script tag`);
  }
});

test('every shipped document has an outline worth showing', () => {
  for (const doc of HELP_DOCS) {
    assert.ok(documentOutline(doc.text).length >= 2, `${doc.title} has no navigable structure`);
  }
});

test('heading slugs are unique enough to navigate within a document', () => {
  // A duplicate slug means an anchor click lands on the wrong section. Some duplication is
  // unavoidable in a big manual; this asserts it stays a small fraction rather than the norm.
  for (const doc of HELP_DOCS) {
    const slugs = documentOutline(doc.text, { maxLevel: 2 }).map((h) => h.slug);
    const unique = new Set(slugs);
    assert.ok(unique.size >= slugs.length * 0.9,
      `${doc.title}: ${slugs.length - unique.size} of ${slugs.length} top-level slugs collide`);
  }
});
