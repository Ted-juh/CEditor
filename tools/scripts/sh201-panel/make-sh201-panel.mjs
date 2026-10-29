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
//   - Three library components — the SH-201 knob, fader and LED switch — placed as LINKED copies.
//     Select any knob and its Source card names the package; "Update N other copies" finds the
//     others. A copy's range, default and readout are published as editable properties, so a knob
//     bound to Coarse Tune (28..100, read -36..+36) and one bound to Cutoff (0..127) are the same
//     component with different settings, not two edited copies.
//   - One binding per control, the same one the Device tab makes: select a control and its Device
//     Bindings section shows exactly which profile parameter it sends.
//   - Containers named after the hardware's sections (Upper › OSC 1, Filter, Amp …), so the
//     component tree reads like the front panel.
//   - A State on the tone-select button, the way the hardware lights the tone it is editing.
//   - No scripts.
//
// THE FIRST VERSION ONLY. After it, the .cepanel file is the source and is edited in CEditor; this
// generator is kept as the record of how the draft was made and to rebuild it while the draft is
// still being shaped. It covers the Upper tone; the Lower tone, the effects and the arpeggiator
// come after the owner has judged this one in the editor.
//
// The library file goes beside the panel. The library lives inside CEditor rather than in the
// panel, and File → Share Panel does not carry it: a copy keeps its whole design and works anywhere,
// but on a machine without the package its Source card says "Not in this library". Importing the
// library file (Library → Package & Library → Import) restores the link.

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
import { gaiaFader, gaiaKnob, gaiaLeds } from '../gaia-panel/components.mjs';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import {
  SECTIONS, SECTION_ROWS, PANEL, SKIN, HARDWARE_SECTIONS, HARDWARE_ROWS, HARDWARE_SKIN,
} from './layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROFILE = path.join(REPO, 'CE/profiles/test/roland-sh-201.ceditor-device.json');

/** The device name every binding carries — a name a person would give the instrument. */
export const DEVICE_NAME = 'Roland SH-201';

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
    skin: SKIN,
    versions: {},
    panelOut: 'CE/panels/Roland SH-201.cepanel',
    libraryOut: 'CE/panels/Roland SH-201 components.json',
    panelGuid: '6d1f3a52-0b7e-4c9a-a8f1-2e5b7c4d9a10',
    scriptId: 'roland_sh201',
    description: 'Roland SH-201 — Upper tone, first draft: library components, one binding per control, sections as containers',
    sectionStyle: (spec) => ({
      fill: SKIN.sectionFill, border: { enabled: true, thickness: 1.5, colour: spec.tint }, radius: 6,
      title: { colour: SKIN.tabText, fill: spec.tint, size: 10 }, caption: SKIN.caption, captionBold: false,
    }),
    plate: { fill: '00000000', border: { enabled: false, thickness: 0 } },
  },
  hardware: {
    sections: HARDWARE_SECTIONS,
    rows: HARDWARE_ROWS,
    skin: HARDWARE_SKIN,
    versions: { knob: '1.1.0' },
    panelOut: 'CE/panels/Roland SH-201 (hardware look).cepanel',
    libraryOut: 'CE/panels/Roland SH-201 (hardware look) components.json',
    panelGuid: '9b4e7c21-5d3a-4f88-b0c6-1a2f6e8d3c55',
    scriptId: 'roland_sh201_hardware',
    description: 'Roland SH-201 — Upper tone in the instrument\'s own look: the answer to the draft\'s tutorial',
    sectionStyle: (spec) => (spec.surface === 'silver'
      ? { fill: HARDWARE_SKIN.silver, border: { enabled: false, thickness: 0, colour: '00000000' }, radius: 3,
        title: { colour: HARDWARE_SKIN.onSilver, fill: '00000000', size: 12 }, caption: HARDWARE_SKIN.onSilver, captionBold: true }
      : { fill: HARDWARE_SKIN.black, border: { enabled: true, thickness: 1, colour: HARDWARE_SKIN.blackEdge }, radius: 3,
        title: { colour: HARDWARE_SKIN.onBlack, fill: '00000000', size: 12 }, caption: HARDWARE_SKIN.onBlack, captionBold: true }),
    plate: { fill: HARDWARE_SKIN.plate, border: { enabled: true, thickness: 1, colour: HARDWARE_SKIN.plateEdge } },
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
        Fill: { colour: style.fill },
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
    const parameter = ctx.byId.get(item.p);
    if (!parameter) { ctx.missing.push(item.p); continue; }
    const built = KINDS[item.kind](ctx.packages, parameter, item);
    add(built.control);
    add(label(item.label, built.caption, {
      align: built.caption.align ?? 'center', colour: style.caption, bold: style.captionBold, name: `${handle(parameter)} caption`,
    }));
  }

  group._children.Children = { ...group._children.Children, _children: children };
  return group;
}

