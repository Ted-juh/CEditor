// make-sh201-panel.mjs — the first draft of a Roland SH-201 panel that explains itself in the editor.
//
//   node tools/scripts/sh201-panel/make-sh201-panel.mjs            write both panels and their libraries
//   node tools/scripts/sh201-panel/make-sh201-panel.mjs --check    exit 1 if any is out of date
//
// Two panels from one layout: the draft, in the GAIA panel's dark look, and the same panel in the
// SH-201's own look — the answer to the tutorial in the draft's notepad, which takes a reader from
// the one to the other by hand in the editor.
//
// WHAT IS DIFFERENT FROM THE GAIA AND AN1x PANELS. Those are generated, and their structure only
// makes sense in the generator. This one is meant to be read in the editor, so what a reader needs to
// see is in the document, not in this file:
//
//   - Four library components — the SH-201 knob, fader, LED switch and arpeggio grid — placed as
//     LINKED copies.
//     Select any knob and its Source card names the package; "Update N other copies" finds the
//     others. A copy's range, default and readout are published as editable properties, so a knob
//     bound to Coarse Tune (28..100, read -36..+36) and one bound to Cutoff (0..127) are the same
//     component with different settings, not two edited copies.
//   - One binding per control, the same one the Device tab makes: select a control and its Device
//     Bindings section shows exactly which profile parameter it sends.
//   - Containers named after the hardware's sections (Upper › OSC 1, Filter, Amp …), so the
//     component tree reads like the front panel.
//   - Both tones on the panel at once, and the synth's Keyboard Part as a selector of its own: see
//     TONES for why not a State.
//   - No scripts.
//
// THE FIRST VERSION ONLY. After it, the .cepanel file is the source and is edited in CEditor; this
// generator is kept as the record of how the draft was made and to rebuild it while the draft is
// still being shaped. It covers the two tones, what they share — the patch's settings, the
// arpeggiator and the effects — and the system settings.
//
// The library file goes beside the panel. The library lives inside CEditor rather than in the
// panel: a copy keeps its whole design and works anywhere, but on a machine without the package its
// Source card says "Not in this library". A .cepanel opened from this folder has nothing else to
// find it by, so importing the library file (Library → Package & Library → Import) restores the
// link; a panel passed on with File → Share Panel carries its packages and needs no file beside it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { parameterAdoptionPatches } from '../../../CE/web/src/CE_Application/utils/parameterAdoptionRules.js';
import { createPanel, serializePanel } from '../../../CE/web/src/CE_Application/stores/panelModel.js';
import { DEFAULT_CONTROL_SET_ID } from '../../../CE/web/src/CE_Application/models/controlSets.js';
import {
  createCustomComponentExportEnvelope, createCustomComponentLibraryEnvelope,
  instantiateCustomComponentPackageControl, customComponentPackageId,
} from '../../../CE/web/src/CE_Application/utils/customComponentPackage.js';
import { diffCustomComponentAgainstSource } from '../../../CE/web/src/CE_Application/utils/customComponentSourceLink.js';
import { gaiaArpGrid, gaiaFader, gaiaKnob, gaiaLeds } from '../gaia-panel/components.mjs';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { brushedMetalDataUrl, brushedMetalPng } from './brushedMetal.mjs';
import {
  SECTIONS, SECTION_ROWS, PANEL, SKIN, HARDWARE_SECTIONS, HARDWARE_ROWS, HARDWARE_SKIN,
  PATCH_SECTIONS, PATCH_ROWS, HARDWARE_PATCH_SECTIONS, ARP_GRID,
  SYSTEM_SECTIONS, SYSTEM_ROWS, HARDWARE_SYSTEM_SECTIONS,
} from './layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROFILE = path.join(REPO, 'CE/profiles/test/roland-sh-201.ceditor-device.json');

/** The device name every binding carries — a name a person would give the instrument. */
export const DEVICE_NAME = 'Roland SH-201';

/** The brushed-metal texture the hardware look's silver sections carry, and readers of the tutorial use. */
export const METAL_TEXTURE_OUT = 'CE/panels/Roland SH-201 brushed metal.png';
const METAL = brushedMetalDataUrl();
// A transparent metallic overlay: tiled over the silver, blended with Overlay, so the streaks
// lighten and darken the fill without changing its colour (brushedMetal.mjs says why).
const METAL_OVERLAY = { overlayEnabled: true, overlaySrc: METAL, overlayFit: 'tile', overlayBlend: 'overlay', overlayOpacity: 60, overlayTileScale: 1 };

/** A fixed date for the packages, so the files only change when the design does. */
const STAMP = '2026-10-29T00:00:00.000Z';

let seq = 0;
const nextId = (hint) => `sh201_${String(hint).replace(/\W+/g, '_')}_${++seq}`;

function setPath(control, dotted, value) {
  const keys = dotted.split('.');
  let node = control._children;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]]) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function label(text, { x, y, w, h = 14 }, { size = 9, colour = SKIN.caption, bold = false, align = 'center', name = 'caption' } = {}) {
  return createControl('Label', {
    Core: { id: nextId(name), name },
    Transform: { x, y, width: w, height: h },
    Text: {
      content: text,
      _children: {
        Font: { size, bold, weight: bold ? 'Bold' : 'Regular', weightValue: bold ? 700 : 400, letterSpacing: 0.4 },
        Fill: { colour },
        Multiline: { wrapMode: 'none', overflowMode: 'shrink', fitMode: 'shrink', maxLines: 1, lineHeight: 1.1 },
      },
    },
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: align, verticalAlign: 'center', paddingLeft: 1, paddingRight: 1, paddingTop: 0, paddingBottom: 0 },
  });
}

/* ------------------------------------------------------------------ the three library components */

/**
 * What a copy may set without editing the component: its range, step, type, readout and label —
 * the things that differ between a knob bound to Coarse Tune and one bound to Cutoff. Published, so
 * the Source card counts them as this copy's settings rather than as design edits, and an update
 * from the library keeps them (utils/customComponentSourceLink.js).
 */
