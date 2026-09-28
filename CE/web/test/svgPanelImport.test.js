// svgPanelImport.test.js — a panel drawn in a vector editor becomes a CEditor panel.
//
// Two fixtures, one per editor the convention has to survive:
//
//   svg-panel-inkscape.svg     millimetres, a translated placeholder layer hidden with display:none,
//                              objects named through inkscape:label and <title>, a rotated group,
//                              a path that cannot be measured, and non-ASCII text in the artwork.
//   svg-panel-illustrator.svg  Illustrator's DOCTYPE — a PUBLIC DTD and an entity subset — a bare viewBox, layers
//                              named through data-name, and no names at all — only the colour
//                              convention, one fill of it set through a CSS class.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  buildSvgImportControls, colourRole, describeSvgImport, documentFrame, parseLength, parseTransform,
  planSvgPanelImport, roleFromName,
} from '../src/CE_Application/utils/svgPanelImport.js';
import { parseXml } from '../../../tools/ctrlr-import/xml.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(here, 'fixtures', name), 'utf8');
const MM = 96 / 25.4;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.05, `${label}: ${actual} vs ${expected}`);
const byName = (plan, name) => plan.placeholders.find((p) => p.name === name);

// --- Inkscape --------------------------------------------------------------------------------------

const inkscape = planSvgPanelImport(fixture('svg-panel-inkscape.svg'));

test('an Inkscape document in millimetres becomes a panel of the same physical size', () => {
  assert.equal(inkscape.ok, true, inkscape.error);
  assert.equal(inkscape.width, Math.round(120 * MM));
  assert.equal(inkscape.height, Math.round(60 * MM));
  assert.equal(inkscape.layer, 'components');
});

test('named placeholders land where they are drawn, through the layer\'s own transform', () => {
  const cutoff = byName(inkscape, 'cutoff');
  assert.equal(cutoff.type, 'Knob');
  near(cutoff.x, 12 * MM, 'x');
  near(cutoff.y, 22 * MM, 'y — the layer is translated 2 mm down');
  near(cutoff.width, 16 * MM, 'width');
  assert.equal(cutoff.reason, 'named "knob-cutoff"');
});

test('a name can come from a <title>, and the keyword can be anywhere in it', () => {
  const resonance = byName(inkscape, 'Resonance');
  assert.equal(resonance?.type, 'Knob');
});

test('a tall slider is vertical, and its name keeps its words', () => {
  const slider = byName(inkscape, 'env_amount');
  assert.equal(slider.type, 'Slider');
  assert.equal(slider.orientation, 'vertical');
  assert.equal(slider.text, 'env amount');
});

test('a rotated group moves its placeholder to the rotated box', () => {
  const mode = byName(inkscape, 'mode');
  assert.equal(mode.type, 'Button');
  near(mode.x, 96 * MM, 'x');
  near(mode.y, 36 * MM, 'y');
  near(mode.width, 8 * MM, 'width, swapped by the rotation');
  near(mode.height, 12 * MM, 'height');
});

test('LEDs and labels come through, and what could not be measured is reported, not dropped', () => {
  assert.equal(byName(inkscape, 'clip').role, 'led');
  assert.equal(byName(inkscape, 'Filter_Cutoff').type, 'Label');
  assert.equal(inkscape.skipped.length, 1);
  assert.match(inkscape.skipped[0].source, /knob-drive/);
  assert.match(inkscape.skipped[0].reason, /convert it to a rectangle or circle/);
});

test('the artwork keeps everything except the placeholder layer, byte for byte', () => {
  const svg = inkscape.background.svg;
  assert.doesNotMatch(svg, /inkscape:label="components"/);
  assert.doesNotMatch(svg, /knob-cutoff/);
  assert.match(svg, /FILTER — Ω/, 'non-ASCII text survives');
  assert.match(svg, /<sodipodi:namedview/);
  const decoded = Buffer.from(inkscape.background.dataUrl.split(',')[1], 'base64').toString('utf8');
  assert.equal(decoded, svg, 'the data URL is the UTF-8 artwork');
  assert.equal(parseXml(svg, { doctypeSubset: 'skip' }).name, 'svg', 'and it is still a well-formed document');
});

// --- Illustrator -----------------------------------------------------------------------------------

const illustrator = planSvgPanelImport(fixture('svg-panel-illustrator.svg'));

test('Illustrator\'s entity subset is stepped over, not refused and not expanded', () => {
  assert.equal(illustrator.ok, true, illustrator.error);
  assert.equal(illustrator.width, 400);
  assert.equal(illustrator.height, 200);
  assert.equal(illustrator.layer, 'components');
  assert.match(illustrator.background.svg, /xmlns:x="&ns_extend;"/, 'the entity reference is left as written');
});

test('with no names at all, the colour convention decides', () => {
  const roles = illustrator.placeholders.map((p) => `${p.role}:${p.reason}`);
  assert.deepEqual(roles, [
    'knob:red circle',
    'slider:red long rectangle',
    'button:red rectangle',
    'button:green rectangle',
    'led:magenta circle',
    'display:yellow rectangle',
    'label:blue rectangle',
    'knob:named "Cutoff knob"',
  ]);
});