/** The tone-select button and its State: lit for the tone the panel's controls edit. */
function toneSelect(at, skin) {
  const button = createControl('ToggleButton', {
    Core: { id: 'sh201_tone_upper', name: 'Tone Upper', tooltip: 'The tone these controls edit. The SH-201 edits one tone at a time.' },
    Transform: { x: at.x, y: at.y, width: 74, height: 24 },
    Text: { content: 'UPPER', _children: { Font: { size: 10, bold: true, weight: 'Bold', weightValue: 700, letterSpacing: 1 } } },
    Behavior: { defaultValue: true },
    Background: { _children: { Fill: { colour: skin.buttonOff }, Corners: { radius: 4 } } },
  });
  button._children.States._children.Editing = {
    _type: 'State',
    name: 'Editing',
    group: 'logical',
    description: 'Lit like the hardware\'s tone lamp while this is the tone being edited.',
    enabled: true,
    when: { checked: true },
    patches: {
      component: {
        'Background.Fill.colour': skin.toneLit,
        'Text.Fill.colour': skin.tabText,
      },
      parts: {},
    },
  };
  return button;
}

/** The header: the maker and the model, the tone select. The hardware look prints them as the instrument does. */
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
      label('TONE', { x: 330, y: 19, w: 44, h: 14 }, { size: 9, bold: true, colour: skin.onBlack, align: 'right', name: 'tone caption' }),
      toneSelect({ x: 380, y: 14 }, skin),
      label('LOWER — not in this draft', { x: 462, y: 19, w: 170, h: 14 }, { size: 9, colour: skin.dim, align: 'left', name: 'lower note' }),
    ];
  }
  return [
    label('ROLAND', { x: PANEL.inset, y: 14, w: 90, h: 22 }, { size: 15, bold: true, colour: skin.brand, align: 'left', name: 'brand' }),
    label('SH-201', { x: PANEL.inset + 92, y: 10, w: 120, h: 28 }, { size: 22, bold: true, colour: skin.model, align: 'left', name: 'model' }),
    label('TONE', { x: 330, y: 19, w: 44, h: 14 }, { size: 9, colour: skin.caption, align: 'right', name: 'tone caption' }),
    toneSelect({ x: 380, y: 14 }, skin),
    label('LOWER — not in this draft', { x: 462, y: 19, w: 170, h: 14 }, { size: 9, colour: skin.dim, align: 'left', name: 'lower note' }),
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

const ABOUT = `Roland SH-201 — first draft, Upper tone only.

How to read it in the editor:
- Component tree: Upper › OSC 1, OSC 2, Mix/Mod, LFO 1, LFO 2, Pitch Env, Filter, Amp, Performance, Effects. The containers are the hardware's sections.
- Select a knob: Device Bindings shows the one profile parameter it sends; its tooltip names it and its address. The Source card names the library package (SH-201 Knob, Fader or LED Switch), and "Update N copies on panel" finds every copy.
- A copy's range, default and readout are published settings of the component (Public API), so Coarse Tune (sent 28..100, read -36..+36) and Cutoff (0..127) are the same knob.
- The UPPER button has a State, Editing, on its States tab: it lights the tone being edited, as the hardware does.
- No scripts.

No hardware needed: choose Simulated device as the device's output (Settings → MIDI). It answers from the profile.

The library: Roland SH-201 components.json, beside this file. Import it (Library → Package & Library → Import) if the Source card says "Not in this library".

Not built yet: the Lower tone (and how Upper/Lower switch), the effects, the arpeggiator, the system settings.`;

const tutorial = (knobs) => `Tutorial 1 — from this look to the SH-201's own

The answer is beside this file: Roland SH-201 (hardware look).cepanel, with its own library file. Open it in a second tab to compare as you go. Save this one under a new name first (File → Save As), so the draft stays as it is.

You need a photo of the instrument. Use your own: a photo from Roland or from the web is not ours to put in a panel.

1. The reference. Show the dock (Ctrl+J), open Viewer and add your photo. Its eyedropper saves a colour to your swatches: take the silver of the OSC panel, the black of the envelope panels, the body, and the red of a lamp. Or type them: silver CBCCC7, panel black 1E1F21, body 121314, red D9402B.

2. The body. Click an empty part of the canvas, so the panel itself is selected, and set its background to the body colour. Select Upper in the component tree and give it a fill a shade lighter (1B1C1E) and a thin dark border: on the instrument the controls sit on a plate.

3. The silver row and the black row. On the SH-201 the signal path is silver — OSC 1, OSC 2, MIX/MOD, FILTER, AMP — and everything else is black. Ctrl+click those five in the component tree, then on the Background tab set the fill to silver and switch the border off: with several controls selected, the Background tab changes all of them. Then select the others and make them black, with a thin grey border.

4. Lettering. The instrument prints black on silver and white on black, and puts no tabs behind its section names. Double-click a section to reach its title (Esc goes back up), clear the title's fill, and set its text black and bold in the dock's Text tool. Select a section's captions in the component tree (Ctrl+click, or Shift+click for a range) and make them black and bold too. On the black sections, white.

5. The knob, once for all ${knobs} of them. Select any knob and press Component Designer on the canvas. Select the part called face and give it a silver radial gradient, light at the top left (the Gradient tool); make rim almost black, and pointer and the ticks dark. Press Back to Panel. The knob's Source card now says it has edits of its own: press Save to library as 1.1.0… and then Save. Then press Update ${knobs - 1} other copies — every knob on the panel is the new one, each keeping its own range, default and readout, because those are the copy's settings, not the component's.

6. The sections the instrument has. The SH-201 has FILTER ENV and AMP ENV as sections of their own. In FILTER, select the four envelope faders and their captions, press Ctrl+G to put them in a new container, and name it FILTER ENV on its Core tab; the same for AMP ENV. On the instrument the filter envelope's DEPTH is a slider too: delete the ENV DEPTH knob, place an SH-201 Fader from the dock's Library into FILTER ENV, and with it selected click Upper Filter Env Depth in the dock's Device tab. Then drag the sections into the instrument's order: the silver five and EFFECTS on top; PITCH ENV, LFO 1, LFO 2, FILTER ENV, AMP ENV and PERFORMANCE below. A control dragged onto a container goes inside it; hold Space while dragging to stop that.

7. The name. Roland in white, not bold. SH-201 larger, bold and italic (the Text tool's Italic button), and a small italic SYNTHESIZER under it (Insert → Layout & Display → Label).

8. The signal path. The instrument draws it in red: Insert → Layout & Display → Background, 2 pixels high, red, under the black row; and a ▶ label in each gap between the silver sections.

What stays: the LED switches are already the instrument's red lamps, the faders its black slots, and the named lists stay lists — on the SH-201 they are rows of lamps, which is a tutorial of its own.`;

const HARDWARE_ABOUT = `Roland SH-201 — Upper tone, in the instrument's own look.

This is the answer to Tutorial 1 in Roland SH-201.cepanel's notepad: the same 64 parameters, bindings and library components, repainted and arranged as the SH-201 is.

- The silver signal path — OSC 1, OSC 2, MIX/MOD, FILTER, AMP — and the black modulation row: PITCH ENV, LFO 1, LFO 2, FILTER ENV, AMP ENV, with EFFECTS and PERFORMANCE on the black body.
- Every knob is SH-201 Knob 1.1.0, the silver one: select any knob and its Source card says so. The faders and LED switches are still 1.0.0; they already look like the instrument's.
- FILTER ENV and AMP ENV are sections of their own, and the filter envelope's DEPTH is a fader, as on the instrument.

The library for this file is Roland SH-201 (hardware look) components.json, beside it.

No hardware needed: choose Simulated device as the device's output (Settings → MIDI).`;

/* ------------------------------------------------------------------ the panel */

export function buildSh201Panel(lookName = 'draft') {
  const look = LOOKS[lookName];
  if (!look) throw new Error(`No look called ${lookName}`);
  const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  seq = 0;

  const packages = buildPackages(look.versions);
  const ctx = { byId, packages, missing: [], look };

  const upperChildren = {};
  const rowsAt = [];
  let y = PANEL.sectionTop - PANEL.upperTop;
  for (const row of look.rows) {
    let x = PANEL.inset;
    const gaps = [];
    row.sections.forEach((key, index) => {
      const spec = look.sections[key];
      const group = section(spec, { x, y }, ctx);
      upperChildren[group._children.Core.id] = group;
      x += spec.w + PANEL.gap;
      if (index < row.sections.length - 1) gaps.push(x - PANEL.gap);
    });
    rowsAt.push({ row, y, gaps });
    y += row.h + PANEL.gap;
  }
  if (ctx.missing.length) throw new Error(`layout.mjs places parameters the SH-201 profile does not have:\n  ${ctx.missing.join('\n  ')}`);
  if (lookName === 'hardware') {
    for (const control of signalFlow(rowsAt, look)) upperChildren[control._children.Core.id] = control;
    y += 6;
  }

  const upper = createControl('Group', {
    Core: { id: 'sh201_upper', name: 'Upper', tooltip: 'The Upper tone. The Lower tone has the same sections.' },
    Transform: { x: lookName === 'hardware' ? 6 : 0, y: PANEL.upperTop, width: PANEL.width - (lookName === 'hardware' ? 12 : 0), height: y + PANEL.inset },
    Background: { _children: { Fill: { colour: look.plate.fill }, Border: look.plate.border, Corners: { radius: 4 } } },
    Text: { content: '' },
  });
  upper._children.Children = { ...upper._children.Children, _children: upperChildren };

  const controls = [...header(look), upper];

  const panel = createPanel('Roland SH-201');
  panel.controlSet = { id: DEFAULT_CONTROL_SET_ID };
  panel.controls = controls;
  panel.width = PANEL.width;
  panel.height = PANEL.upperTop + upper._children.Transform.height + (lookName === 'hardware' ? 8 : 0);
  panel.bgColour = look.skin.panelBg;
  panel.gridEnabled = false;
  panel.snapToGrid = false;
  panel.description = look.description;
  panel.requiredProfiles = [{ role: DEVICE_NAME, profileId: profile.id, version: '*' }];
  const knobs = flatControls(controls).filter((c) => c._children?.Designer?.packageName === COMPONENTS.knob.name).length;
  panel.notepad = lookName === 'hardware'
    ? { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: HARDWARE_ABOUT }] }
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
  if (!check) return;
  if (!stale.length) { console.log('SH-201 panels and libraries are up to date.'); return; }
  for (const file of stale) console.error(`Stale: ${path.relative(REPO, file)} — run: node tools/scripts/sh201-panel/make-sh201-panel.mjs`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