const RANGE_PROPERTIES = {
  minimum: { path: 'ValueChannels.value.min', label: 'Minimum', type: 'number', enabled: true },
  maximum: { path: 'ValueChannels.value.max', label: 'Maximum', type: 'number', enabled: true },
  step: { path: 'ValueChannels.value.step', label: 'Step', type: 'number', enabled: true },
  valueType: { path: 'ValueChannels.value.type', label: 'Value type', type: 'enum', enabled: true },
  readout: { path: 'ValueChannels.value.format', label: 'Readout (display range, unit)', type: 'object', enabled: true },
};

function publish(control, { editable = {} } = {}) {
  control._children.PublishedProperties = {
    _type: 'PublishedProperties',
    inputs: { value: { channel: 'value', label: 'Value', type: 'float', enabled: true } },
    outputs: { value: { channel: 'value', label: 'Value', type: 'float', enabled: true } },
    editableProperties: editable,
  };
  return control;
}

/** The two-lamp switch: OFF and ON, the way a parameter with one button and a lamp reads. */
function ledSwitch() {
  const control = gaiaLeds({ options: [{ label: 'OFF', value: 0 }, { label: 'ON', value: 1 }], width: 64, rowHeight: 15, legacySkin: true });
  // A boolean parameter reports itself as true/false, not 0/1, when the synth sends it back. Both
  // spellings light the same lamp, or a value read from the synth would leave both dark.
  for (const binding of Object.values(control._children.Bindings._children ?? {})) {
    const map = binding.enumMap ?? binding.map ?? binding.mapping?.enumMap;
    if (map && typeof map === 'object') {
      if ('0' in map) map.false = map['0'];
      if ('1' in map) map.true = map['1'];
    }
  }
  return control;
}

const linear = (angle, stops) => ({
  type: 'linear', angle, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, edge: 0,
  stops: stops.map(([position, color]) => ({ color, position })),
});
const radial = (centerX, centerY, stops, r = 72) => ({
  type: 'radial', angle: 0, centerX, centerY, radiusX: r, radiusY: r, edge: 0,
  stops: stops.map(([position, color]) => ({ color, position })),
});

/** Repaint one part of a component: what the tutorial's step 5 does in the Component Designer. */
function paint(control, partName, { colour, gradient }) {
  const fill = control._children.Parts._children[partName]._children.Background._children.Fill;
  if (colour) fill.colour = colour;
  if (gradient) {
    fill.gradientEnabled = true;
    fill.gradient = gradient;
    fill.gradientOpacity = 100;
  }
}

/**
 * The SH-201's knob: the same geometry as the draft's, repainted the way the instrument's is — a
 * black skirt, a brushed-silver cap lit from the top left, a black pointer line, dark ticks. Version
 * 1.1.0 of the same package, which is what the tutorial's "Save to library" makes of 1.0.0.
 */
function hardwareKnob() {
  const knob = gaiaKnob({ size: SKIN.knob });
  paint(knob, 'rim', { colour: 'FF1D1F21', gradient: linear(180, [[0, '4A4E52'], [55, '1E2023'], [100, '0C0D0E']]) });
  paint(knob, 'face', { colour: 'FFC9CCCF', gradient: radial(34, 28, [[0, 'F7F8F8'], [45, 'CDD0D3'], [100, '8C9297']]) });
  paint(knob, 'gloss', { colour: 'FFFFFFFF', gradient: linear(180, [[0, 'FFFFFF'], [100, 'E6E9EB']]) });
  paint(knob, 'pointer', { colour: 'FF151719' });
  for (const [name] of Object.entries(knob._children.Parts._children)) {
    if (name.startsWith('tick')) paint(knob, name, { colour: 'FF55595E' });
  }
  return knob;
}

/**
 * The SH-201's user arpeggio, as the GAIA panel's grid draws it: the two synths keep a pattern the
 * same way, sixteen notes of thirty-two steps. It opens on a figure inside a new patch's sixteen
 * steps, so nothing starts outside the loop; READ PATTERN replaces it with the synth's.
 */
function arpGrid() {
  return gaiaArpGrid({
    width: ARP_GRID.w, height: ARP_GRID.h, steps: 32,
    blocks: [
      { id: 'arp_seed_0', note: 60, step: 0, length: 1, velocity: 112 },
      { id: 'arp_seed_1', note: 63, step: 2, length: 1, velocity: 88 },
      { id: 'arp_seed_2', note: 67, step: 4, length: 1, velocity: 96 },
      { id: 'arp_seed_3', note: 70, step: 6, length: 1, velocity: 80 },
      { id: 'arp_seed_4', note: 72, step: 8, length: 2, velocity: 120 },
      { id: 'arp_seed_5', note: 67, step: 12, length: 1, velocity: 88 },
      { id: 'arp_seed_6', note: 63, step: 14, length: 2, velocity: 88 },
    ],
  });
}

const COMPONENTS = {
  knob: {
    name: 'SH-201 Knob',
    description: 'A rotary control for one SH-201 parameter. Its range, default and readout are set per copy.',
    versions: {
      '1.0.0': () => publish(gaiaKnob({ size: SKIN.knob }), { editable: RANGE_PROPERTIES }),
      '1.1.0': () => publish(hardwareKnob(), { editable: RANGE_PROPERTIES }),
    },
  },
  fader: {
    name: 'SH-201 Fader',
    description: 'A slider for an envelope stage or a level. Its range, default and readout are set per copy.',
    versions: { '1.0.0': () => publish(gaiaFader({ width: SKIN.faderW, height: SKIN.faderH, legacySkin: true }), { editable: RANGE_PROPERTIES }) },
  },
  switch: {
    name: 'SH-201 LED Switch',
    description: 'An on/off switch with a lamp for each setting, for one SH-201 switch parameter.',
    versions: { '1.0.0': () => publish(ledSwitch()) },
  },
  grid: {
    name: 'SH-201 Arpeggio Grid',
    description: 'The user arpeggio pattern: sixteen notes over thirty-two steps, read from and sent to the synth with READ PATTERN and SEND PATTERN.',
    versions: { '1.0.0': () => arpGrid() },
  },
};

