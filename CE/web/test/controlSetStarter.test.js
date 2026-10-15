import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { assertSameText, readText } from './support/readText.mjs';
import { SHIPPED_STARTER_IDS, STARTERS_DIR, starterFile } from '../scripts/export-control-set-starters.mjs';
import { STARTER_CONTROL_SETS } from '../src/CE_Application/models/controlSetCoverage.js';
import { PHYSICAL_DIRECTIONS } from '../src/CE_Application/models/physicalControlSets.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';
import { resolveControlForSet, readControlPath } from '../src/CE_Application/models/controlSetFamilies.js';
import { shrinkControl, expandControl } from '../src/CE_Application/stores/documentShape.js';
import { serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { sceneryMarkupKey } from '../src/CE_Application/utils/sceneryMarkupCache.js';

test('sixty editable starters round-trip with portable design pins and finite bounds', () => {
  assert.equal(STARTER_CONTROL_SETS.length, 60);
  for (const { id } of STARTER_CONTROL_SETS) {
    const panel = createControlSetStarter(id);
    const restored = deserializePanel(serializePanel(panel));
    assert.equal(restored.controls.length, panel.controls.length);
    for (const c of restored.controls) {
      assert.equal(c._children.Core.controlSetId, id);
      const t = c._children.Transform;
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.width <= panel.width && t.y + t.height <= panel.height);
    }
    const slider = restored.controls.find(c => c._children.Core.controlType === 'Slider');
    assert.deepEqual(slider._children.Parts, panel.controls.find(c => c._children.Core.controlType === 'Slider')._children.Parts);
  }
});

test('the shipped starters are what the generator writes, byte for byte', () => {
  // They were written once and then left while the sets' designs moved on, which nothing could
  // catch: every export renamed every control, so a fresh one never matched the committed one.
  // starterFile numbers them from a fixed point, and this holds the files to it. Run after the test
  // above has opened all sixty, so a starter whose bytes depend on what the process did first —
  // the panel counter, the control counter — fails here rather than in CI.
  assert.deepEqual(readdirSync(STARTERS_DIR).filter((f) => f.endsWith('.cepanel')).sort(),
    SHIPPED_STARTER_IDS.map((id) => `${id}.cepanel`).sort(),
    'every file in the folder is a starter the code still makes, and every starter has its file');
  const owner = new Map();
  for (const id of SHIPPED_STARTER_IDS) {
    const { path, text } = starterFile(id);
    assertSameText(readText(path), text,
      `${id}.cepanel is stale — run scripts/export-control-set-starters.mjs from CE/web`,
      { actual: 'committed', expected: 'the generator' });
    // Distinct across starters, so controls copied from two of them into one panel do not collide.
    for (const control of JSON.parse(text).controls) {
      const cid = control._children.Core.id;
      assert.ok(!owner.has(cid), `${cid} is in both ${owner.get(cid)} and ${id}`);
      owner.set(cid, id);
    }
  }
});

