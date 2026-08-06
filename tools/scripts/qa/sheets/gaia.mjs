// gaia.mjs — QA-06: a Roland GAIA SH-01 editor with all three tone layers on screen at once.
//
// This is the sheet that tests the device layer, and it is also the first honest answer to "can
// this program actually edit a synth". Everything on it is generated from the profile — control
// type, range, choices, group, and the device binding — so it is not a mock-up of an editor. It
// is what the profile says the editor should be.
//
// THREE TONES, SIDE BY SIDE. On the hardware you press TONE SELECT and the one set of knobs is
// pointed at a different layer; there is only ever one tone in front of you. A screen has no such
// constraint and should not inherit the workaround: the three tones are three address blocks at a
// 0x0100 stride, so showing all three is one column each and nothing more. Being able to see what
// tone 2 is doing while you edit tone 1 is most of the reason to have an editor at all.
//
// NO KEYBOARD. A note-input strip would be furniture here: this panel edits a patch, and the
// synth it edits has its own keys. Leaving it out also keeps the sheet honest about what it is
// testing — parameter binding, not note entry, which QA-04 covers.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createControl } from '../../../../CE/web/src/CE_Application/models/componentTypes.js';
import { parameterAdoptionPatches } from '../../../../CE/web/src/CE_Application/utils/parameterAdoptionRules.js';
import { createPanel } from '../../../../CE/web/src/CE_Application/stores/panelModel.js';
import { GRID, styleSheet } from '../layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.resolve(HERE, '../../../../CE/profiles/test/roland-gaia-sh01.ceditor-device.json');

/** Which port a bound control exposes. Keep in step with DEFAULT_COMPONENT_PORTS. */
const PORT_FOR = {
  Knob: 'value', Slider: 'value', Number: 'value',
  ToggleButton: 'state', RadioButtonGroup: 'selectedChoice', Combobox: 'selectedChoice',
  TextInput: 'text',
};

/** Sections within a tone, in signal-flow order — the order the front panel is laid out in. */
const TONE_SECTIONS = ['OSC', 'Filter', 'Amp', 'LFO', 'Mod LFO'];

const COLUMN = {
  width: 500,
  gap: 16,
  cellWidth: 108,
  cellHeight: 62,
  cellGap: 8,
  rowGap: 10,
  headerHeight: 24,
  sectionHeight: 20,
};

const TONE_TINT = ['FF4A9BD5', 'FFD59B4A', 'FF7AD54A'];

function loadProfile() {
  return JSON.parse(readFileSync(PROFILE, 'utf8'));
}

function label(text, box, id, { size = 11, bold = false, fill = '00000000', colour = 'FFDDDDDD' } = {}) {
  return createControl('Label', {
    Core: { id, name: id },
    Transform: { x: box.x, y: box.y, width: box.width, height: box.height },
    Text: { content: text, _children: { Font: { size, bold, weight: bold ? 'Bold' : 'Regular', weightValue: bold ? 700 : 400 }, Fill: { colour } } },
    Background: { _children: { Fill: { colour: fill } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', paddingLeft: 6, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
  });
}

/** Set a dotted 'Section.path' on a freshly built control. */
function setPath(control, path, value) {
  const keys = path.split('.');
  let node = control._children;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]]) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

/**
 * One bound control for one profile parameter.
 *
 * The binding alone is not enough, and the first draft of this sheet proved it: it set
 * `adoptMetadata: true` and stopped there, so every knob rendered 0.00–1.00 and every combobox
 * said "Option 1". `adoptMetadata` is a flag the editor reads when a parameter is DROPPED onto a
 * control — the thing that actually shapes the control is adoptParameterMetadata, which stamps the
 * range, choices and label onto it. A generated sheet has no drop, so it applies the same rules
 * itself, from the same module the editor uses (parameterAdoptionRules.js) rather than a copy that
 * would drift.
 */