/** Each component as the package a library holds — at the version a look uses. */
function buildPackages(versions) {
  const packages = {};
  for (const [key, spec] of Object.entries(COMPONENTS)) {
    const version = versions[key] ?? '1.0.0';
    const control = spec.versions[version]();
    control._children.Core.name = spec.name;
    // createControl stamps a time-based id; a fixed one keeps the library file byte-identical
    // between runs. A placed copy gets an id of its own either way.
    control._children.Core.id = `sh201_component_${key}`;
    const envelope = createCustomComponentExportEnvelope(control, {
      name: spec.name, version, author: 'CEditor', description: spec.description,
      category: 'Roland SH-201', license: 'AGPL-3.0', tags: ['sh-201', 'roland', key],
    });
    envelope.exportedAt = STAMP;
    packages[key] = envelope;
  }
  return packages;
}

/** The library entries diffCustomComponentAgainstSource reads, as the Library store keeps them. */
function libraryEntries(packages) {
  return Object.values(packages).map((envelope) => ({
    id: customComponentPackageId(envelope), version: envelope.metadata.version, fingerprint: envelope.fingerprint,
    savedAt: STAMP, component: envelope.component, envelope,
  }));
}

/* ------------------------------------------------------------------ bound controls */

function bindingFor(parameter, port) {
  return {
    kind: 'deviceParameter',
    port,
    deviceRole: DEVICE_NAME,
    parameterId: parameter.id,
    parameterType: parameter.type,
    adoptMetadata: true,
    dryRun: false,
    feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
  };
}

const handle = (parameter) => parameter.id.replace(/\./g, '_');
const whereItGoes = (parameter) => `${parameter.name} — ${parameter.address}`;

/** A linked copy of a library component, placed and bound: the per-copy settings, nothing else. */
function placeCopy(envelope, parameter, at) {
  const control = instantiateCustomComponentPackageControl(envelope, {
    id: nextId(parameter.id),
    name: handle(parameter),
    importedAt: STAMP,
    Transform: { x: at.x, y: at.y },
  });
  control._children.Core.tooltip = whereItGoes(parameter);
  control._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, debug: false, bindings: [bindingFor(parameter, 'value')] };

  const channel = control._children.ValueChannels._children.value;
  if (parameter.type === 'boolean') {
    const on = parameter.default === true ? 1 : 0;
    channel.defaultValue = on;
    channel.currentValue = on;
    return control;
  }
  channel.min = parameter.range.min;
  channel.max = parameter.range.max;
  channel.step = 1;
  channel.type = 'int';
  // BOTH: customChannelDefaultValue reads `currentValue ?? defaultValue`, and the factory stamped
  // currentValue already (the AN1x generator learned this the hard way).
  channel.defaultValue = parameter.default;
  channel.currentValue = parameter.default;
  const display = parameter.display ?? {};
  if (Number.isFinite(display.min) && Number.isFinite(display.max)) {
    channel.format = { ...channel.format, displayMin: display.min, displayMax: display.max };
  }
  if (display.unit) channel.format = { ...channel.format, unit: display.unit };
  if (Number.isFinite(display.precision)) channel.format = { ...channel.format, precision: display.precision };
  return control;
}

/**
 * The pattern: a linked copy of the grid, marked as the SH-201's (Designer.patternEditing, a per-copy
 * setting), so READ PATTERN and SEND PATTERN use the SH-201's 528 pattern parameters and seventeen
 * requests (utils/arpPatternLayouts.js). Its one binding is the Loop End Step port to Arpeggio End
 * Step, which also names the device those two talk to. The notes are not bindings: 528 parameters
 * behind one drawing go out together, when SEND PATTERN is pressed, not one per mouse move.
 */
function placeGrid(envelope, parameter, at) {
  const control = instantiateCustomComponentPackageControl(envelope, {
    id: nextId('arpeggio_pattern'),
    name: 'arpeggio_pattern',
    importedAt: STAMP,
    Transform: { x: at.x, y: at.y },
  });
  control._children.Core.tooltip = `The user arpeggio: Arpeggio Pattern 01–16, sixteen notes of 32 steps, sent with SEND PATTERN. Its END STEP is ${whereItGoes(parameter)}.`;
  control._children.Designer.patternEditing = { kind: 'sh201', mode: 'manual' };
  const binding = bindingFor(parameter, 'arpEndStep');
  // The port's range is the grid's steps already; End Step adopts nothing.
  binding.adoptMetadata = false;
  control._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, debug: false, bindings: [binding] };
  control._children.ValueChannels._children.arpEndStep.currentValue = parameter.default;
  return control;
}

/** A stock list for a named setting, its rows adopted from the profile's own choices. */
function placeCombo(parameter, at, w) {
  const control = createControl('Combobox', {
    Core: { id: nextId(parameter.id), name: handle(parameter), tooltip: whereItGoes(parameter) },
    Transform: { x: at.x, y: at.y, width: w, height: 22 },
    DeviceBindings: { bindings: [bindingFor(parameter, 'selectedChoice')] },
  });
  for (const [dotted, value] of Object.entries(parameterAdoptionPatches('Combobox', parameter))) setPath(control, dotted, value);
  setPath(control, 'Text.content', '');
  setPath(control, 'Text._children.Font.size', 10);
  setPath(control, 'Background._children.Corners.radius', 3);
  return control;
}

