// panelColours.test.js — the panel document's own colours: what reads them, and what a script may
// write into them.
//
// A colour property takes 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#", and stores
// CSS's short forms written out ("red" as "#FF0000"). The panel's own colours (bgColour, the two
// tints, the grid's two and the gradient's stops) took anything from set(), and three of their
// readers did not take the "#" that set() stores for "red": the solid background made
// "background: ##FF0000", a tint read "#F" as its red, and a gradient stop became "##FF0000". Each
// reader now drops one leading "#" and reads eight digits as AARRGGBB, so the forms set() stores
// paint, and set() reads the panel's colours by the rule (colourPropertyCases.json has the cases
// both runtimes run; this file is the panel view's own behaviour around them).

import test from 'node:test';
import assert from 'node:assert/strict';
import { get as storeGet } from 'svelte/store';

import { buildGradientStyle, buildLayerStyle, buildSolidStyle } from '../src/CE_Application/utils/backgroundCSS.js';
import { buildGridStyle } from '../src/CE_Application/utils/gridCSS.js';
import { gradientStopCSS, gradientToCSS } from '../src/CE_Application/utils/gradientCSS.js';
import { PANEL_COLOUR_FIELDS } from '../src/CE_Application/scripting/scriptColours.js';
import { panelDefaults } from '../src/CE_Application/models/panelDefaults.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import {
  scriptApiForTesting, stopAllAnimations, tickAnimations,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const errors = () => storeGet(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message);

/* ======================================================================== the readers */

test('the solid background paints "#RRGGBB" and "#AARRGGBB" as it paints them without the "#"', () => {
  assert.equal(buildSolidStyle({ bgColour: '#5B9BD5' }), 'background: #5B9BD5;');
  assert.equal(buildSolidStyle({ bgColour: '#5B9BD5' }), buildSolidStyle({ bgColour: '5B9BD5' }));
  assert.equal(buildSolidStyle({ bgColour: '#805B9BD5' }), buildSolidStyle({ bgColour: '805B9BD5' }));
  assert.equal(buildSolidStyle({ bgColour: '805b9bd5' }), 'background: #5B9BD5; opacity: 0.502;');
  // A set's panel colour still takes over while the panel wears the one it was made with, written
  // either way.
  const withSet = (bgColour) => buildSolidStyle({ bgColour, controlSet: { id: 'mine' },
    controlSets: [{ id: 'mine', name: 'Mine', tokens: {}, panel: { colour: 'FF101010' } }] });
  assert.equal(withSet('#FF333333'), withSet('FF333333'));
});

test('the grid paints "#" forms as it paints them without', () => {
  const grid = (gridColour, gridSubColour) => buildGridStyle(
    { gridType: 'lines', gridSubdivision: 4, gridSubColour },
    { gridEnabled: true, gridSize: 10, gridColour, gridLineWidth: 1 });
  assert.equal(grid('#33FFFFFF', '#55FFFFFF'), grid('33FFFFFF', '55FFFFFF'));
  assert.equal(grid('#5B9BD5', '#5B9BD5'), grid('5B9BD5', '5B9BD5'));
});

test('an image or texture tint reads "#" and AARRGGBB, and white in any form is no tint', () => {
  const layer = (bgImageTint) => buildLayerStyle({ bgImageEnabled: true, bgImage: 'x.png', bgImageTint }, 'Image', 'data:x');
  const wash = (style) => /box-shadow: ([^;]*);/.exec(style)?.[1] ?? '';
  assert.equal(wash(layer('FF0000')), 'inset 0 0 0 9999px rgba(255,0,0,0.3)');
  assert.equal(layer('#FF0000'), layer('FF0000'), '"#FF0000", what set() stores for "red", tints red');
  assert.equal(layer('FFFF0000'), layer('FF0000'), 'an opaque AARRGGBB is its RRGGBB');
  assert.equal(layer('#FFFF0000'), layer('FF0000'));
  assert.equal(wash(layer('80FF0000')), 'inset 0 0 0 9999px rgba(255,0,0,0.151)', 'the alpha scales the wash');
  for (const none of ['FFFFFF', 'ffffff', '#FFFFFF', 'FFFFFFFF', '00FF0000', 'nonsense']) {
    assert.equal(wash(layer(none)), '', `${none}: no tint`);
  }
});