function boundControl(parameter, box, id) {
  const type = parameter.ui?.preferredComponent ?? 'Knob';
  const port = PORT_FOR[type] ?? 'value';

  const overrides = {
    Core: { id, name: id, description: `${parameter.name} — ${parameter.address ?? parameter.messageRecipe}` },
    Transform: { x: box.x, y: box.y, width: box.width, height: box.height },
    DeviceBindings: {
      bindings: [{
        kind: 'deviceParameter',
        port,
        deviceRole: 'primary',
        parameterId: parameter.id,
        parameterType: parameter.type,
        adoptMetadata: true,
        dryRun: false,
        feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
      }],
    },
  };

  const control = createControl(type, overrides);

  // Same rules the canvas runs on a parameter drop: range, choices, value type, button behaviour.
  for (const [path, value] of Object.entries(parameterAdoptionPatches(type, parameter))) {
    setPath(control, path, value);
  }

  // A label for the controls whose own text is not their label — a knob has no room for one, so
  // the caption above it carries the name and the control carries the value.
  if (type === 'ToggleButton' && !control._children.Text?.content) {
    setPath(control, 'Text.content', parameter.display?.shortLabel ?? parameter.name);
  }

  return control;
}

/** Lay a section's parameters out as a wrapped row of cells inside a column. */
function layoutSection(parameters, { x, y, columnWidth, keyPrefix }) {
  const controls = [];
  let cursorX = x;
  let cursorY = y;
  const perRow = Math.max(1, Math.floor((columnWidth + COLUMN.cellGap) / (COLUMN.cellWidth + COLUMN.cellGap)));

  parameters.forEach((parameter, index) => {
    if (index > 0 && index % perRow === 0) {
      cursorX = x;
      cursorY += COLUMN.cellHeight + COLUMN.rowGap + 14;
    }
    const id = `${keyPrefix}_${parameter.id.replace(/\W+/g, '_')}`;
    controls.push(label(parameter.display?.shortLabel ?? parameter.name, { x: cursorX, y: cursorY, width: COLUMN.cellWidth, height: 14 }, `${id}_cap`, { size: 10, colour: 'FFAAB4BE' }));
    controls.push(boundControl(parameter, { x: cursorX, y: cursorY + 15, width: COLUMN.cellWidth, height: COLUMN.cellHeight }, id));
    cursorX += COLUMN.cellWidth + COLUMN.cellGap;
  });

  return { controls, bottom: cursorY + COLUMN.cellHeight + 15 };
}

const NOTES = `QA-06 — Roland GAIA SH-01, all three tones.

Generated by tools/scripts/qa/make-qa-panels.mjs from
CE/profiles/test/roland-gaia-sh01.ceditor-device.json. Do not hand-edit.

Why all three tones are on screen
  On the hardware you press TONE SELECT and one set of knobs points at a different layer. That is
  a limit of having one set of knobs, not of the synth: Tone 1/2/3 are three address blocks at a
  0x0100 stride (10 00 01 xx / 10 00 02 xx / 10 00 03 xx). A screen can show all three, so it does.
  There is no keyboard here on purpose — this panel edits a patch; the synth has its own keys.

How to read it
  Every control is BOUND to a profile parameter and adopts its range, choices and display from the
  profile. Nothing on this sheet hardcodes a range. So what you see is what the profile claims.

What a failure looks like
  - a knob whose range reads 0..1              adoptMetadata did not run
  - a choice control with no options           the profile's choices did not reach the control
  - the same value echoed onto all three tones a binding lost its tone prefix (tone2.* vs tone1.*)
  - a bipolar knob centred at 0 instead of 64  wire-vs-display range confusion

Verified against the manual
  The profile's golden vectors are byte-for-byte identical to the worked example in "SH-01 MIDI
  Implementation" v1.01, §Example 1:  F0 41 10 00 00 41 12 10 00 01 00 06 69 F7
  (Tone 1 OSC Wave = SUPER-SAW). Address arithmetic and Roland checksum both confirmed.

Not covered yet
  Distortion, Flanger, Delay, Reverb and Arpeggio are not transcribed; the profile's "coverage"
  block lists them under notTranscribed rather than pretending otherwise.`;

