// exportParts.test.js — the complete export form's custom-component parts travel sparse and arrive whole.
//
// serializePanelForExport writes the complete form, the step before the payload (exportForm.test.js
// for that): every control whole, because what comes after it reads whole controls. Parts were
// written complete with it, and they were most of the file: 26 of the AN1x's 35 MB. Nothing reads a
// part there; the player page that draws them expands every part as it loads. So parts go out as a
// saved document has them (shrinkAuthoredParts in stores/documentShape.js).
//
// Two things have to hold, and each test below is one of them: the player builds exactly the panel
// it built before, and the parts in the payload really are sparse — on nested controls too, since
// a container's children are where a missed recursion would quietly leave them whole.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { expandControl, shrinkAuthoredParts } from '../src/CE_Application/stores/documentShape.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GAIA = 'CE/panels/Roland GAIA SH-01.cepanel';
const QA = ['01-components', '03-states', '07-packages', '08-export', '09-custom-stress']
  .map((n) => `CE/qa/QA-${n}.cepanel`);

const open = (rel) => deserializePanel(readText(path.join(REPO, rel)), rel, null);

/** Every control, containers' children included, in document order. */
function* everyControl(controls) {
  for (const control of controls ?? []) {
    yield control;
    yield* everyControl(Object.values(control?._children?.Children?._children ?? {}));
  }
}

test('the player builds the same controls from sparse parts as from whole ones', () => {
  // expandControl is what deserializePanel runs on each control of the payload, so this compares
  // the player's model from the old payload (complete controls) with the new one, control by
  // control. Top-level only: expandControl recurses into children itself.
  for (const rel of [GAIA, ...QA]) {
    const panel = open(rel);
    let parts = 0;
    for (const control of panel.controls) {
      assert.deepEqual(expandControl(shrinkAuthoredParts(control)), expandControl(control),
        `${rel}: ${control._children.Core.id} loads differently from a payload with sparse parts`);
    }
    for (const control of everyControl(panel.controls)) {
      parts += Object.keys(control._children.Parts?._children ?? {}).length;
    }
    assert.ok(rel !== GAIA || parts > 3000, `the GAIA panel should exercise thousands of parts, saw ${parts}`);
  }
});

test('the complete form keeps controls whole and writes parts without their defaults', async () => {
  const { serializePanelForExport } = await import('../src/CE_Application/stores/panels.js');
  const panel = open(GAIA);
  const payload = JSON.parse(serializePanelForExport(panel));
  assert.equal(payload.documentForm, 'complete', 'marked, so exportFormDocument knows what it was given');

  // A part's Fill always holds `imageSrc: ''` when complete, and a sparse part never writes it.
  // Counted over every custom component's parts, nested ones included. Custom components only: a
  // built-in type's own parts (a Number's increment and decrement) are part of the control, which
  // stays complete.
  let whole = 0;
  let sparse = 0;
  let controlFills = 0;
  for (const control of everyControl(payload.controls)) {
    if (control._children.Background?._children?.Fill?.imageSrc === '') controlFills++;
    if (control._children.Core.controlType !== 'CustomComponent') continue;
    for (const part of Object.values(control._children.Parts?._children ?? {})) {
      const fill = part._children?.Background?._children?.Fill;
      if (!fill) continue;
      if ('imageSrc' in fill) whole++;
      else sparse++;
      assert.equal(typeof part.name, 'string', 'a part keeps its name: bindings find it by that');
    }
  }
  assert.equal(whole, 0, `${whole} parts still carry their defaults (and ${sparse} do not)`);
  assert.ok(sparse > 3000, `expected the GAIA panel's thousands of parts, saw ${sparse}`);
  assert.ok(controlFills > 800, 'controls themselves stay complete — the export form is diffed from them');

  // And the point of it: the parts were most of the bytes.
  const before = JSON.stringify(panel.controls).length;
  const after = JSON.stringify(payload.controls).length;
  assert.ok(after < before / 2, `the payload's controls are ${after} bytes against ${before} in memory`);
});
