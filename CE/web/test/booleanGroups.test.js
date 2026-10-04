// booleanGroups.test.js — combined shapes that stay live (utils/booleanGroups.js): the operands are
// kept, the shape follows them through the resolve pipeline, and the designer's layer operations keep
// membership straight. browser-checks/partBooleans.mjs drives the same through the designer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import { createPartNode } from '../src/CE_Application/utils/customComponentFactory.js';
import {
  attachBooleanInputs, booleanShapeFor, clearBooleanShapeMemo, computeBooleanShape, drawnPartEntries,
  groupMemberNames, membershipRenamePatch, operandEntries, partsAfterOperandMove, partsAfterRemoval,
  planBooleanGroup, planOperandMove, refreshedGroup, releasedParts, remapCopiedGroups, settleBooleanShapes, withGroupMembers,
  withOperation,
} from '../src/CE_Application/utils/booleanGroups.js';
import { loadGeometry } from '../src/CE_Application/utils/partOutlines.js';
import { planFlatten, planPathSmooth, applyPartPatch } from '../src/CE_Application/utils/partBooleans.js';
import { buildPastePatch } from '../src/CE_Application/utils/customComponentClipboard.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import InteractivePartRenderer from '../src/CE_Application/editor/InteractivePartRenderer.svelte';

const px = (x, y, width, height, extra = {}) => ({
  x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', ...extra,
});
const part = (name, kind, zIndex, layout, extra = {}) => createPartNode(name, { kind, zIndex, layout, ...extra });
const SIZE = { artboardWidth: 400, artboardHeight: 400 };
const clone = (value) => JSON.parse(JSON.stringify(value));

function plateAndHole() {
  const plate = part('plate', 'rectangle', 1, px(0, 0, 100, 100));
  plate._children.Background = { _type: 'Background', _children: { Fill: { _type: 'Fill', solidEnabled: true, colour: 'FFFF0000' } } };
  const hole = part('hole', 'circle', 2, px(30, 30, 40, 40));
  return { plate, hole };
}
const entriesOf = (parts, names) => names.map((name) => [name, parts[name], parts[name]]);

async function areaOf(shape) {
  const { scope } = await loadGeometry();
  return Math.abs(new scope.CompoundPath({ pathData: shape.pathData, insert: false }).area);
}

async function resolvedShape(parts, groupName) {
  const view = clone(parts);
  attachBooleanInputs(view);
  return computeBooleanShape(view[groupName], 400, 400);
}

test('each operation makes the shape it names, and keeps every operand', async () => {
  const { plate, hole } = plateAndHole();
  const parts = { plate, hole };
  const circle = Math.PI * 20 * 20;
  const expected = { unite: 10000, subtract: 10000 - circle, intersect: circle, exclude: 10000 - circle };
  for (const [operation, area] of Object.entries(expected)) {
    const plan = await planBooleanGroup(parts, entriesOf(parts, ['hole', 'plate']), operation, SIZE);
    assert.equal(plan.ok, true, operation);
    assert.deepEqual(Object.keys(plan.parts).sort(), ['hole', 'plate', plan.groupName].sort(), 'nothing removed');
    assert.equal(plan.parts.plate.meta.booleanGroup, plan.groupName);
    assert.equal(plan.parts.hole.meta.booleanGroup, plan.groupName);
    const shape = await resolvedShape(plan.parts, plan.groupName);
    assert.ok(Math.abs(await areaOf(shape) - area) < 5, `${operation}: ${await areaOf(shape)} against ${area}`);
    assert.deepEqual(plan.parts[plan.groupName].meta.cache.shape.bounds, shape.bounds, 'the outline is cached with the shape');
  }
  assert.equal(parts.plate.meta?.booleanGroup, undefined, 'the document passed in is not written to');
});

test('operands are ordered back to front and the paint comes from the conventional one', async () => {
  const { plate, hole } = plateAndHole();
  const parts = { plate, hole };
  const subtract = await planBooleanGroup(parts, entriesOf(parts, ['hole', 'plate']), 'subtract', SIZE);
  const spec = subtract.parts[subtract.groupName].meta.boolean;
  assert.deepEqual(spec.operands, ['plate', 'hole'], 'selection order does not matter; paint order does');
  assert.equal(spec.paintFrom, 'plate', 'subtract paints like what is cut from');
  const unite = await planBooleanGroup(parts, entriesOf(parts, ['plate', 'hole']), 'unite', SIZE);
  assert.equal(unite.parts[unite.groupName].meta.boolean.paintFrom, 'hole', 'the others paint like the front one');
  assert.equal(subtract.parts[subtract.groupName].zIndex, 2, 'the shape sits where its front operand was');
  assert.deepEqual(drawnPartEntries(Object.entries(subtract.parts)).map(([name]) => name), [subtract.groupName]);
});

