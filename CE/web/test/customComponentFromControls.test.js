// customComponentFromControls.test.js — Create Component from Selection: what converts, what is
// refused and why, and that the result joins the linked-component system cleanly.
//
// The pixel proof is browser-checks/fromSelection.mjs: a hand-made panel of every artwork kind, and
// three real QA sheets, drawn before and after with the editor's own renderer. These tests pin the
// rules that decide what gets that far. Knobs and sliders have their own file, knobsFromSelection.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  planComponentFromSelection, shapeSvg, whyNotConvertible, describeRefusals,
} from '../src/CE_Application/utils/customComponentFromControls.js';
import { validateCustomComponentPackage, createCustomComponentExportEnvelope, customComponentPackageId } from '../src/CE_Application/utils/customComponentPackage.js';
import { diffCustomComponentAgainstSource } from '../src/CE_Application/utils/customComponentSourceLink.js';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { createComponentFromSelection, unusedPackageName } from '../src/CE_Application/stores/componentFromSelectionActions.js';

const at = (type, id, x, y, width, height, extra = {}) => createControl(type, {
  ...extra,
  Core: { id, name: id, ...(extra.Core ?? {}) },
  Transform: { x, y, width, height, ...(extra.Transform ?? {}) },
});

function artworkPanel() {
  return {
    id: 'p1',
    name: 'Voice',
    width: 400,
    height: 200,
    scripts: [],
    controls: [
      at('Background', 'plate', 20, 20, 200, 100),
      at('Label', 'legend', 30, 30, 120, 20, { Text: { content: 'CUTOFF' }, ContentLayout: { paddingLeft: 6, paddingRight: 4, paddingTop: 2, paddingBottom: 2 } }),
      at('Shape', 'star', 160, 60, 40, 40, { Shape: { kind: 'star', fillColour: 'FFF0C040' } }),
      at('Knob', 'cutoff', 300, 20, 60, 60),
    ],
  };
}
const ids = (...names) => names;
const refusal = (plan, name) => plan.refused.find((entry) => entry.name === name)?.reason ?? '';

// --- What converts -----------------------------------------------------------------------------------

test('artwork becomes one component, with the selection\'s bounds and the panel\'s paint order', () => {
  const plan = planComponentFromSelection(artworkPanel(), ids('plate', 'legend', 'star'), { name: 'Plate' });
  assert.equal(plan.ok, true, JSON.stringify(plan.refused));
  assert.deepEqual(plan.bounds, { x: 20, y: 20, width: 200, height: 100 });
  const parts = plan.component._children.Parts._children;
  const order = Object.values(parts).sort((a, b) => a.zIndex - b.zIndex).map((part) => part.name);
  assert.deepEqual(order, ['plate', 'legend_plate', 'legend', 'star'], 'plate under the label under the star');
  assert.equal(plan.component._children.Core.name, 'Plate');
  assert.deepEqual([plan.component._children.Transform.width, plan.component._children.Transform.height], [200, 100]);
  assert.deepEqual(Object.keys(plan.component._children.ValueChannels._children), [], 'artwork has no value');
});

test('a label\'s text sits over its padded content box, widened by the part renderer\'s own inset', () => {
  const plan = planComponentFromSelection(artworkPanel(), ids('plate', 'legend'));
  const layout = plan.component._children.Parts._children.legend._children.Layout;
  // Label at (10,10) inside the component, 120×20, padding 6/4/2/2; the part insets text 8px a side.
  assert.deepEqual([layout.x, layout.y, layout.width, layout.height], [10 + 6 - 8, 10 + 2, 120 - 6 - 4 + 16, 20 - 2 - 2]);
  assert.equal(layout.xUnit, 'px');
  assert.equal(layout.anchorX, 'left');
  assert.equal(plan.component._children.Parts._children.legend._children.Background, undefined, 'the plate is its own part');
});

test('every label\'s text is published, so each copy can carry its own legend', () => {
  const plan = planComponentFromSelection(artworkPanel(), ids('plate', 'legend'));
  assert.deepEqual(plan.component._children.PublishedProperties.editableProperties.legendText, {
    path: 'Parts.legend.Text.content', label: 'legend text', type: 'text', enabled: true, defaultValue: 'CUTOFF',
  });
});

test('a shape is the same SVG the panel draws, as an image part', () => {
  const panel = artworkPanel();
  const svg = shapeSvg(panel.controls[2], 40, 40);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 40 40"/);
  assert.match(svg, /fill="rgba\(240,192,64,1\)"/);
  const plan = planComponentFromSelection(panel, ids('star'));
  const fill = plan.component._children.Parts._children.star._children.Background._children.Fill;
  assert.equal(fill.imageEnabled, true);
  assert.equal(fill.imageFit, 'fill');
  assert.match(fill.imageSrc, /^data:image\/svg\+xml;base64,/);
});

test('an artwork component is a complete package, not one "with issues"', () => {
  const plan = planComponentFromSelection(artworkPanel(), ids('plate', 'legend', 'star'));
  const validation = validateCustomComponentPackage(plan.component);
  assert.deepEqual(validation.issues, []);
  assert.deepEqual(validation.warnings, []);
});

// --- What is refused, and the reason given ---------------------------------------------------------

test('a button is refused, and so is the whole command — nothing converts partly', () => {
  // Knobs and sliders convert (test/knobsFromSelection.test.js); buttons still do not.
  const panel = artworkPanel();
  panel.controls.push(at('Button', 'go', 240, 20, 50, 30));
  const plan = planComponentFromSelection(panel, ids('plate', 'go'));
  assert.equal(plan.ok, false);
  assert.match(refusal(plan, 'go'), /a Button — only artwork \(shapes, labels, images, backgrounds\), knobs and sliders/);
  assert.equal(plan.component, undefined);
});

