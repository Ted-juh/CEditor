// sceneryFold.test.js — folding the scenery must not change the picture.
//
// planSceneryFold is tested on its own in sceneryModel.test.js; this is the other half, and the
// half that would actually be noticed: a panel rendered with the fold on has to paint what the same
// panel paints with it off. The fold moves 173 of the GAIA's controls out of the render loop and
// into one node, and "moved them and lost a label" looks exactly like "moved them" until somebody
// opens the panel and reads it.
//
// The lever used to turn folding off is the script-touched set, because that is a real rule rather
// than a test hook: a control a script has written to leaves the ground and stays out of it (see
// stores/scriptTouchedControls.js). Marking every control touched is therefore the same panel with
// the fold off, rendered through exactly the code path the fold normally takes.
//
// It used to be "does this panel carry a script at all", which vetoed the whole panel. That rule is
// gone — a script write goes through the document and the ground re-bakes, so folding a scripted
// panel was always correct; sceneryScripts.test.js pins that directly.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';

import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { planSceneryFold } from '../src/CE_Application/utils/sceneryModel.js';
import {
  clearScriptTouchedControls, scriptTouchedControlIds,
} from '../src/CE_Application/stores/scriptTouchedControls.js';
import { DEFAULT_GENERAL_SETTINGS } from '../src/CE_Application/stores/runtimePreferences.js';
import { normalizeGeneralSettings } from '../src/CE_Application/stores/appSettingsSchema.js';

const at = (control, x, y, width, height) => {
  Object.assign(control._children.Transform, { x, y, width, height });
  return control;
};

/**
 * A panel with scenery worth folding: a plate, legends clear of everything, a knob, and one legend
 * printed over the knob so the held-back path is exercised too.
 */
function makePanel() {
  return {
    name: 'fold-specimen',
    width: 400,
    height: 200,
    controls: [
      at(createControl('Background', { Core: { id: 'plate' }, Background: { _children: { Fill: { colour: 'FF101418' } } } }), 0, 0, 400, 200),
      at(createControl('Label', { Core: { id: 'heading' }, Text: { content: 'OSCILLATOR' } }), 20, 10, 120, 16),
      at(createControl('Label', { Core: { id: 'legend' }, Text: { content: 'CUTOFF' } }), 20, 40, 80, 14),
      at(createControl('Knob', { Core: { id: 'knob' } }), 200, 40, 60, 60),
      at(createControl('Label', { Core: { id: 'over-knob' }, Text: { content: 'RES' } }), 210, 50, 40, 12),
      at(createControl('Label', { Core: { id: 'footer' }, Text: { content: 'TONE 1' } }), 20, 160, 90, 14),
    ],
    scripts: [],
  };
}

/** Render with every control marked script-touched, which is this panel with nothing folded. */
function renderUnfolded(panel) {
  scriptTouchedControlIds.set(new Set(panel.controls.map((c) => c._children.Core.id)));
  try { return renderPanel(panel); } finally { clearScriptTouchedControls(); }
}

function paint(body) {
  const strokes = [...body.matchAll(/stroke="([^"]+)"[^>]*?stroke-width="([^"]+)"/g)].map(([, c, w]) => `stroke ${c} @ ${w}`);
  const fills = [...body.matchAll(/fill="(?!none)([^"]+)"/g)].map(([, c]) => `fill ${c}`);
  const paths = [...body.matchAll(/\sd="([^"]+)"/g)].map(([, d]) => `path ${d}`);
  const text = [...body.matchAll(/>([^<>]*\S[^<>]*)</g)].map(([, t]) => `text ${t.trim()}`);
  const boxes = [...body.matchAll(/(left:\s*[^;"]+;\s*top:\s*[^;"]+;\s*width:\s*[^;"]+;\s*height:\s*[^;"]+)/g)]
    .map(([, box]) => `box ${box.replace(/\s+/g, ' ')}`);

  const tally = (entries) => {
    const counts = new Map();
    for (const e of entries) counts.set(e, (counts.get(e) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${n}x ${k}`);
  };
  return [...tally(boxes), ...tally(paths), ...tally(strokes), ...tally(fills), ...tally(text)].join('\n');
}

function renderPanel(panel) {
  const { body } = render(PanelPreviewSurface, { props: { panel, scale: 1, bgLayers: {}, gridStyle: '' } });
  return body;
}

test('the specimen actually folds, or the comparison below proves nothing', () => {
  // A green "identical" result is worthless if the fold never engaged, so this is asserted first
  // and separately rather than being assumed by the test that depends on it.
  const { ground, live } = planSceneryFold(makePanel().controls);
  assert.deepEqual(ground.map((c) => c._children.Core.id), ['plate', 'heading', 'legend', 'footer']);
  assert.deepEqual(live.map((c) => c._children.Core.id), ['knob', 'over-knob'],
    'the legend printed over the knob must stay live, or it would drop behind it');
});

test('a folded panel paints what the unfolded one paints', () => {
  const folded = paint(renderPanel(makePanel()));
  const unfolded = paint(renderUnfolded(makePanel()));

  assert.equal(folded, unfolded,
    'folding the scenery changed what the panel paints — a control was lost, duplicated or drawn differently');
});

test('every scenery control is still on the page after folding', () => {
  // The blunt version of the check above, in case the summary is ever loosened: the words printed
  // on the panel are the whole point of a Label, and the failure being guarded against is one of
  // them silently not being rendered at all.
  const body = renderPanel(makePanel());
  for (const word of ['OSCILLATOR', 'CUTOFF', 'RES', 'TONE 1']) {
    assert.ok(body.includes(word), `"${word}" is missing from the folded panel`);
  }
});

test('a script-touched panel keeps every control live, and still paints them', () => {
  const { ground } = planSceneryFold(makePanel().controls);
  assert.ok(ground.length > 0, 'guard: the untouched specimen should fold');

  const panel = makePanel();
  const body = renderUnfolded(panel);
  assert.ok(!body.includes('scenery-ground'), 'a fully script-touched panel emitted a ground layer');
  assert.ok(body.includes('OSCILLATOR'), 'the unfolded panel lost its labels');
});

test('a scripted panel folds — carrying a script is no longer a veto', () => {
  // The regression this whole change is about. The GAIA panel carries two scripts and lost its
  // entire fold — 193 Labels and 27 Backgrounds — for scripts that between them name one control.
  const panel = makePanel();
  panel.scripts = [{ id: 's', source: 'ce.panel.each(function (n) { log(n); })' }];

  const body = renderPanel(panel);
  assert.ok(body.includes('scenery-ground'), 'a scripted panel refused to fold');
  assert.ok(body.includes('OSCILLATOR'), 'the folded scripted panel lost its labels');
});

test('folding is on by default, so the editor and the preview do the same work', () => {
  // It shipped off while the fold's correctness was an argument rather than a set of tests. Both
  // halves of that argument are pinned now — this file for "the folded panel paints what the
  // unfolded one paints", sceneryScripts.test.js for the scripted case — and preview has always
  // folded unconditionally, so leaving the editor off meant the two rendered the same panel by
  // different routes. The one place a difference would show is the one nobody re-checks.
  assert.equal(DEFAULT_GENERAL_SETTINGS.foldSceneryInEditor, true);
});

test('a stored preference still wins over the default, both ways', () => {
  // Flipping a default must not take the setting away from anyone who had chosen the other one.
  assert.equal(normalizeGeneralSettings({ foldSceneryInEditor: false }).foldSceneryInEditor, false);
  assert.equal(normalizeGeneralSettings({ foldSceneryInEditor: true }).foldSceneryInEditor, true);
});