export function buildGaiaSheet() {
  const profile = loadProfile();
  const panel = createPanel('QA-06 Roland GAIA SH-01');
  const controls = [];

  const byGroup = new Map();
  for (const parameter of profile.parameters) {
    if (!byGroup.has(parameter.group)) byGroup.set(parameter.group, []);
    byGroup.get(parameter.group).push(parameter);
  }

  // ---- Patch Common across the top: it applies to all three tones, so it sits above all three.
  let y = GRID.marginY;
  controls.push(label('PATCH COMMON — applies to the whole patch', { x: GRID.marginX, y, width: GRID.sheetWidth - GRID.marginX * 2, height: COLUMN.headerHeight }, 'gaia_common_header', { size: 13, bold: true, fill: 'FF23282D' }));
  y += COLUMN.headerHeight + 8;

  const common = [...(byGroup.get('Patch Common') ?? []), ...(byGroup.get('Global') ?? [])];
  const commonLayout = layoutSection(common, { x: GRID.marginX, y, columnWidth: GRID.sheetWidth - GRID.marginX * 2, keyPrefix: 'gaia_common' });
  controls.push(...commonLayout.controls);
  y = commonLayout.bottom + 24;

  // ---- Three tone columns, side by side. Same code three times over, which is the whole claim.
  const columnTop = y;
  let deepest = y;

  for (const tone of [1, 2, 3]) {
    const x = GRID.marginX + (tone - 1) * (COLUMN.width + COLUMN.gap);
    let cursorY = columnTop;

    controls.push(label(`TONE ${tone}`, { x, y: cursorY, width: COLUMN.width, height: COLUMN.headerHeight }, `gaia_tone${tone}_header`, { size: 13, bold: true, fill: TONE_TINT[tone - 1] }));
    cursorY += COLUMN.headerHeight + 8;

    for (const section of TONE_SECTIONS) {
      const parameters = byGroup.get(`Tone ${tone} · ${section}`) ?? [];
      if (parameters.length === 0) continue;

      controls.push(label(section.toUpperCase(), { x, y: cursorY, width: COLUMN.width, height: COLUMN.sectionHeight }, `gaia_tone${tone}_${section.replace(/\W+/g, '')}_header`, { size: 11, bold: true, fill: 'FF262C31', colour: 'FFBFD4E6' }));
      cursorY += COLUMN.sectionHeight + 6;

      const laid = layoutSection(parameters, { x, y: cursorY, columnWidth: COLUMN.width, keyPrefix: `gaia_t${tone}` });
      controls.push(...laid.controls);
      cursorY = laid.bottom + 12;
    }

    deepest = Math.max(deepest, cursorY);
  }

  // ---- Everything the tone columns did not claim: effects, arpeggio, anything added later.
  //
  // Derived rather than listed. The first version placed Patch Common and three tone columns and
  // named nothing else, so when the profile grew from 162 parameters to 265 the sheet silently
  // stopped covering 103 of them. The binding gate caught it, which is what the gate is for — but
  // a sheet should not need a gate to notice a whole missing block. It now places every group it
  // has not already placed, so a block added to the profile turns up here on the next run.
  const placed = new Set([
    'Patch Common', 'Global',
    ...[1, 2, 3].flatMap((tone) => TONE_SECTIONS.map((section) => `Tone ${tone} \u00b7 ${section}`)),
  ]);
  const remaining = [...byGroup.keys()].filter((group) => !placed.has(group)).sort();

  y = deepest + 28;
  for (const group of remaining) {
    const key = group.replace(/\W+/g, '_');
    controls.push(label(group.toUpperCase(), { x: GRID.marginX, y, width: GRID.sheetWidth - GRID.marginX * 2, height: COLUMN.sectionHeight }, `gaia_grp_${key}`, { size: 11, bold: true, fill: 'FF262C31', colour: 'FFBFD4E6' }));
    y += COLUMN.sectionHeight + 6;

    const laid = layoutSection(byGroup.get(group), { x: GRID.marginX, y, columnWidth: GRID.sheetWidth - GRID.marginX * 2, keyPrefix: `gaia_${key}` });
    controls.push(...laid.controls);
    y = laid.bottom + 14;
  }

  panel.controls = controls;
  panel.height = y + GRID.marginY;
  // The panel declares which profile it needs, the way the editor writes it when you drop a
  // parameter onto a control — so opening this sheet asks for the profile rather than silently
  // rendering 162 unbound controls.
  panel.requiredProfiles = [{ role: 'primary', profileId: profile.id, version: '*' }];

  return styleSheet(panel, { title: 'QA-06 — Roland GAIA SH-01, three tones bound to the device profile', notes: NOTES });
}

/** Exposed for the coverage test: every profile parameter should reach the sheet. */
export function gaiaProfile() {
  return loadProfile();
}