/** The patch name: a stock text box. The profile sends it as twelve characters, padded. */
function placeText(parameter, at, w) {
  const control = createControl('TextInput', {
    Core: { id: nextId(parameter.id), name: handle(parameter), tooltip: `${whereItGoes(parameter)}: twelve characters, sent when you press Enter or leave the box.` },
    Transform: { x: at.x, y: at.y, width: w, height: 24 },
    DeviceBindings: { bindings: [bindingFor(parameter, 'text')] },
  });
  for (const [dotted, value] of Object.entries(parameterAdoptionPatches('TextInput', parameter))) setPath(control, dotted, value);
  setPath(control, 'Behavior.defaultValue', parameter.default);
  setPath(control, 'Text.content', 'Patch name');
  setPath(control, 'Text._children.Font.size', 11);
  setPath(control, 'Background._children.Corners.radius', 3);
  return control;
}

/** A value that is typed rather than turned — a bank, a program, a channel: a stock number box. */
function placeNumber(parameter, at, w) {
  const control = createControl('Number', {
    Core: { id: nextId(parameter.id), name: handle(parameter), tooltip: whereItGoes(parameter) },
    Transform: { x: at.x, y: at.y, width: w, height: 24 },
    DeviceBindings: { bindings: [bindingFor(parameter, 'value')] },
  });
  for (const [dotted, value] of Object.entries(parameterAdoptionPatches('Number', parameter))) setPath(control, dotted, value);
  setPath(control, 'Behavior.defaultValue', parameter.default);
  setPath(control, 'Text._children.Font.size', 11);
  setPath(control, 'Background._children.Corners.radius', 3);
  return control;
}

const KINDS = {
  knob: (packages, parameter, item) => ({
    control: placeCopy(packages.knob, parameter, item),
    caption: { x: item.x - 14, y: item.y + SKIN.knob + 2, w: SKIN.knob + 28 },
  }),
  fader: (packages, parameter, item) => ({
    control: placeCopy(packages.fader, parameter, item),
    caption: { x: item.x - 10, y: item.y + SKIN.faderH + 2, w: SKIN.faderW + 20 },
  }),
  switch: (packages, parameter, item) => ({
    control: placeCopy(packages.switch, parameter, item),
    caption: { x: item.x, y: item.y - 14, w: 64 },
  }),
  combo: (packages, parameter, item) => ({
    control: placeCombo(parameter, item, item.w ?? 104),
    caption: { x: item.x, y: item.y - 14, w: item.w ?? 104, align: 'left' },
  }),
  grid: (packages, parameter, item) => ({
    control: placeGrid(packages.grid, parameter, item),
    caption: { x: item.x, y: item.y - 17, w: item.w, align: 'left' },
  }),
  text: (packages, parameter, item) => ({
    control: placeText(parameter, item, item.w ?? 176),
    caption: { x: item.x, y: item.y - 14, w: item.w ?? 176, align: 'left' },
  }),
  number: (packages, parameter, item) => ({
    control: placeNumber(parameter, item, item.w ?? 64),
    caption: { x: item.x, y: item.y - 14, w: item.w ?? 64, align: 'left' },
  }),
};

/* ------------------------------------------------------------------ the two looks */

/**
 * How a section, its title and its captions are drawn in each look. The draft keeps the GAIA
 * panel's dark boxes with a coloured tab; the hardware look is the SH-201's own: printed black
 * lettering on a silver signal path, white lettering on the black modulation row, no tabs.
 */
const LOOKS = {
  draft: {
    sections: SECTIONS,
    rows: SECTION_ROWS,
    patchSections: PATCH_SECTIONS,
    patchRows: PATCH_ROWS,
    systemSections: SYSTEM_SECTIONS,
    systemRows: SYSTEM_ROWS,
    skin: SKIN,
    versions: {},
    panelOut: 'CE/panels/Roland SH-201.cepanel',
    libraryOut: 'CE/panels/Roland SH-201 components.json',
    panelGuid: '6d1f3a52-0b7e-4c9a-a8f1-2e5b7c4d9a10',
    scriptId: 'roland_sh201',
    description: 'Roland SH-201 — Upper and Lower tones, patch, arpeggiator, effects and system settings, first draft: library components, one binding per control, sections as containers',
    sectionStyle: (spec) => ({
      fill: SKIN.sectionFill, border: { enabled: true, thickness: 1.5, colour: spec.tint }, radius: 6,
      title: { colour: SKIN.tabText, fill: spec.tint, size: 10 }, caption: SKIN.caption, captionBold: false,
    }),
    plate: { fill: '00000000', border: { enabled: false, thickness: 0 } },
    tone: { title: SKIN.toneLit, caption: SKIN.caption },
  },
  hardware: {
    sections: HARDWARE_SECTIONS,
    rows: HARDWARE_ROWS,
    patchSections: HARDWARE_PATCH_SECTIONS,
    patchRows: PATCH_ROWS,
    systemSections: HARDWARE_SYSTEM_SECTIONS,
    systemRows: SYSTEM_ROWS,
    skin: HARDWARE_SKIN,
    versions: { knob: '1.1.0' },
    panelOut: 'CE/panels/Roland SH-201 (hardware look).cepanel',
    libraryOut: 'CE/panels/Roland SH-201 (hardware look) components.json',
    panelGuid: '9b4e7c21-5d3a-4f88-b0c6-1a2f6e8d3c55',
    scriptId: 'roland_sh201_hardware',
    description: 'Roland SH-201 — Upper and Lower tones, patch, arpeggiator, effects and system settings in the instrument\'s own look: the answer to the draft\'s tutorial',
    sectionStyle: (spec) => (spec.surface === 'silver'
      ? { fill: HARDWARE_SKIN.silver, overlay: METAL_OVERLAY, border: { enabled: false, thickness: 0, colour: '00000000' }, radius: 3,
        title: { colour: HARDWARE_SKIN.onSilver, fill: '00000000', size: 12 }, caption: HARDWARE_SKIN.onSilver, captionBold: true }
      : { fill: HARDWARE_SKIN.black, border: { enabled: true, thickness: 1, colour: HARDWARE_SKIN.blackEdge }, radius: 3,
        title: { colour: HARDWARE_SKIN.onBlack, fill: '00000000', size: 12 }, caption: HARDWARE_SKIN.onBlack, captionBold: true }),
    plate: { fill: HARDWARE_SKIN.plate, border: { enabled: true, thickness: 1, colour: HARDWARE_SKIN.plateEdge } },
    tone: { title: HARDWARE_SKIN.onBlack, caption: HARDWARE_SKIN.onBlack },
  },
};

