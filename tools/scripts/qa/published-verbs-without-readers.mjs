/**
 * Published script verbs whose section key nothing reads.
 *
 * Three of these were found by hand during the 2026-09-14 behaviour pass and written into
 * `docs/design/residual-issues-2026-09-14.md`. A list found by hand goes stale the moment somebody
 * adds a verb — which is exactly what happened to the custom-export count in the behaviour ledger,
 * where the suite grew and the written-down number did not. So the list is derived instead.
 *
 * WHY THIS KEEPS HAPPENING, and the reason a one-off audit cannot hold the line:
 * `derivedFlagVerbs()` in `scripting/componentVerbs.js` mints a verb for EVERY `show*` boolean in a
 * section, and for `editable`, whether or not anything reads them. A new `showThing: false` in a
 * section declaration therefore ships a published API promise for free, in all seven engines, with
 * nobody writing a line of verb-table code. Two of the three known cases arrived that way.
 *
 * A verb here is a promise the product cannot keep: the call succeeds and nothing happens.
 *
 * Run: node tools/scripts/qa/published-verbs-without-readers.mjs
 * Exit 0 always — this reports, it does not gate. Deciding what to do about a verb (implement it,
 * or stop declaring the key so the derivation stops minting it) is a release decision, and the
 * repository's own rule is not to delete a supported property to make a checklist green.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = fileURLToPath(new URL('../../../CE/web/src/CE_Application/', import.meta.url));
const DEFAULTS = join(APP, 'models/sectionDefaults.js');

// Every source file except two, and the second exclusion is the one that matters.
//
//  - `sectionDefaults.js` declares the key. A key that only its own default mentions has no reader
//    by definition.
//  - `scripting/componentVerbs.js` is the VERB TABLE. A hand-written verb names its field there —
//    `v('quantize', 'quantizeLoop', BOOL)` — so searching the whole tree finds that line and calls
//    the verb "read". It is not read; it is declared. Without this exclusion the report silently
//    misses every hand-written verb and only ever finds the derived ones, which is the half of the
//    problem that needs the least help.
const EXCLUDE = new Set([DEFAULTS, join(APP, 'scripting/componentVerbs.js')]);
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|svelte)$/.test(entry) && !EXCLUDE.has(p)) files.push(p);
  }
})(APP);
const read = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

/**
 * ATTRIBUTE THE READER TO A COMPONENT, which is the whole difficulty.
 *
 * A first attempt searched one blob of the whole tree and asked "is this key mentioned anywhere".
 * Nearly every key name is shared — `editable` is declared by twenty-six sections, `channel` by
 * ten — so a hit proves nothing about WHICH component reads it, and reporting every shared name as
 * undecidable produced 218 rows, which is the same as reporting nothing.
 *
 * So each section is given its own files: the ones named after it (`ArpRenderer.svelte`,
 * `ArpEditor.svelte`, `arpLayout.js`) plus the preview surface, which is where the runtime for
 * every component lives. A key read there belongs to this component. A key found ONLY outside that
 * set is the undecidable case, and there are few enough of those to look at by hand.
 */
const SHARED = files.filter((f) => /PanelPreviewSurface|panelRuntime|componentTables/.test(f));
const ownFilesFor = (section) => {
  const stem = section.toLowerCase();
  return files.filter((f) => {
    const base = basename(f).toLowerCase();
    return base.startsWith(stem) || base.startsWith(stem.replace(/s$/, ''));
  });
};

// Which OTHER sections declare the same key name. A hit in a file that belongs to neither can not
// be attributed, and this is what the report says so instead of guessing.
const declText = readFileSync(DEFAULTS, 'utf8');
const sectionsDeclaring = (key) => {
  const out = [];
  let cur = null;
  for (const line of declText.split('\n')) {
    const open = line.match(/^  ([A-Z][A-Za-z0-9]*): \{$/);
    if (open) { cur = open[1]; continue; }
    if (cur && /^  \},?$/.test(line)) { cur = null; continue; }
    if (cur && new RegExp(`^    ${key}:`).test(line)) out.push(cur);
  }
  return out;
};

const { COMPONENT_FAMILIES } = await import(pathToFileURL(join(APP, 'scripting/componentVerbs.js')).href);

const rows = [];
const unresolved = [];
for (const fam of COMPONENT_FAMILIES ?? []) {
  for (const verb of fam.verbs ?? []) {
    const field = verb.f;
    if (!field) continue;                       // the family-wide verbs carry no field of their own
    // A READER IS A MENTION OUTSIDE THE DECLARATION, and the test is deliberately generous: a key
    // read through a computed name (`corner${side}`) is invisible to any literal search, and four
    // Drum Pad fields were wrongly called inert exactly that way during the pass that prompted
    // this script. Generous here means false NEGATIVES — a verb that is really dead may not be
    // listed — which is the safe direction for a report whose findings lead to deletions.
    const shared = sectionsDeclaring(field).filter((name) => name !== fam.section);
    const re = new RegExp(`\\b${field}\\b`);
    const own = [...ownFilesFor(fam.section), ...SHARED];
    const seenHere = own.some((f) => re.test(read.get(f) ?? ''));
    if (seenHere) continue;                      // this component reads it: settled
    const seen = [...read.values()].some((t) => re.test(t));
    const name = `${fam.prefix}.${verb.v ?? field}`;
    // A SHARED KEY NAME HIDES A DEAD VERB, and this is the case that prompted the bucket.
    // `showField` is declared by both Constellation and Timbre. The Timbre's renderer reads its
    // own, so a bare-word search finds a hit and calls BOTH of them read — and the Constellation's,
    // which nothing reads, disappears from the report entirely. Silence in the wrong direction.
    // A name the search cannot attribute is reported as unresolved rather than passed.
    if (seen && shared.length) { unresolved.push({ name, section: fam.section, field, shared }); continue; }
    if (seen) continue;
    rows.push({ name, section: fam.section, field, shared });
  }
}

if (!rows.length) {
  console.log('Every published verb has a reader.');
} else {
  console.log(`${rows.length} published verb${rows.length === 1 ? '' : 's'} with no reader in src/:\n`);
  for (const r of rows) {
    const note = r.shared.length ? `   (also declared by ${r.shared.join(', ')})` : '';
    console.log(`  ${r.name.padEnd(34)} -> ${r.section}.${r.field}${note}`);
  }
  console.log('\nA script calling one of these succeeds and nothing happens.');
  console.log('Check each by hand before acting: a key read through a computed name is invisible here.');
}

if (unresolved.length) {
  console.log(`\n${unresolved.length} verb${unresolved.length === 1 ? '' : 's'} this search CANNOT decide:\n`);
  for (const r of unresolved) {
    console.log(`  ${r.name.padEnd(34)} -> ${r.section}.${r.field}   (also declared by ${r.shared.join(', ')})`);
  }
  console.log('\nThe key name is shared, so a reader found anywhere might belong to the neighbour.');
  console.log('Open the section\'s own renderer and look, rather than trusting either answer.');
}
