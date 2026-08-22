// The colour chooser: a 2D saturation/brightness square as the primary
// control, a hex field that accepts what people type and says why when it
// cannot, and a real screen eyedropper. What it replaced was four 1-D HSL
// bands, a field that silently reverted anything but 6 or 8 hex characters,
// and an "eyedropper" that only sampled images loaded into the Viewer tab.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import ColorChooser from '../src/CE_Application/components/ColorChooser.svelte';
import { eyedropperAvailable, pickScreenColour } from '../src/CE_Application/utils/screenEyedropper.js';

const chooser = (props) => render(ColorChooser, { props: { alpha: 1, stepSize: 0, ...props } }).body;

test('the square is the primary control, and it is a slider you can reach', () => {
  const html = chooser({ color: '4A90D9' });
  const square = html.match(/<div class="sv-square[^>]*>/)?.[0] ?? '';
  assert.match(square, /role="slider"/);
  assert.match(square, /tabindex="0"/, 'reachable by keyboard, not pointer-only');
  assert.match(square, /aria-label="Saturation and brightness"/);
  assert.match(html, /class="sv-thumb/, 'and it has a thumb');
});

test('the square reads out HSB, not HSL — this is exactly where the bug was', () => {
  // #4A90D9 is HSB (211, 66, 85). In HSL it is lightness 57, which is what
  // the old "B" band showed.
  const html = chooser({ color: '4A90D9' });
  assert.match(html, /aria-valuetext="Saturation 66%, brightness 85%"/);

  // A fully saturated colour is B = 100. The HSL reading would be 50.
  assert.match(chooser({ color: 'FF0000' }), /aria-valuetext="Saturation 100%, brightness 100%"/);
});

test('the thumb sits at saturation across and brightness up', () => {
  const red = chooser({ color: 'FF0000' }).match(/class="sv-thumb[^>]*style="left: ([\d.]+)%; top: ([\d.]+)%/);
  assert.deepEqual([Number(red[1]), Number(red[2])], [100, 0], 'pure hue: hard right, top');

  const black = chooser({ color: '000000' }).match(/class="sv-thumb[^>]*style="left: ([\d.]+)%; top: ([\d.]+)%/);
  assert.equal(Number(black[2]), 100, 'black is the bottom edge');

  const white = chooser({ color: 'FFFFFF' }).match(/class="sv-thumb[^>]*style="left: ([\d.]+)%; top: ([\d.]+)%/);
  assert.deepEqual([Number(white[1]), Number(white[2])], [0, 0], 'white is the top-left corner');
});

test('the square is painted for the current hue', () => {
  const html = chooser({ color: '4A90D9' });
  const square = html.match(/<div class="sv-square[^>]*style="background: ([^"]+)"/)?.[1] ?? '';
  assert.match(square, /to top, #000000/);
  assert.match(square, /to right, #FFFFFF/);
  assert.match(square, /#007DFF$/, 'the fully saturated form of the current hue');
});

test('the "B" band is labelled brightness and runs black to colour', () => {
  const html = chooser({ color: 'FF0000' });
  const band = html.match(/<div class="band[^"]*" data-band="brightness"[\s\S]{0,400}/)?.[0] ?? '';
  assert.match(band, /aria-label="Brightness \(HSB value\)"/);
  assert.match(band, /linear-gradient\(to right, #000000, #FF0000\)/);
  assert.ok(!/data-band="lightness"/.test(html), 'there is no lightness band any more');
});

test('all four bands survive, so the people who liked them still have them', () => {
  const html = chooser({ color: 'FF0000' });
  for (const id of ['hue', 'saturation', 'brightness', 'alpha']) {
    assert.match(html, new RegExp(`data-band="${id}"`), `${id} band missing`);
  }
});

test('the hex field shows AARRGGBB and says which forms it takes', () => {
  const html = chooser({ color: '4A90D9', alpha: 1 });
  const input = html.match(/<input class="hex-input[^>]*>/)?.[0] ?? '';
  assert.match(input, /value="#FF4A90D9"/);
  assert.match(input, /title="#RGB, #ARGB, #RRGGBB, #AARRGGBB or rgb\(\)"/);
  assert.match(input, /aria-invalid="false"/);

  const half = chooser({ color: '000000', alpha: 0.5 });
  assert.match(half, /value="#80000000"/, 'the alpha rides in the field, not beside it');
});

test('the eyedropper is offered, and explains itself where it cannot work', () => {
  // Server render: no window, so no EyeDropper — the graceful-degradation path.
  const html = chooser({ color: 'FF0000' });
  const button = html.match(/<button class="eyedropper[^>]*>/)?.[0] ?? '';
  assert.match(button, /aria-label="Pick a colour from the screen"/);
  assert.match(button, /disabled/);
  assert.match(button, /This browser has no screen eyedropper/, 'it says why rather than vanishing');
});

// --- The eyedropper itself --------------------------------------------------

test('eyedropperAvailable feature-detects rather than assuming', () => {
  assert.equal(eyedropperAvailable({}), false);
  assert.equal(eyedropperAvailable(undefined), false);
  assert.equal(eyedropperAvailable({ EyeDropper: class {} }), true);
});

test('a successful pick comes back as bare uppercase RRGGBB', async () => {
  const host = { EyeDropper: class { async open() { return { sRGBHex: '#4a90d9' }; } } };
  assert.deepEqual(await pickScreenColour(host), { ok: true, color: '4A90D9' });
});

test('cancelling the picker is not an error and reports no reason', async () => {
  const host = {
    EyeDropper: class {
      async open() { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    },
  };
  const result = await pickScreenColour(host);
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.reason, undefined, 'nothing went wrong, so nothing is shown');
});

test('a failing picker reports a reason instead of throwing at the component', async () => {
  const host = { EyeDropper: class { async open() { throw new Error('no permission'); } } };
  assert.deepEqual(await pickScreenColour(host), { ok: false, reason: 'no permission' });

  const junk = { EyeDropper: class { async open() { return { sRGBHex: 'purple' }; } } };
  const result = await pickScreenColour(junk);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no colour/);

  const missing = await pickScreenColour({});
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /No screen eyedropper/);
});