test('a fill set through an Illustrator CSS class counts', () => {
  assert.equal(illustrator.placeholders[2].reason, 'red rectangle', 'the <rect class="st1"> placeholder');
});

test('a grey rectangle with no name is skipped with the reason', () => {
  assert.equal(illustrator.skipped.length, 1);
  assert.match(illustrator.skipped[0].reason, /neither by name nor by colour/);
});

// --- Controls --------------------------------------------------------------------------------------

test('the plan becomes real, uniquely named controls', () => {
  const controls = buildSvgImportControls(illustrator, ['knob_1']);
  const names = controls.map((c) => c._children.Core.name);
  assert.equal(new Set(names).size, names.length, `unique: ${names.join(', ')}`);
  assert.ok(!names.includes('knob_1'), 'an existing name is not reused');
  assert.ok(names.includes('Cutoff'));
  const types = controls.map((c) => c._children.Core.controlType);
  assert.deepEqual(types, ['Knob', 'Slider', 'Button', 'Button', 'Shape', 'LcdDisplay', 'Label', 'Knob']);

  const slider = controls[1]._children;
  assert.equal(slider.Behavior.orientation, 'vertical');
  assert.deepEqual([slider.Transform.x, slider.Transform.y, slider.Transform.width, slider.Transform.height], [140, 40, 16, 120]);
  assert.equal(controls[4]._children.Shape.kind, 'ellipse', 'an LED is a round lamp');
  assert.equal(controls[2]._children.Text.content, '', 'a button leaves the legend to the artwork');
  assert.equal(controls[6]._children.Text._children.Font.size, 9, 'a 16px-high label box gets 9px type');
  const long = buildSvgImportControls(inkscape).find((c) => c._children.Core.name === 'Filter_Cutoff');
  assert.ok(long._children.Text._children.Font.size <= 9, '"Filter Cutoff" in a 76px box is held to the width, not the height');
  assert.equal(controls[6]._children.Background._children.Fill.colour, '00000000', 'a label does not hide the artwork');
  assert.equal(controls[6]._children.Background._children.Border.enabled, false, 'nor draw a box around it');
});

test('the report says what was inferred and why', () => {
  const lines = describeSvgImport(illustrator);
  assert.match(lines[0], /8 control\(s\) from the "components" layer on a 400×200 panel/);
  assert.ok(lines.some((line) => /LED\(s\) placed as round shapes/.test(line)));
  assert.ok(lines.some((line) => /→ Slider \(from its red long rectangle\)/.test(line)));
  assert.ok(lines.some((line) => /^skipped/.test(line)));
});

// --- Refusals --------------------------------------------------------------------------------------

test('what it cannot use, it says how to fix', () => {
  assert.match(planSvgPanelImport('<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>').error, /layer named "components"/);
  assert.match(planSvgPanelImport('<svg><g id="components"/></svg>').error, /no usable size/);
  assert.match(planSvgPanelImport('<html/>').error, /not <svg>/);
  assert.match(planSvgPanelImport('not xml at all').error, /not a readable SVG/);
  // A DOCTYPE is stepped over, never fetched: this document gets as far as having no size.
  assert.match(planSvgPanelImport('<!DOCTYPE svg SYSTEM "http://example.invalid/x.dtd"><svg/>').error, /no usable size/);
  // ...and an entity it declares is never expanded into the document.
  const bomb = '<!DOCTYPE svg [<!ENTITY a "AAAAAAAA"><!ENTITY b "&a;&a;&a;&a;">]>'
    + '<svg viewBox="0 0 10 10"><text>&b;</text><g id="components"><circle r="2" cx="5" cy="5" fill="red"/></g></svg>';
  const planned = planSvgPanelImport(bomb);
  assert.equal(planned.ok, true);
  assert.match(planned.background.svg, /<text>&b;<\/text>/, 'left exactly as written');
});

// --- Pieces ----------------------------------------------------------------------------------------

test('lengths, transforms and frames', () => {
  near(parseLength('25.4mm'), 96, 'mm');
  near(parseLength('1in'), 96, 'in');
  assert.equal(parseLength('50%'), null);
  const m = parseTransform('translate(10,20) scale(2)');
  assert.deepEqual(m, [2, 0, 0, 2, 10, 20]);
  const meet = documentFrame({ attributes: { width: '200', height: '100', viewBox: '0 0 100 100' } });
  assert.deepEqual(meet.matrix, [1, 0, 0, 1, 50, 0], 'xMidYMid meet centres the narrower axis');
});

test('names and colours', () => {
  assert.deepEqual(roleFromName('Filter Cutoff knob'), { role: 'knob', rest: ['Filter', 'Cutoff'] });
  assert.equal(roleFromName('rect12').role, '');
  assert.equal(colourRole('ee1111'), 'control', 'a hand-picked red still counts');
  assert.equal(colourRole('808080'), '');
});
