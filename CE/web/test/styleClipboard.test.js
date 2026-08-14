import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { addControl } from '../src/CE_Application/stores/controls.js';
import { styleClipboard, copyControlStyle, applyStyleToSelection } from '../src/CE_Application/stores/styleClipboard.js';
import { findControlById } from '../src/CE_Application/utils/containment.js';

function freshPanel(name) {
  const panel = createPanel(name);
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  selectedComponentIds.set(new Set());
  styleClipboard.set(null);
  return panel;
}

function control(id) {
  return findControlById(get(panels)[0].controls, id);
}

const RED = 'FFCC2222';
const GREEN = 'FF22CC22';

function addStyledLabel(name, content) {
  return addControl('Label', {
    name,
    Text: { content, _children: { Fill: { colour: GREEN } } },
    Background: { _children: { Fill: { colour: RED }, Corners: { radius: 9 } } },
  });
}

test('copy style captures appearance sections but not the text content', () => {
  freshPanel('Copy Style');
  const src = addStyledLabel('Src', 'Volume');
  selectedComponentIds.set(new Set([src._children.Core.id]));

  assert.equal(copyControlStyle(), true);
  const clip = get(styleClipboard);
  assert.ok(clip, 'clipboard is set');
  assert.equal(clip.sourceType, 'Label');
  assert.equal(clip.sections.Background._children.Fill.colour, RED);
  assert.equal(clip.sections.Text._children.Fill.colour, GREEN);
  assert.equal(clip.sections.Text.content, null, 'the words are not style');
});

test('paste style restyles the selection, keeps each target’s own text', () => {
  freshPanel('Paste Style');
  const src = addStyledLabel('Src', 'Volume');
  const dst = addControl('Label', { name: 'Dst', Text: { content: 'Pan' } });
  const srcId = src._children.Core.id;
  const dstId = dst._children.Core.id;

  selectedComponentIds.set(new Set([srcId]));
  copyControlStyle();

  selectedComponentIds.set(new Set([dstId]));
  assert.equal(applyStyleToSelection(), 1);

  const after = control(dstId);
  assert.equal(after._children.Background._children.Fill.colour, RED);
  assert.equal(after._children.Background._children.Corners.radius, 9);
  assert.equal(after._children.Text._children.Fill.colour, GREEN);
  assert.equal(after._children.Text.content, 'Pan', 'target keeps its own words');
  assert.equal(get(panels)[0].modified, true);
});

test('sections the target type lacks are skipped, not invented', () => {
  freshPanel('Section Skip');
  const src = addStyledLabel('Src', 'Volume');
  const plain = addControl('Background', { name: 'Backdrop' });
  const plainId = plain._children.Core.id;

  selectedComponentIds.set(new Set([src._children.Core.id]));
  copyControlStyle();

  selectedComponentIds.set(new Set([plainId]));
  assert.equal(applyStyleToSelection(), 1, 'Background/Effects still apply');

  const after = control(plainId);
  assert.equal(after._children.Background._children.Fill.colour, RED);
  assert.equal(after._children.Text, undefined, 'no Text section is created');
  assert.equal(after._children.Icon, undefined, 'no Icon section is created');
});

test('paste style onto a multi-selection restyles every target at once', () => {
  freshPanel('Multi Paste');
  const src = addStyledLabel('Src', 'Volume');
  const a = addControl('Label', { name: 'A', Text: { content: 'A' } });
  const b = addControl('Label', { name: 'B', Text: { content: 'B' } });

  selectedComponentIds.set(new Set([src._children.Core.id]));
  copyControlStyle();

  selectedComponentIds.set(new Set([a._children.Core.id, b._children.Core.id]));
  assert.equal(applyStyleToSelection(), 2);
  assert.equal(control(a._children.Core.id)._children.Background._children.Fill.colour, RED);
  assert.equal(control(b._children.Core.id)._children.Background._children.Fill.colour, RED);
  assert.equal(control(a._children.Core.id)._children.Text.content, 'A');
  assert.equal(control(b._children.Core.id)._children.Text.content, 'B');
});

test('copy style is a no-op without a styleable source', () => {
  freshPanel('No Source');
  assert.equal(copyControlStyle(), false, 'nothing selected');
  assert.equal(get(styleClipboard), null);

  const knob = addControl('Knob');
  selectedComponentIds.set(new Set([knob._children.Core.id]));
  assert.equal(copyControlStyle(), false, 'a Parts-based control has no style sections to lift');
  assert.equal(get(styleClipboard), null);
});

test('paste style is a no-op without a clipboard or selection', () => {
  freshPanel('No Clip');
  const label = addControl('Label', { name: 'L' });
  selectedComponentIds.set(new Set([label._children.Core.id]));
  assert.equal(applyStyleToSelection(), 0, 'empty clipboard');

  copyControlStyle();
  selectedComponentIds.set(new Set());
  assert.equal(applyStyleToSelection(), 0, 'empty selection');
});
