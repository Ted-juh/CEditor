// an1xPanel.test.js — the AN1x editor panel is generated, so it has to stay generated.
//
// WHY THIS FILE EXISTS, and it is not because anything was wrong with the panel. It is because it
// was the only committed generated artifact in the repository with no gate on it.
//
// Everything else that is built by a script and checked in has one: the eight QA sheets are pinned
// by `qaPanels.test.js`, the GAIA panel by `gaiaPanel.test.js`, the C++ script-module blocks and the
// scripting manual by `panelApiParity.test.js` and `manualWalkthrough.test.js`. The AN1x panel had
// `make-an1x-panel.mjs --check`, which nothing ran — not `npm test`, not CI. It happened to be up to
// date, by luck rather than by anything that would have noticed.
//
// That matters more here than almost anywhere, because this is the largest file in the repository
// at 26 MB. A model change that quietly alters how a control serialises leaves it stale, the next
// person to run the generator gets a 26 MB diff they did not make, and nobody can tell whether that
// diff is their change or six months of drift arriving at once.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSameText, readText } from './support/readText.mjs';
import { buildAn1xPanel, serializeAn1xPanel } from '../../../tools/scripts/an1x-panel/make-an1x-panel.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PANEL = path.join(REPO, 'CE/panels/Yamaha AN1x.cepanel');

test('the committed panel matches the generator', () => {
  // `slim` defaults to true in both the generator's CLI and its serializer, so this compares what
  // `node tools/scripts/an1x-panel/make-an1x-panel.mjs` would write. `--fat` is a debugging switch
  // and is not what is committed.
  assertSameText(readText(PANEL), serializeAn1xPanel(),
    'CE/panels/Yamaha AN1x.cepanel is stale — run: node tools/scripts/an1x-panel/make-an1x-panel.mjs',
    { actual: 'committed', expected: 'the generator' });
});

test('the panel is the whole synth, not a fragment of it', () => {
  // A generator that throws is caught above; a generator that quietly produces half a panel is not.
  // The AN1x has two scenes over a large voice block, so the control count is in the hundreds — a
  // sudden drop means a section stopped being emitted rather than that somebody tidied up.
  const panel = buildAn1xPanel();
  assert.ok(panel.controls.length > 500,
    `expected the full AN1x, got ${panel.controls.length} controls`);
  assert.ok(panel.width > 0 && panel.height > 0, 'a panel with no size draws nothing');
});
