// meterPartsPlay.test.js — a meter's own parts play what is put on them, and so does each of its
// lamps (the Meter, phase 2: docs/design/component-presets.md). The renderer is
// editor/MeterDeviceParts.svelte; what each part draws, utils/meterParts.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { METER_CELL_PART, meterDrawsCells, meterPartNames, meterPlainLamps } from '../src/CE_Application/models/meterDeviceParts.js';
import { meterPartDrawing } from '../src/CE_Application/utils/meterParts.js';
import { applyPresetPatch, meterPartsNotDrawn, presetDoesNotFit } from '../src/CE_Application/utils/animationPresetModel.js';
import { targetTree } from '../src/CE_Application/utils/targetPaths.js';

const src = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
const drawnIn = (setId, overrides = {}) => resolveControlForSet(createControl('Meter', { Transform: { width: 240, height: 60 }, ...overrides }), getControlSet(setId));
const onPart = (part, fields = {}) => ({
  _type: 'AnimationPreset', category: 'Meter', name: 'probe', fields,
  animations: { a: { _type: 'Animation', name: 'a', enabled: true, kind: 'keyframes', trigger: { type: 'always' }, targets: [{ path: `Parts.${part}` }], frames: [{ at: 0, opacity: 1 }, { at: 1, opacity: 0.5 }], duration: 400 } },
});

