// buttonDeviceAnimation.test.js — a key's own parts play what is put on them (editor/ButtonDeviceParts.svelte,
// through ControlAnatomy): the Components showcase's Button, second half (docs/design/component-presets.md).
//
// The promises: a keyframe animation on a part moves it about its own centre, on a group of its own
// inside the part's travel; a colour frame on a part reaches every shape it paints with, and no
// other part; a state change eases a part's colour and opacity on the part's own timing; every part
// sets all of these, `none` where it has nothing; the legend plays a text effect on its words, whole,
// in a box when the effect moves them; and a button's caption plays the control's own text effect
// and text colour frames.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import ControlAnatomy from '../src/CE_Application/editor/ControlAnatomy.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { buttonDeviceDrawn } from '../src/CE_Application/models/buttonDeviceParts.js';
import { readTextEffect } from '../src/CE_Application/utils/textEffects.js';

const effect = (fields) => readTextEffect({ kind: 'text', enabled: true, name: 'fx', ...fields });
const keyIn = (type, setId) => {
  const control = resolveControlForSet(createControl(type), getControlSet(setId));
  control._children.Text.content = 'Play';
  assert.ok(buttonDeviceDrawn(control), `${setId} draws a ${type} as a key`);
  return control;
};
const draw = (control, props = {}) => render(ControlAnatomy, { props: { control, width: 200, height: 100, label: 'Play', ...props } }).body;
/** The markup of one part, from its opening group to the next part's. */
const partOf = (html, name) => {
  const start = html.indexOf(`data-part="${name}"`);
  assert.ok(start >= 0, `${name} is drawn`);
  const next = html.indexOf('data-part="', start + 10);
  return html.slice(start, next < 0 ? undefined : next);
};

test('at rest every part sets its channels to none, paints through them, and has no motion group', () => {
  const html = draw(keyIn('MomentaryButton', 'stompbox'));
  for (const name of ['housing', 'key', 'indicator']) {
    const part = partOf(html, name);
    assert.match(part, /style="opacity:1;--ce-colour-transition:none;--ce-colour-timing:0s;--ce-kf-paint:none;--ce-kf-shape:none;/, `${name}: its own none`);
    assert.match(part, /style="fill:[^;]+;transition:var\(--ce-colour-transition, none\);animation:var\(--ce-kf-shape, none\);"/, `${name}: paints through them`);
    assert.doesNotMatch(part, /data-part-moves/, `${name}: nothing moves it`);
  }
});

test('a keyframe animation moves its part about the part\'s own centre; a colour frame reaches that part only', () => {
  const html = draw(keyIn('MomentaryButton', 'stompbox'), {
    partAnimations: new Map([['indicator', ['ce-kf-a1-a 1000ms linear 0ms infinite normal both running']]]),
    partColours: new Map([['indicator', { shape: ['ce-kf-shape-b2-a 1000ms linear 0ms infinite normal both running'] }]]),
  });
  const lamp = partOf(html, 'indicator');
  assert.match(lamp, /data-part-moves="" style="transform-box:fill-box;transform-origin:center;animation:ce-kf-a1-a 1000ms/);
  assert.match(lamp, /--ce-kf-shape:ce-kf-shape-b2-a 1000ms/);
  const key = partOf(html, 'key');
  assert.doesNotMatch(key, /data-part-moves/);
  assert.match(key, /--ce-kf-shape:none/, 'the lamp\'s colour stays on the lamp');
});

test('a state change eases a part\'s colour and opacity on the part\'s timing, and never its travel', () => {
  const html = draw(keyIn('ToggleButton', 'stompbox'), {
    partTransitions: new Map([['indicator', { transform: '200ms ease', opacity: '420ms ease', colour: '420ms ease' }]]),
  });
  const lamp = partOf(html, 'indicator');
  assert.match(lamp, /transition:opacity 420ms ease, fill-opacity 420ms ease, stroke-opacity 420ms ease, fill 420ms ease/);
  assert.match(lamp, /--ce-colour-transition:fill 420ms ease, stroke 420ms ease, stop-color 420ms ease, color 420ms ease;/);
  assert.doesNotMatch(lamp, /transition:[^;]*transform/, 'a part\'s travel is an SVG attribute, which no transition moves');
  assert.match(partOf(html, 'key'), /--ce-colour-transition:none;/);
});

test('the legend plays a text effect on its words, whole, in a box of its own when the effect moves them', () => {
  const toggle = keyIn('ToggleButton', 'neon');
  const words = (fields) => new Map([['legend', [{ name: 'fx', phase: 'a', effect: effect(fields) }]]]);
  const rolled = partOf(draw(toggle, { partTexts: words({ effect: 'roll', direction: 'up' }) }), 'legend');
  assert.match(rolled, /<g style="fill:[^"]+" clip-path="url\(#([^)]+-legend-clip)\)">(<!--[^>]*-->)*<clipPath id="\1"><rect /);
  // The piece's words sit in a branch of their own (a reel draws a column there instead).
  assert.match(rolled, /<text [^>]*style="[^"]*animation:[^"]*ce-tx-[^"]*" data-word-piece="">(<!--[^>]*-->)*O(<!--[^>]*-->)*<\/text>/);
  const faded = partOf(draw(toggle, { partTexts: words({ effect: 'crossfade' }) }), 'legend');
  assert.doesNotMatch(faded, /legend-clip/, 'a crossfade moves nothing, so nothing is clipped');
  assert.match(faded, /data-word-piece=""/);
  const still = partOf(draw(toggle), 'legend');
  assert.doesNotMatch(still, /data-word-piece/);
  assert.match(still, /<text [^>]*>O<\/text>/, 'off, it reads O');
});

test('a button\'s caption plays the control\'s own text effect, and its text colour frames otherwise', () => {
  const key = keyIn('MomentaryButton', 'stompbox');
  const still = draw(key);
  assert.match(still, /<text [^>]*fill="currentColor" style="color:[^;]+;animation:var\(--ce-kf-text, none\);"[^>]*>Play<\/text>/);
  const pushed = draw(key, { partTexts: new Map([['', [{ name: 'fx', phase: 'a', effect: effect({ effect: 'push', direction: 'right' }) }]]]) });
  assert.match(pushed, /<g clip-path="url\(#([^)]+-cap-(frame|lay))\)"[^>]*><clipPath id="\1"><rect [^>]*><\/rect><\/clipPath><text [^>]*style="color:[^;]+;[^"]*animation:[^"]*ce-tx-[^"]*" data-word-piece=""[^>]*>Play<\/text>/);
  // A knob's own words are its readout's: its caption is not given the control's effect.
  const knob = createControl('Knob');
  knob._children.Core.controlForm = 'disc';
  const dial = render(ControlAnatomy, { props: { control: knob, width: 120, height: 128, partTexts: new Map([['', [{ name: 'fx', phase: 'a', effect: effect({ effect: 'push' }) }]]]) } }).body;
  assert.doesNotMatch(dial, /data-word-piece/);
});
