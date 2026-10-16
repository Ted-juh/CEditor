// stepSequenceRedraw.test.js — Turing, Arp and Phrase are resolved again when the step they draw moves,
// not every frame.
//
// Their renderers draw the step they are on (`head`, `playStep`), never the clock between steps, but
// their value sources read orbitClock, which moves every frame while anything free-running plays. So
// each was resolved sixty times a second to draw the same step: QA-08's three were resolved about
// 120 times a second between them, where their steps move about 16 times. They now read their entry
// in `shownSteps`, which the shared frame works out after the tickers from what the value sources
// inject, and which changes only when what they draw does. Counted in the built player page with
// QA-08: Turing 4, Arp 12 and Phrase 17 resolves in two seconds, against 117 each.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';

const SURFACE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/CE_Application/editor/PanelPreviewSurface.svelte');
const source = readText(SURFACE);

/** The body of a top-level function in the component's script. */
function body(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} is in PanelPreviewSurface`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

test('the step sequences read the step they draw, not the frame clock', () => {
  for (const name of ['applyTuringValueSource', 'applyArpValueSource', 'applyPhraseValueSource']) {
    const fn = body(name);
    assert.doesNotMatch(fn, /orbitClock/, `${name} would be resolved every frame`);
    assert.match(fn, /shownSteps\[getControlId\(control\)\]/, `${name} reads its own entry, so another's step does not resolve it`);
  }
});
test('what they show is worked out once a frame, after the tickers, with what the value sources draw from', () => {
  // (Both wait while the host's window is minimised: playerPageTraffic.test.js.)
  assert.match(source, /sharedAnimationFrame\(\(\) => \{ if \(hostShown\) \{ orbitClock = Date\.now\(\); noteShownSteps\(\); \} \}\)/);
  // Each key comes from the same function its value source injects, so the two cannot disagree on
  // when the drawing changes: the Turing's phase, the Arp's phase and source notes, the Phrase's step.
  assert.match(body('applyTuringValueSource'), /__phase: turingPhaseFor\(control\)/);
  assert.match(body('turingShownStep'), /turingStepIndex\(turingControlWith\(control, turingPhaseFor\(raw\)\)\)/);
  assert.match(body('arpShownStep'), /arpControlWith\(control, arpPhaseFor\(raw\)\)/);
  assert.match(body('applyPhraseValueSource'), /__step: phraseShownStep\(control, cfg\)/);
});