test('a part that lights cells draws each lamp alone too: its place along the row, lit or not', () => {
  const drawn = drawnIn('gimbal-ring');
  const indicator = drawn._children.Parts._children.indicator;
  const { cells } = meterPartDrawing('indicator', indicator, { p: 0.5, meter: drawn._children.Meter });
  assert.ok(cells.length >= 4, `${cells.length} lamps`);
  const count = cells[0].count;
  assert.deepEqual([...new Set(cells.map((cell) => cell.index))].sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
  assert.ok(cells.every((cell) => cell.lit === cell.index / count <= 0.5 + 1e-9), 'lit up to the level, from the edge it lights from');
  const needle = drawnIn('valve')._children.Parts._children.indicator;
  assert.equal(meterPartDrawing('indicator', needle, { p: 0.5 }).cells, undefined, 'a needle has no lamps');
});

test('every lamp is a part a meter offers, and the sets that draw lamps have them to play on', () => {
  assert.deepEqual(meterPartNames(createControl('Meter')), [METER_CELL_PART]);
  assert.deepEqual(meterPartNames(createControl('Knob')), []);
  for (const id of ['gimbal-ring', 'carbon-pro', 'phosphor', 'turret-stack']) assert.ok(meterDrawsCells(drawnIn(id)), `${id} draws lamps`);
  for (const id of ['valve', 'anodised', 'valve-console', 'ivory']) assert.ok(!meterDrawsCells(drawnIn(id)), `${id} draws none`);
  const places = targetTree(createControl('Meter'), 'keyframes').flatMap((place) => [place, ...(place.parts ?? [])]);
  assert.ok(JSON.stringify(places).includes('Every lamp'), 'the target picker names it');
});

test('a preset on a meter\'s part is refused where its set does not draw that part, unless it turns it on', () => {
  assert.equal(presetDoesNotFit(onPart(METER_CELL_PART), createControl('Meter')), '');
  assert.match(presetDoesNotFit(onPart(METER_CELL_PART), createControl('Knob')), /does not have: cell/);
  assert.match(meterPartsNotDrawn(onPart(METER_CELL_PART), drawnIn('valve')), /every lamp, which this meter's set does not draw/);
  assert.equal(meterPartsNotDrawn(onPart(METER_CELL_PART), drawnIn('carbon-pro')), '');
  assert.equal(meterPartsNotDrawn(onPart('indicator'), drawnIn('valve')), '', 'the needle is drawn');
  assert.match(meterPartsNotDrawn(onPart('lamp'), drawnIn('anodised')), /lamp, which this meter's set does not draw/, 'no set draws the clip lamp');
  assert.equal(meterPartsNotDrawn(onPart('lamp', { 'Parts.lamp.visible': true }), drawnIn('anodised')), '', 'one that turns the lamp on is not refused for its being off');
  const plain = resolveControlForSet(createControl('Meter'), getControlSet('graphite'));
  assert.match(meterPartsNotDrawn(onPart('indicator'), plain), /draws it plain, with no parts to play on/);
  const { patch, reason } = applyPresetPatch(createControl('Meter'), onPart(METER_CELL_PART), { drawn: drawnIn('valve') });
  assert.equal(patch, null);
  assert.match(reason, /every lamp/);
});

// The plain look (editor/MeterRenderer.svelte), Graphite's and Ceramic's, draws LED segments where an
// author gives it some (Meter.segments): those are its lamps. Left open by phase 2 and done since.
test('a meter drawn plain in LED segments has them as lamps to play on; one drawn as a bar is told how to get them', () => {
  const plain = (segments) => resolveControlForSet(createControl('Meter', segments ? { Meter: { segments } } : {}), getControlSet('graphite'));
  assert.equal(meterPlainLamps(plain(0)), 0);
  assert.equal(meterPlainLamps(plain(12)), 12);
  assert.equal(meterPartsNotDrawn(onPart(METER_CELL_PART), plain(12)), '', 'twelve lamps to play on');
  assert.match(meterPartsNotDrawn(onPart(METER_CELL_PART), plain(0)), /drawn as one bar: give it segments \(the Meter tab's Segments\)/);
  assert.match(meterPartsNotDrawn(onPart('indicator'), plain(12)), /draws it plain, with no parts to play on/, 'its segments are lamps, not a needle');
  // A form names what it draws (editor/ControlAnatomy.svelte), segments or none.
  const formed = plain(12);
  formed._children.Core = { ...formed._children.Core, controlForm: 'vu' };
  assert.match(meterPartsNotDrawn(onPart(METER_CELL_PART), formed), /no parts to play on/);
});

test('the plain look plays every lamp on its segments, a bar\'s and an arc\'s, each with its place along the row', () => {
  const canvas = src('editor/CanvasControl.svelte');
  assert.match(canvas, /<MeterRenderer control=\{renderControl\} width=\{displayW\} height=\{displayH\} \{drawnValue\}\s+partAnimations=\{activeKeyframes\?\.parts \?\? null\} partColours=\{keyframeColours\} \/>/);
  const plain = src('editor/MeterRenderer.svelte');
  assert.match(plain, /partAnimations\?\.get\?\.\(METER_CELL_PART\)/);
  assert.match(plain, /const lampVars = \(index, lit\) => `\$\{optionRankVars\(index, segments, lit - 1\)\}\$\{lampsPlay\.colours\}`;/);
  // A bar's segment moves as a box and lights through the paint channel; an arc's as a shape, through its stroke.
  assert.match(plain, /<div class="seg-lamp" data-lamp=\{idx\}[^>]*style=\{`\$\{lampVars\(idx, lit\)\}\$\{lampsPlay\.box\}`\}>/);
  assert.match(plain, /animation:var\(--ce-kf-paint, none\);/);
  assert.match(plain, /<g style=\{lampVars\(i, lit\)\}><g data-lamp=\{i\}[^>]*style=\{lampsPlay\.shape \|\| undefined\}>/);
  assert.match(plain, /style="animation:var\(--ce-kf-stroke, none\);"/);
  // Nothing playing, a segment is drawn as it always was.
  assert.match(plain, /\{#if lampsPlay\}[\s\S]*\{:else\}\s*<div class="seg"/);
});

test('the renderer plays each part\'s animations, colours and easing, and every lamp\'s, one after another', () => {
  const anatomy = src('editor/ControlAnatomy.svelte');
  assert.match(anatomy, /<MeterDeviceParts [^>]*\{partAnimations\} \{partColours\} \{partTransitions\} \{partTexts\} \/>/);
  const parts = src('editor/MeterDeviceParts.svelte');
  assert.match(parts, /moves: animationDeclaration\(partAnimations\?\.get\?\.\(name\) \?\? null, \{ svg: true \}\)/);
  assert.match(parts, /<g data-part-moves=\{item\.moves \? '' : undefined\} style=\{item\.moves \|\| undefined\}>/);
  // A part paints through the shape channel, so a colour frame recolours it.
  assert.match(parts, /const paint = \(colour\) => `fill:\$\{colour\};transition:var\(--ce-colour-transition, none\);animation:var\(--ce-kf-shape, none\);`;/);
  // Each lamp stands somewhere: along the row, from the top, from the level, scattered.
  assert.match(parts, /vars: `\$\{optionRankVars\(cell\.index, cell\.count, top\)\}\$\{lampsPlay\.colours\}`/);
  assert.match(parts, /cells: name === 'indicator' && lampsPlay && drawing\.cells\?\.length \? eachLamp/);
});
