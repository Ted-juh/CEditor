// designerPreviewValue.test.js — a component in the Component Designer's Preview draws the value it
// is dragged to.
//
// The test surface handed the renderer its control as already resolved, always. The renderer then
// skips applying the preview session, which is right when the caller resolved the control with the
// session (the Interaction Preview tab, the Animation stage) and wrong when it passed the bare
// component, as the designer does: the value changed and the drawing never did, so the owner's
// knob ignored the mouse. It is handed over as resolved only when the caller resolved it now.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

// The surface removes its window listeners when it is torn down, which a server render does.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };

const { default: InteractiveTestSurface } = await import('../src/CE_Application/components/InteractiveTestSurface.svelte');
import { createInteractionPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';
import { gaiaKnob } from '../../../tools/scripts/gaia-panel/components.mjs';

function knob() {
  const control = gaiaKnob({ size: 50 });
  const channel = control._children.ValueChannels._children.value;
  Object.assign(channel, { type: 'int', min: 28, max: 100, step: 1, defaultValue: 64, currentValue: 64 });
  return control;
}

const drawn = (control, value, props = {}) => {
  const session = { ...createInteractionPreviewSession(control), customValues: { value } };
  return render(InteractiveTestSurface, { props: { control, session, compact: true, ...props } }).body;
};

test('the designer passes the bare component, and the drawing follows the value', () => {
  const control = knob();
  const low = drawn(control, 28);
  const high = drawn(control, 100);
  assert.notEqual(low, high, 'the knob draws the same at its minimum and its maximum');
  assert.equal(drawn(control, 28), low, 'and the same value draws the same');
});

test('a caller that resolved the control itself still has it drawn as given', () => {
  // The Interaction Preview tab and the Animation stage resolve the control with the session and pass
  // it in; the renderer must take that as it is rather than resolve it a second time.
  const control = knob();
  const resolved = knob();
  const a = drawn(control, 28, { resolvedControl: resolved });
  const b = drawn(control, 100, { resolvedControl: resolved });
  assert.equal(a, b, 'a resolved control was re-resolved from the session');
});