test('a gradient stop paints "#RRGGBB" as RRGGBB, and AARRGGBB as the colour it is', () => {
  const gradient = (a, b) => ({ type: 'linear', angle: 90, stops: [{ color: a, position: 0 }, { color: b, position: 100 }] });
  assert.equal(gradientToCSS(gradient('FF0000', '0000FF')), 'linear-gradient(90deg, #FF0000 0%, #0000FF 100%)');
  assert.equal(gradientToCSS(gradient('#FF0000', '#0000FF')), gradientToCSS(gradient('FF0000', '0000FF')));
  assert.equal(gradientToCSS(gradient('FFFF0000', '#FF0000FF')), gradientToCSS(gradient('FF0000', '0000FF')));
  assert.equal(gradientStopCSS('80FF0000'), '#FF000080', 'AARRGGBB is written in CSS\'s order');
  assert.equal(gradientStopCSS('#80ff0000'), '#ff000080');
  assert.equal(buildGradientStyle({ bgGradientEnabled: true, bgGradient: gradient('#FF0000', '0000FF') }),
    buildGradientStyle({ bgGradientEnabled: true, bgGradient: gradient('FF0000', '0000FF') }));
});

/* ======================================================================== which keys */

test('the panel\'s colours are read from the document a new panel starts as', () => {
  assert.deepEqual([...PANEL_COLOUR_FIELDS.keys()].sort(),
    ['bgcolour', 'bggradient.stops.*.color', 'bgimagetint', 'bgtexturetint', 'gridcolour', 'gridsubcolour']);
  // createPanel is that document with the user's settings filled in, key for key and in order.
  const made = createPanel('Named');
  const plain = panelDefaults({ id: made.id, panelGuid: made.panelGuid, name: 'Named', gridSize: made.gridSize,
    snapToGrid: made.snapToGrid, controlSet: made.controlSet, controlSets: made.controlSets });
  assert.equal(JSON.stringify(plain), JSON.stringify(made));
});

/* ======================================================================== set() and ce.anim */

/** An editor panel as createPanel makes it, active, with nothing on it and every module on. */
function withPanel(fn) {
  const made = createPanel('Colours');
  panels.set([{ ...made, id: 'p', scripting: { ...made.scripting, modules: MODULES.map((m) => m.id) } }]);
  activePanelId.set('p');
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'panel-colours')); } finally { panels.set([]); }
}

test('a colour set() writes into the panel paints as the same colour written in the panel\'s form', () => {
  withPanel((api) => {
    api.set('panel.bgColour', 'red');
    assert.equal(api.get('panel.bgColour'), '#FF0000');
    const panel = storeGet(panels)[0];
    assert.equal(buildSolidStyle(panel), buildSolidStyle({ bgColour: 'FF0000' }));
    api.set('panel.bgGradient.stops.0.color', 'navy');
    assert.equal(gradientStopCSS(storeGet(panels)[0].bgGradient.stops[0].color), '#000080');
    assert.equal(Object.hasOwn(storeGet(panels)[0], 'color'), false, 'a write below a key leaves no stray key on the panel');
    assert.deepEqual(errors(), []);
  });
});

test('ce.anim refuses one of the panel\'s colours as its path, and moves the panel\'s numbers', () => {
  stopAllAnimations();
  tickAnimations(0);
  try {
    withPanel((api) => {
      assert.equal(api.animateTo('panel.bgColour', 1, { duration: 10 }), false);
      assert.equal(api.animateSpring('panel.bgGradient.stops.1.color', 1, { duration: 10 }), false);
      assert.deepEqual(errors(), [
        'ce.anim.to: "panel.bgColour" is a colour, and ce.anim moves numbers, so nothing was started.',
        'ce.anim.spring: "panel.bgGradient.stops.1.color" is a colour, and ce.anim moves numbers, so nothing was started.',
      ]);
      tickAnimations(1000);
      assert.equal(api.get('panel.bgColour'), 'FF333333');
      clearScriptTrace();
      assert.equal(api.animateTo('panel.bgGradient.angle', 180, { duration: 10, from: 90 }), true);
      tickAnimations(2000);
      assert.equal(api.get('panel.bgGradient.angle'), 180);
      assert.deepEqual(errors(), []);
    });
  } finally { stopAllAnimations(); }
});