/* ------------------------------------------------------------------ sections as containers */

/** A container with the section's name, its title, and its controls inside it. */
function section(spec, at, ctx) {
  const style = ctx.look.sectionStyle(spec);
  const group = createControl('Group', {
    Core: { id: nextId(`section_${spec.title}`), name: spec.title, tooltip: spec.about },
    Transform: { x: at.x, y: at.y, width: spec.w, height: spec.h },
    Background: {
      _children: {
        Fill: { colour: style.fill, ...(style.overlay ?? {}) },
        Border: style.border,
        Corners: { radius: style.radius },
      },
    },
    Text: { content: '' },
  });
  const children = {};
  const add = (control) => { children[control._children.Core.id] = control; };

  const tab = label(spec.title, { x: 2, y: 2, w: Math.max(56, spec.title.length * 8 + 20), h: 17 },
    { size: style.title.size, bold: true, colour: style.title.colour, align: style.title.fill === '00000000' ? 'left' : 'center', name: `${spec.title} title` });
  tab._children.Background._children.Fill.colour = style.title.fill;
  tab._children.Background._children.Corners = { radius: 4 };
  add(tab);

  for (const item of spec.items) {
    // layout.mjs names the Upper tone's parameters; the Lower tone's are the same, renamed.
    const id = ctx.tone ? item.p.replace(/^upper\./, `${ctx.tone}.`) : item.p;
    const parameter = ctx.byId.get(id);
    if (!parameter) { ctx.missing.push(id); continue; }
    const built = KINDS[item.kind](ctx.packages, parameter, item);
    add(built.control);
    add(label(item.label, built.caption, {
      align: built.caption.align ?? 'center', colour: style.caption, bold: style.captionBold, name: item.captionName ?? `${handle(parameter)} caption`,
    }));
  }

  group._children.Children = { ...group._children.Children, _children: children };
  return group;
}

/**
 * The two tones of a patch, both on the panel at once: Upper above Lower. The instrument shows one
 * set of knobs and a button to say which tone they edit; an editor has the room to show both, and
 * then nothing about what a knob sends depends on what else is pressed.
 *
 * Not a State per tone: a State changes how a control looks, and the MIDI path never reads it, so a
 * button whose State "switched" the tone would light up and leave every knob sending the Upper
 * tone. Two sets of controls, each bound once, is what editing two tones is.
 */
const TONES = [
  { id: 'upper', name: 'Upper', title: 'UPPER' },
  { id: 'lower', name: 'Lower', title: 'LOWER' },
];
const TONE_TITLE = 22;

/**
 * Keyboard Part: which tone the SH-201's keys play, what its UPPER and LOWER buttons set. With both
 * tones on the panel it says what you hear, not what the knobs edit. Its rows are the profile's
 * choices, adopted as every named list's are.
 */
function keyboardPart(parameter, look, at) {
  const control = createControl('RadioButtonGroup', {
    Core: { id: nextId(parameter.id), name: handle(parameter), tooltip: `${parameter.name} — ${parameter.address}: which tone the keyboard plays. Both tones are edited here at once.` },
    Transform: { x: at.x, y: at.y, width: at.w, height: 34 },
    DeviceBindings: { bindings: [bindingFor(parameter, 'selectedChoice')] },
  });
  for (const [dotted, value] of Object.entries(parameterAdoptionPatches('RadioButtonGroup', parameter))) setPath(control, dotted, value);
  setPath(control, 'Text.content', '');
  setPath(control, 'Behavior.visualStyle', 'segmented');
  // The two buttons are the control; the box around them would be the theme's surface colour.
  setPath(control, 'Background._children.Fill.solidEnabled', false);
  setPath(control, 'Background._children.Border.enabled', false);
  setPath(control, 'Text._children.Font.size', 10);
  setPath(control, 'Text._children.Fill.colour', look.tone.caption);
  return [
    label('KEYBOARD', { x: at.x - 84, y: at.y + 10, w: 78, h: 14 }, { size: 9, bold: true, colour: look.tone.caption, align: 'right', name: 'keyboard part caption' }),
    control,
  ];
}

/** The header: the maker and the model. The hardware look prints them as the instrument does. */
function header(look) {
  const skin = look.skin;
  if (look === LOOKS.hardware) {
    const model = label('SH-201', { x: PANEL.inset + 96, y: 6, w: 130, h: 30 }, { size: 26, bold: true, colour: skin.model, align: 'left', name: 'model' });
    model._children.Text._children.Font.style = 'Italic';
    const kind = label('SYNTHESIZER', { x: PANEL.inset + 100, y: 35, w: 120, h: 11 }, { size: 8, bold: true, colour: skin.model, align: 'left', name: 'synthesizer' });
    kind._children.Text._children.Font.style = 'Italic';
    return [
      label('Roland', { x: PANEL.inset, y: 12, w: 92, h: 24 }, { size: 20, colour: skin.brand, align: 'left', name: 'brand' }),
      model,
      kind,
    ];
  }
  return [
    label('ROLAND', { x: PANEL.inset, y: 14, w: 90, h: 22 }, { size: 15, bold: true, colour: skin.brand, align: 'left', name: 'brand' }),
    label('SH-201', { x: PANEL.inset + 92, y: 10, w: 120, h: 28 }, { size: 22, bold: true, colour: skin.model, align: 'left', name: 'model' }),
  ];
}