test('every starter caption can be read against what is behind it', () => {
  // The lettering against its plate where the label has one, the panel where it does not. The plate
  // sets' captions once kept their dark plate lettering with the plate taken away by the starter:
  // 1.0 to 1, which is invisible, and nothing failed. 4.5 to 1 is WCAG's floor for body text.
  const luminance = (argb) => {
    const [r, g, b] = [2, 4, 6].map((i) => parseInt(argb.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  let captions = 0;
  for (const { id } of STARTER_CONTROL_SETS) {
    const panelColour = resolveToken('panel.surface', getControlSet(id));
    for (const c of createControlSetStarter(id).controls) {
      if (c._children.Core.controlType !== 'Label') continue;
      const ink = c._children.Text._children.Fill.colour;
      const plate = c._children.Background._children.Fill.colour;
      const behind = plate.startsWith('00') ? panelColour : plate;
      const ratio = contrast(ink, behind);
      assert.ok(ratio >= 4.5, `${id}: "${c._children.Text.content}" is ${ink} on ${behind}, ${ratio.toFixed(2)} to 1`);
      captions++;
    }
  }
  assert.ok(captions > 500, `every starter has its captions checked, saw ${captions}`);
});

test('the third synth collection has twelve distinct sculpted mechanisms, not palette aliases', () => {
  const sculpted = PHYSICAL_DIRECTIONS.filter((entry) => entry.series === 3);
  assert.equal(sculpted.length, 12);
  assert.equal(new Set(sculpted.map((entry) => entry.rotary)).size, 12, 'every knob selects a different SVG mechanism');
  assert.equal(new Set(sculpted.map((entry) => entry.padProfile)).size, 12, 'every pad has different relief geometry');
  assert.ok(new Set(sculpted.map((entry) => entry.slider.cap)).size >= 5, 'faders span several physical cap constructions');
  for (const entry of sculpted) {
    const set = getControlSet(entry.id);
    assert.equal(set.families.Knob.component['Core.formDepth'], 92, `${entry.id}: deep form is visible by default`);
    assert.equal(set.families.Knob.component['Core.controlForm'], `new-${entry.id}`);
  }
});

test('mixed controls retain shapes after copy/save, and edits override the pinned design', () => {
  for (const [id, shape] of [['console', 'console'], ['machined', 'block'], ['blueprint', 'ring']]) {
    const source = createControl('Slider', { Core: { controlSetId: id } });
    // A copy to write into, as the editor's drafts are: a loaded control shares its untouched
    // defaults with every other control of its type, frozen (stores/documentShape.js).
    const copied = deepClone(expandControl(shrinkControl(source)));
    const drawn = resolveControlForSet(copied, getControlSet('pop'));
    assert.equal(drawn._children.Parts._children.pointerCurrent.kind, shape);
    copied._children.Parts._children.pointerCurrent._children.Layout.width = 61;
    assert.equal(resolveControlForSet(copied, getControlSet('pop'))._children.Parts._children.pointerCurrent._children.Layout.width, 61);
    assert.equal(copied._children.Behavior.defaultCurrentValue, source._children.Behavior.defaultCurrentValue);
  }
});

test('extended design paths target existing editable fields without changing musical configuration', () => {
  const structural = new Set();
  for (const { id } of STARTER_CONTROL_SETS.filter(s => s.id !== 'graphite')) {
    const set = getControlSet(id);
    for (const type of ['CyclicButton', 'TimedButton', 'OneShotButton', 'RadioButtonGroup', 'TextInput', 'Listbox', 'Group', 'Container', 'TabContainer', 'ScrollArea', 'Meter', 'ProgressBar', 'Ribbon', 'PitchWheel', 'ModWheel', 'Crossfader', 'DrumPads', 'Numpad', 'Matrix', 'Envelope', 'VectorJoystick']) {
      const raw = createControl(type);
      for (const path of Object.keys(set.families[type].component)) {
        if (/^(Background|Effects|Text|ContentLayout|States)\./.test(path)) continue;
        assert.notEqual(readControlPath(raw, path), undefined, `${id} ${type}: ${path} exists in the editor model`);
        assert.ok(!/\.(value|mix|channel|editable|returnMode|rows|cols|points|amounts)$/.test(path), `${path} must not change behavior`);
      }
      const resolved = resolveControlForSet(raw, set);
      if (type === 'DrumPads') structural.add(resolved._children.DrumPads.padAppearance);
    }
  }
  assert.equal(structural.size, 5);
});

test('cached scenery changes when the design or its palette changes', () => {
  const label = createControl('Label');
  const a = sceneryMarkupKey(label, { controlSet: getControlSet('blueprint') });
  const b = sceneryMarkupKey(label, { controlSet: getControlSet('machined') });
  assert.notEqual(a, b);
  const edited = structuredClone(getControlSet('blueprint'));
  edited.tokens['text.primary'] = 'FFFF0000';
  assert.notEqual(a, sceneryMarkupKey(label, { controlSet: edited }));
});