test('the shape follows its operands: move the hole, hide it, change the operation', async () => {
  const { plate, hole } = plateAndHole();
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const name = plan.groupName;
  const moved = clone(plan.parts);
  moved.hole._children.Layout.x = 80;   // half off the plate
  const shape = await resolvedShape(moved, name);
  const circle = Math.PI * 400;
  assert.ok(await areaOf(shape) > 10000 - circle + 100, 'less is cut once the hole hangs off the edge');

  const hidden = clone(plan.parts);
  hidden.hole.visible = false;
  assert.ok(Math.abs(await areaOf(await resolvedShape(hidden, name)) - 10000) < 1, 'a hidden operand takes no part');

  const united = withOperation(plan.parts, name, 'unite');
  assert.equal(united[name].meta.boolean.operation, 'unite');
  assert.equal(united[name].meta.boolean.paintFrom, 'hole');
  assert.ok(Math.abs(await areaOf(await resolvedShape(united, name)) - 10000) < 1);
});

test('through the resolve pipeline: a state on the paint source and a binding on the hole reach the shape', async () => {
  const { plate, hole } = plateAndHole();
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const control = {
    _children: {
      Core: { _type: 'Core', id: 'cc', controlType: 'CustomComponent' },
      Transform: { _type: 'Transform', width: 400, height: 400 },
      Parts: { _type: 'Parts', _children: plan.parts },
      States: { _type: 'States', _children: { lit: { _type: 'State', name: 'lit', when: {}, patches: { parts: { plate: { 'Background.Fill.colour': 'FF00FF00' } } } } } },
      Bindings: { _type: 'Bindings', _children: { slide: { _type: 'Binding', source: 'value.normalized', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 60, target: 'Parts.hole.Layout.x' } } },
    },
  };
  const resolved = resolveInteractiveControl(control, { valueOverrideEnabled: true, valueOverride: 0.5, customNormalizedValue: 0.5 }).control;
  const group = resolved._children.Parts._children[plan.groupName];
  assert.equal(group._children.Background._children.Fill.colour, 'FF00FF00', 'the state recoloured the paint source, so the shape');
  const operands = Object.fromEntries(group.meta.booleanInputs.operands);
  assert.equal(operands.plate._children.Background._children.Fill.colour, 'FF00FF00');
  assert.equal(operands.hole._children.Layout.x, 30, 'the binding moved the hole the shape is cut with');
  assert.equal(group._children.Background._children.Corners, undefined, 'the outline is the shape; the box corners are not');
});

test('the renderer asks once, draws the cached outline meanwhile, then the new one', async () => {
  clearBooleanShapeMemo();
  const { plate, hole } = plateAndHole();
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const view = clone(plan.parts);
  attachBooleanInputs(view);
  const cached = booleanShapeFor(view[plan.groupName], 400, 400);
  assert.equal(cached.pending, false, 'the cached outline matches: no computation');
  view.hole._children.Layout.x = 10;
  attachBooleanInputs(view);
  const asked = booleanShapeFor(view[plan.groupName], 400, 400, { identity: 'g' });
  assert.equal(asked.pending, true);
  assert.deepEqual(asked.shape, plan.parts[plan.groupName].meta.cache.shape, 'the previous outline until the new one is ready');
  await settleBooleanShapes();
  const ready = booleanShapeFor(view[plan.groupName], 400, 400, { identity: 'g' });
  assert.equal(ready.pending, false);
  assert.notEqual(ready.shape.pathData, asked.shape.pathData);
});