/** The red signal path the instrument prints: arrows between the silver sections, a line under the black row. */
function signalFlow(rowsAt, look) {
  const out = [];
  for (const { row, y, gaps } of rowsAt) {
    if (!row.flow) continue;
    gaps.forEach((gapX, i) => {
      out.push(label('▶', { x: gapX - 1, y: y + row.h / 2 - 8, w: 12, h: 16 }, { size: 11, colour: look.skin.flow, name: `signal flow ${i + 1}` }));
    });
  }
  const last = rowsAt[rowsAt.length - 1];
  const lineY = last.y + last.row.h + 5;
  out.push(createControl('Background', {
    Core: { id: nextId('signal_flow_line'), name: 'signal flow line' },
    Transform: { x: PANEL.inset, y: lineY, width: PANEL.width - PANEL.inset * 2 - 12, height: 2 },
    Background: { _children: { Fill: { colour: look.skin.flow }, Border: { enabled: false, thickness: 0 }, Corners: { radius: 1 } } },
  }));
  out.push(label('▶', { x: PANEL.width - PANEL.inset - 14, y: lineY - 7, w: 12, h: 16 }, { size: 11, colour: look.skin.flow, name: 'signal flow end' }));
  return out;
}

/* ------------------------------------------------------------------ notes */

const ABOUT = `Roland SH-201 — first draft: the Upper and Lower tones, the patch, the arpeggiator, the effects and the system settings.

How to read it in the editor:
- Component tree: Upper and Lower › OSC 1, OSC 2, Mix/Mod, LFO 1, LFO 2, Pitch Env, Filter, Amp, Performance, Effects. The containers are the hardware's sections, and each tone has all of them. Then Patch › Patch, Controllers, Arpeggio, Delay, Reverb, Pattern: what the two tones share, once. Last, System › Master, Tempo, Patch Select, MIDI, Pedal & D Beam, Recorder: the instrument's own settings, which stay in the synth whichever patch plays.
- Both tones are on the panel at once, Upper above Lower, each control bound to its own tone's parameter.
- Select a knob: Device Bindings shows the one profile parameter it sends; its tooltip names it and its address. The Source card names the library package (SH-201 Knob, Fader, LED Switch or Arpeggio Grid), and "Update N other copies" finds every copy, in both tones and the patch.
- A copy's range, default and readout are published settings of the component (Public API), so Coarse Tune (sent 28..100, read -36..+36) and Cutoff (0..127) are the same knob.
- KEYBOARD, in the header, is the synth's Keyboard Part: which tone its keys play, what its UPPER and LOWER buttons set. It changes what you hear, not what the knobs edit; when the synth's own buttons are pressed it follows.
- Why two sets of controls and not a State: a State changes how a control looks, and nothing on the MIDI path reads it. Editing two tones is two knobs, each bound once.
- PATTERN is the synth's user arpeggio: sixteen notes over thirty-two steps, the 528 parameters of Arpeggio Pattern 01–16. In Preview, draw notes on it; SEND PATTERN writes them and the END STEP to the synth, and READ PATTERN reads the synth's back. It is a linked copy too, with one binding: its Loop End Step port to Arpeggio End Step, which is also the device READ and SEND talk to. Its Device tab's Synth says SH-201: that is what makes the grid use the SH-201's parameters and not the GAIA's. Everything else in Patch sends as you move it.
- The patch name, and the bank, program and channel numbers in System, are stock controls, a text box and number boxes: they are typed, not turned. A new bank or program number can select another patch on the synth, so edits not yet written there are lost.
- MIDI › TX EDIT on makes the synth send each edit made on its own panel, so this panel can follow its knobs.
- No scripts.

No hardware needed: choose Simulated device as the device's output (Settings → MIDI). It answers from the profile.

Connected, the editor offers to read the synth when this panel is open: the whole patch, then the system settings, so every control shows what the synth holds. Reading changes nothing on the synth. The pattern grid reads its own, with READ PATTERN.

The library: Roland SH-201 components.json, beside this file. Import it (Library → Package & Library → Import) if the Source card says "Not in this library". A copy of this panel passed on with File → Share Panel carries the library with it.

Left out on purpose: the twelve Patch Name characters one by one (the name box sends them), the hold pedal and the All Notes Off, All Sounds Off and Reset All Controllers messages, which are performed rather than set, and the dump requests, which the editor sends itself.`;

