import test from 'node:test';
import assert from 'node:assert/strict';

import { PANEL_TEMPLATES, PANEL_SIZE_PRESETS, buildPanelFromTemplate } from '../src/CE_Application/models/panelTemplates.js';
import { collectDocumentColours } from '../src/CE_Application/utils/documentColours.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';

test('every template builds controls inside its own bounds, with unique ids', () => {
  for (const template of PANEL_TEMPLATES) {
    const controls = template.build();
    const ids = new Set();
    for (const control of flatControls(controls)) {
      const core = control._children?.Core;
      const t = control._children?.Transform;
      assert.ok(core?.id, `${template.id}: control without id`);
      assert.ok(!ids.has(core.id), `${template.id}: duplicate id ${core.id}`);
      ids.add(core.id);
      assert.ok(t.x >= 0 && t.y >= 0, `${template.id}/${core.name}: negative position`);
      assert.ok(t.x + t.width <= template.width, `${template.id}/${core.name}: overflows width`);
      assert.ok(t.y + t.height <= template.height, `${template.id}/${core.name}: overflows height`);
    }
  }
});

test('building the same template twice never reuses ids', () => {
  const a = PANEL_TEMPLATES.find((t) => t.id === 'synth').build();
  const b = PANEL_TEMPLATES.find((t) => t.id === 'synth').build();
  const idsA = new Set(flatControls(a).map((c) => c._children.Core.id));
  for (const control of flatControls(b)) {
    assert.ok(!idsA.has(control._children.Core.id), 'template build reused a control id');
  }
});

test('buildPanelFromTemplate honours name and size, falls back sensibly', () => {
  const panel = buildPanelFromTemplate({ name: 'My Rig', width: 700, height: 500, templateId: 'synth' });
  assert.equal(panel.name, 'My Rig');
  assert.equal(panel.width, 700);
  assert.equal(panel.height, 500);
  assert.ok(panel.controls.length > 0);

  const blank = buildPanelFromTemplate({ name: '', width: 0, height: 0, templateId: 'nope' });
  assert.equal(blank.controls.length, 0);
  assert.ok(blank.width >= 80 && blank.height >= 80);
});

test('size presets are sane', () => {
  for (const preset of PANEL_SIZE_PRESETS) {
    assert.ok(preset.width >= 80 && preset.height >= 80, `${preset.id} too small`);
  }
});

test('document colours harvest deduplicates, ranks by use, strips alpha', () => {
  const panel = {
    bgColour: 'FF222222',
    controls: [
      { _children: { Core: { id: 'a' }, Background: { _children: { Fill: { colour: 'FF5B9BD5' } } } } },
      { _children: { Core: { id: 'b' }, Background: { _children: { Fill: { colour: '805B9BD5' } } } } },
      { _children: { Core: { id: 'c' }, Text: { _children: { Fill: { colour: 'FFE5A029' } } } } },
      { _children: { Core: { id: 'd' }, Icon: { tint: '00FFFFFF' } } },   // fully transparent — skipped
      { _children: { Core: { id: 'e' }, Value: { rows: 3 } } },           // not a colour
    ],
  };
  const colours = collectDocumentColours(panel);
  assert.equal(colours[0], '5B9BD5', 'most used colour first (two alphas, one RGB)');
  assert.ok(colours.includes('E5A029'));
  assert.ok(colours.includes('222222'), 'panel background included');
  assert.ok(!colours.includes('FFFFFF'), 'fully transparent tint skipped');
});