test('the renderer draws a shape through the outline pipeline, with every fill layer clipped to it', async () => {
  const { plate, hole } = plateAndHole();
  plate._children.Background._children.Fill.gradientEnabled = true;
  plate._children.Background._children.Fill.gradient = { type: 'linear', angle: 90, stops: [{ color: 'FF000000', position: 0 }, { color: 'FFFFFFFF', position: 100 }] };
  plate._children.Background._children.Border = { _type: 'Border', enabled: true, linked: true, thickness: 3, style: 'dashed', colour: 'FF00FF00' };
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const view = clone(plan.parts);
  attachBooleanInputs(view);
  const html = render(InteractivePartRenderer, { props: { part: view[plan.groupName], partName: 'shape', parentWidth: 400, parentHeight: 400 } }).body;
  assert.match(html, /clip-path: path\(evenodd, 'M/, 'fill layers clipped to the outline');
  assert.match(html, /linear-gradient/, 'the gradient layer is drawn, not dropped');
  assert.match(html, /<mask[^>]*>[\s\S]*stroke-dasharray="9 6"/, 'the border is a dashed band along the outline');
  assert.doesNotMatch(html, /interactive-vector-shape/, 'not the solid-colour vector branch');
});

test('refused by name: parts with no fixed outline, and a part already in a shape', async () => {
  const { plate, hole } = plateAndHole();
  const knob = part('knob', 'sliderControl', 3, px(0, 0, 50, 50));
  const plan = await planBooleanGroup({ plate, knob }, entriesOf({ plate, knob }, ['plate', 'knob']), 'unite', SIZE);
  assert.equal(plan.ok, false);
  assert.match(plan.refused[0].reason, /slider/);
  const first = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'unite', SIZE);
  const again = await planBooleanGroup(first.parts, entriesOf(first.parts, ['plate', 'hole']), 'unite', SIZE);
  assert.equal(again.ok, false);
  assert.match(again.refused[0].reason, /already part of/);
  const empty = await planBooleanGroup({ plate, hole: { ...hole, _children: { ...hole._children, Layout: px(300, 300, 20, 20) } } },
    [['plate', plate, plate], ['hole', null, { ...hole, _children: { ...hole._children, Layout: px(300, 300, 20, 20) } }]], 'intersect', SIZE);
  assert.equal(empty.ok, true, 'a live shape may be empty for now');
  assert.equal(empty.empty, true);
});

test('a generated operand is detached into a part of its own, and the generator leaves it be', async () => {
  const control = {
    _children: {
      Core: { _type: 'Core', id: 'cc', controlType: 'CustomComponent' },
      Transform: { _type: 'Transform', width: 200, height: 200 },
      Parts: { _type: 'Parts', _children: { plate: part('plate', 'rectangle', 0, px(0, 0, 200, 200)) } },
      Generators: { _type: 'Generators', _children: { ticks: { type: 'ticks', enabled: true, count: 3 } } },
    },
  };
  const snapshot = materializedCustomComponentSnapshot(control);
  const generated = Object.entries(snapshot._children.Parts._children).find(([, p]) => p.generated === true);
  assert.ok(generated, 'the generator made a part');
  const [tickName, tick] = generated;
  const plan = await planBooleanGroup(control._children.Parts._children,
    [['plate', control._children.Parts._children.plate, snapshot._children.Parts._children.plate], [tickName, null, tick]], 'subtract', { artboardWidth: 200, artboardHeight: 200 });
  assert.equal(plan.ok, true);
  assert.equal(plan.parts[tickName].generated, false);
  assert.equal(plan.parts[tickName].meta.detachedFromGenerator, 'ticks');
  const after = materializedCustomComponentSnapshot({ ...control, _children: { ...control._children, Parts: { _type: 'Parts', _children: plan.parts } } });
  assert.equal(after._children.Parts._children[tickName].meta.booleanGroup, plan.groupName, 'the generator did not stamp over it');
  assert.notEqual(after._children.Parts._children[tickName].generated, true);
});

test('release gives back exactly what was there; shapes nest; a malformed loop is ignored', async () => {
  const { plate, hole } = plateAndHole();
  const dot = part('dot', 'circle', 3, px(90, 90, 20, 20));
  const inner = await planBooleanGroup({ plate, hole, dot }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const outer = await planBooleanGroup(inner.parts, entriesOf(inner.parts, [inner.groupName, 'dot']), 'unite', SIZE);
  assert.equal(outer.ok, true);
  assert.deepEqual(groupMemberNames(outer.parts, outer.groupName).sort(), ['dot', 'hole', inner.groupName, 'plate'].sort());
  const nested = await resolvedShape(outer.parts, outer.groupName);
  // The plate with its hole, plus the three quarters of the dot that hang off the plate's corner.
  assert.ok(Math.abs(await areaOf(nested) - (10000 - Math.PI * 400 + Math.PI * 100 * 0.75)) < 8, 'the inner shape takes part as its result');

  const released = releasedParts(inner.parts, inner.groupName);
  assert.deepEqual(released, { plate, hole, dot }, 'release is the exact inverse of combining');

  const loop = clone(outer.parts);
  loop[inner.groupName].meta.boolean.operands.push(outer.groupName);
  assert.doesNotThrow(() => JSON.stringify(attachBooleanInputs(loop)), 'no circular structure');
});

test('rename, delete, reorder and paste keep membership straight', async () => {
  const { plate, hole } = plateAndHole();
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const g = plan.groupName;

  const rename = membershipRenamePatch(plan.parts, 'plate', 'base');
  assert.deepEqual(rename[`Parts.${g}.meta.boolean`].operands, ['base', 'hole']);
  assert.equal(rename[`Parts.${g}.meta.boolean`].paintFrom, 'base');
  assert.equal(rename['Parts.base.meta.booleanGroup'], undefined, 'the renamed part carries its own membership');
  assert.equal(membershipRenamePatch(plan.parts, g, 'badge')['Parts.hole.meta.booleanGroup'], 'badge');

  assert.deepEqual(Object.keys(partsAfterRemoval(plan.parts, [g])), [], 'a deleted shape takes its operands');
  const withoutHole = partsAfterRemoval(plan.parts, ['hole']);
  assert.deepEqual(withoutHole[g].meta.boolean.operands, ['plate']);

  const swapped = partsAfterOperandMove(plan.parts, 'hole', -1);
  assert.deepEqual(swapped[g].meta.boolean.operands, ['hole', 'plate']);
  assert.equal(swapped[g].meta.boolean.paintFrom, 'hole', 'the conventional paint source follows the order');
  assert.deepEqual(operandEntries(plan.parts, g).map(([name]) => name), ['hole', 'plate'], 'front first, as a layer list is');

  // Dragged in the layer list: onto another operand of the same shape reorders the shape; into or out
  // of it is refused by name; two ordinary layers are the stack's business.
  const dragged = planOperandMove(plan.parts, 'hole', 'plate');
  assert.deepEqual(dragged.parts[g].meta.boolean.operands, ['hole', 'plate']);
  assert.equal(dragged.parts[g].meta.boolean.paintFrom, 'hole');
  assert.equal(dragged.parts[g].meta.cache, undefined, 'and its outline is recomputed');
  assert.match(planOperandMove({ ...plan.parts, badge: plate }, 'badge', 'hole').reason, /Combine and Release/);
  assert.match(planOperandMove(plan.parts, 'hole', g).reason, /Combine and Release/);
  assert.equal(planOperandMove({ a: plate, b: hole }, 'a', 'b'), null);

  const copied = withGroupMembers(plan.parts, [g]);
  assert.deepEqual(copied, [g, 'plate', 'hole']);
  const paste = buildPastePatch({ parts: copied.map((name) => plan.parts[name]) }, Object.keys(plan.parts), [], 5);
  const pasted = Object.fromEntries(Object.entries(paste.patch).map(([path, value]) => [path.slice('Parts.'.length), value]));
  const copyName = `${g}_copy`;
  assert.deepEqual(pasted[copyName].meta.boolean.operands, ['plate_copy', 'hole_copy']);
  assert.equal(pasted.plate_copy.meta.booleanGroup, copyName);
  assert.deepEqual(paste.partNames, [copyName], 'the paste selects the shape, not its insides');

  const lone = remapCopiedGroups({ hole_copy: clone(plan.parts.hole) }, new Map([['hole', 'hole_copy']]));
  assert.equal(lone.hole_copy.meta.booleanGroup, undefined, 'an operand copied without its shape stands alone');
});

test('the cached outline is refreshed only when the operands have changed', async () => {
  const { plate, hole } = plateAndHole();
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const view = clone(plan.parts);
  attachBooleanInputs(view);
  assert.equal(await refreshedGroup(plan.parts[plan.groupName], view[plan.groupName], 400, 400), null);
  const moved = clone(plan.parts);
  moved.plate._children.Layout.x = 20;
  attachBooleanInputs(moved);
  const next = await refreshedGroup(plan.parts[plan.groupName], moved[plan.groupName], 400, 400);
  assert.equal(next._children.Layout.x, 20, 'the box follows');
});

test('flatten bakes one path and is refused while anything names an operand', async () => {
  const { plate, hole } = plateAndHole();
  const plan = await planBooleanGroup({ plate, hole }, entriesOf({ plate, hole }, ['plate', 'hole']), 'subtract', SIZE);
  const g = plan.groupName;
  const flat = await planFlatten({ _children: {} }, plan.parts, plan.parts, g, SIZE);
  assert.equal(flat.ok, true);
  assert.deepEqual(Object.keys(flat.parts), [g]);
  assert.equal(flat.parts[g].kind, 'path');
  assert.equal(flat.parts[g]._children.Background._children.Fill.colour, 'FFFF0000', 'painted as the shape was');
  assert.equal((flat.parts[g].meta.pathData.match(/M/gi) ?? []).length, 2, 'an outline and a hole');

  const named = { _children: { HitZones: { _children: { press: { source: 'part:hole' } } } } };
  const refused = await planFlatten(named, plan.parts, plan.parts, g, SIZE);
  assert.equal(refused.ok, false);
  assert.match(refused.refused[0].reason, /hit zone press/);
});

test('smooth turns a Pen path into a curve through its points', async () => {
  const pen = part('pen', 'path', 1, px(0, 0, 100, 100), {});
  pen.meta = { vectorPoints: [[0, 0], [1, 0], [1, 1], [0, 1]], closed: true };
  const plan = await planPathSmooth(pen, SIZE);
  assert.equal(plan.ok, true);
  assert.match(plan.patch['meta.pathData'], /c/i, 'curves');
  const smoothed = applyPartPatch(pen, plan.patch);
  assert.equal(smoothed.meta.vectorPoints, undefined);
  assert.equal(smoothed.meta.closed, true);
});