const tutorial = (knobs) => `Tutorial 1 — from this look to the SH-201's own

The answer is beside this file: Roland SH-201 (hardware look).cepanel, with its own library file. Open it in a second tab to compare as you go. Save this one under a new name first (File → Save As), so the draft stays as it is.

You need a photo of the instrument. Use your own: a photo from Roland or from the web is not ours to put in a panel.

1. The reference. Show the dock (Ctrl+J), open Viewer and add your photo. Its eyedropper saves a colour to your swatches: take the silver of the OSC panel, the black of the envelope panels, the body, and the red of a lamp. Or type them: silver CBCCC7, panel black 1E1F21, body 121314, red D9402B.

2. The body. Click an empty part of the canvas, so the panel itself is selected, and set its background to the body colour. Select Upper, Lower, Patch and System in the component tree (Ctrl+click) and give them a fill a shade lighter (1B1C1E) and a thin dark border: on the instrument the controls sit on a plate.

3. The silver row and the black row. On the SH-201 the signal path is silver — OSC 1, OSC 2, MIX/MOD, FILTER, AMP — and everything else is black. Ctrl+click those five in the component tree, then on the Background tab set the fill to silver and switch the border off: with several controls selected, the Background tab changes all of them. Then select the others and make them black, with a thin grey border.

A flat silver reads as grey plastic; the instrument's is brushed aluminium. Give the silver sections a transparent metallic overlay: select OSC 1, and on the Background tab turn on the Overlay layer and press its ... button to choose a brushed-metal texture (Roland SH-201 brushed metal.png, beside this file, or your own). Set its Blend to Overlay and its Opacity to about 60: Overlay lightens and darkens the silver without changing its colour. Press C on the layer to copy it, select the other silver sections, turn on their Overlay layer and press P: the layer is pasted on all of them.

4. Lettering. The instrument prints black on silver and white on black, and puts no tabs behind its section names. Double-click a section to reach its title (Esc goes back up), clear the title's fill, and set its text black and bold in the dock's Text tool. Select a section's captions in the component tree (Ctrl+click, or Shift+click for a range) and make them black and bold too. On the black sections, white.

5. The knob, once for all ${knobs} of them. Select any knob and press Component Designer on the canvas. Select the part called face and give it a silver radial gradient, light at the top left (the Gradient tool); make rim almost black, and pointer and the ticks dark. Press Back to Panel. The knob's Source card now says it has edits of its own: press Save to library as 1.1.0… and then Save. Then press Update ${knobs - 1} other copies — every knob on the panel is the new one, each keeping its own range, default and readout, because those are the copy's settings, not the component's.

6. The sections the instrument has. The SH-201 has FILTER ENV and AMP ENV as sections of their own. In FILTER, select the four envelope faders and their captions, press Ctrl+G to put them in a new container, and name it FILTER ENV on its Core tab; the same for AMP ENV. On the instrument the filter envelope's DEPTH is a slider too: delete the ENV DEPTH knob, place an SH-201 Fader from the dock's Library into FILTER ENV, and with it selected click Filter Env Depth, in the Upper Filter Env group, in the dock's Device tab. Then drag the sections into the instrument's order: the silver five and EFFECTS on top; PITCH ENV, LFO 1, LFO 2, FILTER ENV, AMP ENV and PERFORMANCE below. A control dragged onto a container goes inside it; hold Space while dragging to stop that.

7. The name. Roland in white, not bold. SH-201 larger, bold and italic (the Text tool's Italic button), and a small italic SYNTHESIZER under it (Insert → Layout & Display → Label).

8. The signal path. The instrument draws it in red: Insert → Layout & Display → Background, 2 pixels high, red, under the black row; and a ▶ label in each gap between the silver sections.

Steps 3, 4, 6 and 8 are for one tone. Do them on Upper, then again on Lower, below it; in step 3 you can Ctrl+click the silver sections of both tones at once. Copy Style (Ctrl+Alt+C) on an Upper section or caption and Paste Style (Ctrl+Alt+V) on its Lower twins saves most of the clicking. Patch and System, under both, need steps 3 and 4 once: all their sections are black. Step 5 needs no second round: the Lower tone's knobs, the patch's and the system's are copies of the same package, and Update takes them too.

What stays: the LED switches are already the instrument's red lamps, the faders its black slots, and the named lists stay lists — on the SH-201 they are rows of lamps, which is a tutorial of its own.`;

const hardwareAbout = (bound) => `Roland SH-201 — the Upper and Lower tones, the arpeggiator and the effects, in the instrument's own look.

This is the answer to Tutorial 1 in Roland SH-201.cepanel's notepad: the same ${bound} bound controls, bindings and library components, repainted and arranged as the SH-201 is.

- The silver signal path — OSC 1, OSC 2, MIX/MOD, FILTER, AMP — and the black modulation row: PITCH ENV, LFO 1, LFO 2, FILTER ENV, AMP ENV, with EFFECTS and PERFORMANCE on the black body. Both tones, Upper above Lower, each on its plate.
- PATCH, under both: the patch's settings and CONTROLLERS, ARPEGGIO, DELAY, REVERB and the PATTERN grid, on black. READ PATTERN and SEND PATTERN on the grid move the user arpeggio to and from the synth.
- SYSTEM, last: the instrument's own settings, on black.
- KEYBOARD, in the header, is the synth's Keyboard Part: which tone its keys play.
- The silver sections carry a transparent metallic overlay: Roland SH-201 brushed metal.png, tiled over the fill with the Overlay blend at 60%. It is in the file, so the panel needs nothing beside it.
- Every knob is SH-201 Knob 1.1.0, the silver one: select any knob and its Source card says so. The faders and LED switches are still 1.0.0; they already look like the instrument's.
- FILTER ENV and AMP ENV are sections of their own, and the filter envelope's DEPTH is a fader, as on the instrument.

The library for this file is Roland SH-201 (hardware look) components.json, beside it.

No hardware needed: choose Simulated device as the device's output (Settings → MIDI).`;

/* ------------------------------------------------------------------ the panel */

/**
 * The plates the panel is made of, top to bottom: the two tones, what they share, and the
 * instrument's own settings. A tone's sections are the look's; the patch's and the system's are
 * their own, and carry no signal path.
 */
function platesOf(look) {
  return [
    ...TONES.map((tone) => ({
      ...tone, tone: tone.id, rows: look.rows, sections: look.sections, flow: true,
      tooltip: `The ${tone.name} tone. The other tone has the same sections.`,
    })),
    {
      id: 'patch', name: 'Patch', title: 'PATCH', rows: look.patchRows, sections: look.patchSections, flow: false,
      tooltip: 'What the two tones share: the patch\'s settings and controllers, the arpeggiator and its pattern, the delay and the reverb.',
    },
    {
      id: 'system', name: 'System', title: 'SYSTEM', rows: look.systemRows, sections: look.systemSections, flow: false,
      tooltip: 'The instrument\'s own settings, System Common: kept in the synth, not in the patch, so they apply whichever patch plays.',
    },
  ];
}