test('a control a script names is refused, with the script and the line', () => {
  const panel = artworkPanel();
  panel.scripts = [{ name: 'boot', source: 'local x = 1\npanel.find("legend"):setText("RES")' }];
  assert.equal(refusal(planComponentFromSelection(panel, ids('legend')), 'legend'), 'used by panel script "boot", line 2');
  panel.scripts = [{ name: 'boot', source: 'legendary = 1' }];
  assert.equal(planComponentFromSelection(panel, ids('legend')).ok, true, 'a longer word is not a reference');
});

test('settings the part renderer would draw differently are refused by name', () => {
  const cases = [
    [{ Effects: { _children: { Shadows: { items: [{ enabled: true, type: 'drop', offsetX: 0, offsetY: 2, blur: 4, spread: 0, colour: '66000000' }] } } } }, /effects/],
    [{ Text: { _children: { Font: { underline: true } } } }, /underline/],
    [{ Text: { _children: { Position: { justification: 'topLeft' } } } }, /text aligned top left/],
    [{ Text: { content: 'two\nlines' } }, /more than one line/],
    [{ ContentLayout: { lamp: 'dot' } }, /a lamp/],
    [{ Transform: { scale: 2 } }, /scaled/],
  ];
  for (const [extra, reason] of cases) {
    const label = at('Label', 'l', 0, 0, 100, 20, extra);
    assert.match(whyNotConvertible(label, label), reason, JSON.stringify(extra));
  }
});

test('a label that does not wrap converts — it is what a part draws', () => {
  // The SVG import makes labels like this; the two features have to agree.
  const label = at('Label', 'l', 0, 0, 100, 20, { Text: { content: 'CUTOFF', _children: { Multiline: { wrapMode: 'none' } } } });
  assert.equal(whyNotConvertible(label, label), '');
});

test('text wider than its box is refused when a measurer is given', () => {
  const label = at('Label', 'l', 0, 0, 60, 20, { Text: { content: 'pitchBendRangeDown' } });
  const measure = (text, font) => text.length * (Number(font.size) || 12) * 0.6;
  assert.match(whyNotConvertible(label, label, { measure }), /wider than its box/);
  assert.equal(whyNotConvertible(label, label), '', 'no measurer, no overflow check');
});

test('a control inside a container, or a selection across layers, is refused', () => {
  const panel = artworkPanel();
  assert.match(refusal(planComponentFromSelection(panel, ['nowhere']), 'nowhere'), /inside a container/);
  panel.controls[1]._children.Core.layer = 'Legends';
  assert.match(describeRefusals(planComponentFromSelection(panel, ids('plate', 'legend')).refused)[0], /spans 2 layers/);
});

test('an unselected control sandwiched between the selection and overlapping it is refused by name', () => {
  const panel = artworkPanel();
  // plate (0) … legend (1) … star (2): select plate and star, leave the legend between them, on top of the plate.
  const plan = planComponentFromSelection(panel, ids('plate', 'star'));
  assert.equal(plan.ok, false);
  assert.match(refusal(plan, 'legend'), /painted between the selected controls/);
  // Between them in paint order but nowhere near them is fine.
  panel.controls[1]._children.Transform.x = 330;
  panel.controls[1]._children.Transform.y = 150;
  assert.equal(planComponentFromSelection(panel, ids('plate', 'star')).ok, true);
});

// --- Into the library and back onto the panel -----------------------------------------------------------

test('the command saves to the library and puts a linked, up-to-date copy where the selection was', () => {
  customComponentLibrary.clear();
  const panel = artworkPanel();
  panels.set([panel]);
  activePanelId.set('p1');
  selectedComponentIds.set(new Set(['plate', 'legend', 'star']));
  const result = createComponentFromSelection('Plate');
  assert.equal(result.ok, true);

  const after = get(panels)[0];
  assert.deepEqual(after.controls.map((c) => c._children.Core.name), ['Plate', 'cutoff'], 'in the place of the first selected control');
  const copy = after.controls[0];
  assert.deepEqual([copy._children.Transform.x, copy._children.Transform.y], [20, 20]);
  assert.deepEqual([...get(selectedComponentIds)], [copy._children.Core.id]);
  assert.deepEqual(get(customComponentLibrary).map((e) => e.name), ['Plate']);

  // It is an ordinary linked copy: up to date, and its legend is an override an update keeps.
  const library = get(customComponentLibrary);
  assert.equal(diffCustomComponentAgainstSource(copy, library).status, 'current');
  copy._children.Parts._children.legend._children.Text.content = 'RESONANCE';
  const report = diffCustomComponentAgainstSource(copy, library);
  assert.equal(report.status, 'current');
  assert.deepEqual(report.overrides.map((row) => row.path), ['Parts.legend.Text.content']);
});

test('a refused command changes nothing', () => {
  customComponentLibrary.clear();
  const panel = artworkPanel();
  panels.set([panel]);
  activePanelId.set('p1');
  selectedComponentIds.set(new Set(['plate', 'cutoff']));
  const result = createComponentFromSelection('Plate');
  assert.equal(result.ok, false);
  assert.equal(get(panels)[0].controls.length, 4);
  assert.deepEqual(get(customComponentLibrary), []);
});

test('a name already in the library is never overwritten', () => {
  const existing = createControl('CustomComponent');
  const entries = [{ name: 'Plate' }, { name: 'plate 2' }];
  assert.equal(unusedPackageName('Plate', entries), 'Plate 3');
  assert.equal(unusedPackageName('', []), 'Artwork');
  assert.ok(customComponentPackageId(createCustomComponentExportEnvelope(existing, { name: 'Plate 3' })).startsWith('plate-3@'));
});