/** One plate: its name, then its rows of sections, in a container named after it. */
function buildPlate(plate, at, ctx) {
  const children = {};
  const rowsAt = [];
  const title = label(plate.title, { x: PANEL.inset, y: 4, w: 120, h: 16 }, { size: 11, bold: true, colour: ctx.look.tone.title, align: 'left', name: `${plate.name} title` });
  title._children.Text._children.Font.letterSpacing = 1.5;
  children[title._children.Core.id] = title;
  let y = TONE_TITLE + 4;
  for (const row of plate.rows) {
    let x = PANEL.inset;
    const gaps = [];
    row.sections.forEach((key, index) => {
      const spec = plate.sections[key];
      const group = section(spec, { x, y }, ctx);
      children[group._children.Core.id] = group;
      x += spec.w + PANEL.gap;
      if (index < row.sections.length - 1) gaps.push(x - PANEL.gap);
    });
    rowsAt.push({ row, y, gaps });
    y += row.h + PANEL.gap;
  }
  if (plate.flow && ctx.look === LOOKS.hardware) {
    for (const control of signalFlow(rowsAt, ctx.look)) children[control._children.Core.id] = control;
    y += 6;
  }

  const group = createControl('Group', {
    Core: { id: `sh201_${plate.id}`, name: plate.name, tooltip: plate.tooltip },
    Transform: { x: at.x, y: at.y, width: at.w, height: y + PANEL.inset },
    Background: { _children: { Fill: { colour: ctx.look.plate.fill }, Border: ctx.look.plate.border, Corners: { radius: 4 } } },
    Text: { content: '' },
  });
  group._children.Children = { ...group._children.Children, _children: children };
  return group;
}

export function buildSh201Panel(lookName = 'draft') {
  const look = LOOKS[lookName];
  if (!look) throw new Error(`No look called ${lookName}`);
  const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  seq = 0;

  const packages = buildPackages(look.versions);
  const ctx = { byId, packages, missing: [], look };

  const width = PANEL.width - (lookName === 'hardware' ? 12 : 0);
  const left = lookName === 'hardware' ? 6 : 0;
  const plates = [];
  let top = PANEL.upperTop;
  for (const plate of platesOf(look)) {
    const group = buildPlate(plate, { x: left, y: top, w: width }, { ...ctx, tone: plate.tone ?? null });
    plates.push(group);
    top += group._children.Transform.height + PANEL.gap;
  }
  if (ctx.missing.length) throw new Error(`layout.mjs places parameters the SH-201 profile does not have:\n  ${ctx.missing.join('\n  ')}`);

  const controls = [...header(look), ...keyboardPart(byId.get('patch.keyboardPart'), look, { x: 420, y: 9, w: 190 }), ...plates];

  const panel = createPanel('Roland SH-201');
  panel.controlSet = { id: DEFAULT_CONTROL_SET_ID };
  panel.controls = controls;
  panel.width = PANEL.width;
  panel.height = top - PANEL.gap + (lookName === 'hardware' ? 8 : 0);
  panel.bgColour = look.skin.panelBg;
  panel.gridEnabled = false;
  panel.snapToGrid = false;
  panel.description = look.description;
  panel.requiredProfiles = [{ role: DEVICE_NAME, profileId: profile.id, version: '*' }];
  const knobs = flatControls(controls).filter((c) => c._children?.Designer?.packageName === COMPONENTS.knob.name).length;
  const bound = flatControls(controls).filter((c) => (c._children?.DeviceBindings?.bindings ?? []).length).length;
  panel.notepad = lookName === 'hardware'
    ? { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: hardwareAbout(bound) }] }
    : { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: ABOUT }, { name: 'Tutorial 1 — the SH-201\'s own look', content: tutorial(knobs) }] };
  panel.panelGuid = look.panelGuid;
  panel.scriptId = look.scriptId;
  panel.filePath = null;

  // Every copy is the package it came from, plus its own settings. If one ever counts as edited,
  // the "linked copies" this panel exists to show are not linked, and the build says so.
  const entries = libraryEntries(packages);
  const edited = [];
  for (const control of flatControls(controls)) {
    if (control._children?.Core?.controlType !== 'CustomComponent') continue;
    const report = diffCustomComponentAgainstSource(control, entries);
    if (report.status !== 'current') edited.push(`${control._children.Core.name}: ${report.status} (${report.design.map((d) => d.path).join(', ')})`);
  }
  if (edited.length) throw new Error(`copies that are not clean copies of their package:\n  ${edited.join('\n  ')}`);

  return { panel, library: createCustomComponentLibraryEnvelope(Object.values(packages)) };
}

export function serializeSh201(lookName = 'draft') {
  const { panel, library } = buildSh201Panel(lookName);
  library.exportedAt = STAMP;
  return { panel: `${serializePanel(panel)}\n`, library: `${JSON.stringify(library, null, 2)}\n` };
}

export const OUTPUTS = Object.fromEntries(Object.entries(LOOKS).map(([name, look]) => [name, {
  panel: path.join(REPO, look.panelOut), library: path.join(REPO, look.libraryOut),
}]));

function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [name, out] of Object.entries(OUTPUTS)) {
    const { panel, library } = serializeSh201(name);
    for (const [file, text] of [[out.panel, panel], [out.library, library]]) {
      if (check) {
        let current = null;
        try { current = readFileSync(file, 'utf8'); } catch { /* missing counts as stale */ }
        if (current !== text) stale.push(file);
        continue;
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    if (!check) {
      const doc = JSON.parse(panel);
      console.log(`Wrote ${path.relative(REPO, out.panel)} (${doc.width}x${doc.height}, ${(panel.length / 1024).toFixed(0)} KB) and its library`);
    }
  }
  const texture = path.join(REPO, METAL_TEXTURE_OUT);
  if (check) {
    let current = null;
    try { current = readFileSync(texture); } catch { /* missing counts as stale */ }
    if (!current || !current.equals(brushedMetalPng())) stale.push(texture);
  } else {
    writeFileSync(texture, brushedMetalPng());
    console.log(`Wrote ${METAL_TEXTURE_OUT}`);
  }
  if (!check) return;
  if (!stale.length) { console.log('SH-201 panels and libraries are up to date.'); return; }
  for (const file of stale) console.error(`Stale: ${path.relative(REPO, file)} — run: node tools/scripts/sh201-panel/make-sh201-panel.mjs`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
