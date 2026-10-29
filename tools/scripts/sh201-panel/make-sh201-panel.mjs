// make-sh201-panel.mjs — the first draft of a Roland SH-201 panel that explains itself in the editor.
//
//   node tools/scripts/sh201-panel/make-sh201-panel.mjs            write the panel and its library
//   node tools/scripts/sh201-panel/make-sh201-panel.mjs --check    exit 1 if either is out of date
//
// WHAT IS DIFFERENT FROM THE GAIA AND AN1x PANELS. Those are generated, and their structure only
// makes sense in the generator. This one is meant to be read in the editor, so what a reader needs to
// see is in the document, not in this file:
//
//   - Three library components — the SH-201 knob, fader and LED switch — placed as LINKED copies.
//     Select any knob and its Source card names the package; "Update N copies on panel" finds the
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
import { SECTIONS, SECTION_ROWS, PANEL, SKIN } from './layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROFILE = path.join(REPO, 'CE/profiles/test/roland-sh-201.ceditor-device.json');
export const PANEL_OUT = path.join(REPO, 'CE/panels/Roland SH-201.cepanel');
export const LIBRARY_OUT = path.join(REPO, 'CE/panels/Roland SH-201 components.json');

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

const COMPONENTS = {
  knob: {
    name: 'SH-201 Knob',
    description: 'A rotary control for one SH-201 parameter. Its range, default and readout are set per copy.',
    build: () => publish(gaiaKnob({ size: SKIN.knob }), { editable: RANGE_PROPERTIES }),
  },
  fader: {
    name: 'SH-201 Fader',
    description: 'A slider for an envelope stage or a level. Its range, default and readout are set per copy.',
    build: () => publish(gaiaFader({ width: SKIN.faderW, height: SKIN.faderH, legacySkin: true }), { editable: RANGE_PROPERTIES }),
  },
  switch: {
    name: 'SH-201 LED Switch',
    description: 'An on/off switch with a lamp for each setting, for one SH-201 switch parameter.',
    build: () => publish(ledSwitch()),
  },
};

/** Each component as the package a library holds: built once, fingerprinted, versioned. */
function buildPackages() {
  const packages = {};
  for (const [key, spec] of Object.entries(COMPONENTS)) {
    const control = spec.build();
    control._children.Core.name = spec.name;
    // createControl stamps a time-based id; a fixed one keeps the library file byte-identical
    // between runs. A placed copy gets an id of its own either way.
    control._children.Core.id = `sh201_component_${key}`;
    const envelope = createCustomComponentExportEnvelope(control, {
      name: spec.name, version: '1.0.0', author: 'CEditor', description: spec.description,
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

/* ------------------------------------------------------------------ sections as containers */

/** A container with the section's name, its header tab, and its controls inside it. */
function section(spec, at, byId, packages, missing) {
  const group = createControl('Group', {
    Core: { id: nextId(`section_${spec.title}`), name: spec.title, tooltip: spec.about },
    Transform: { x: at.x, y: at.y, width: spec.w, height: spec.h },
    Background: {
      _children: {
        Fill: { colour: SKIN.sectionFill },
        Border: { enabled: true, thickness: 1.5, colour: spec.tint },
        Corners: { radius: 6 },
      },
    },
    Text: { content: '' },
  });
  const children = {};
  const add = (control) => { children[control._children.Core.id] = control; };

  const tab = label(spec.title, { x: 2, y: 2, w: Math.max(56, spec.title.length * 8 + 20), h: 17 },
    { size: 10, bold: true, colour: SKIN.tabText, name: `${spec.title} title` });
  tab._children.Background._children.Fill.colour = spec.tint;
  tab._children.Background._children.Corners = { radius: 4 };
  add(tab);

  for (const item of spec.items) {
    const parameter = byId.get(item.p);
    if (!parameter) { missing.push(item.p); continue; }
    const built = KINDS[item.kind](packages, parameter, item);
    add(built.control);
    add(label(item.label, built.caption, { align: built.caption.align ?? 'center', name: `${handle(parameter)} caption` }));
  }

  group._children.Children = { ...group._children.Children, _children: children };
  return group;
}

/** The tone-select button and its State: lit for the tone the panel's controls edit. */
function toneSelect(at) {
  const button = createControl('ToggleButton', {
    Core: { id: 'sh201_tone_upper', name: 'Tone Upper', tooltip: 'The tone these controls edit. The SH-201 edits one tone at a time.' },
    Transform: { x: at.x, y: at.y, width: 74, height: 24 },
    Text: { content: 'UPPER', _children: { Font: { size: 10, bold: true, weight: 'Bold', weightValue: 700, letterSpacing: 1 } } },
    Behavior: { defaultValue: true },
    Background: { _children: { Fill: { colour: SKIN.buttonOff }, Corners: { radius: 4 } } },
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
        'Background.Fill.colour': SKIN.toneLit,
        'Text.Fill.colour': SKIN.tabText,
      },
      parts: {},
    },
  };
  return button;
}

const NOTES = `Roland SH-201 — first draft, Upper tone only.

How to read it in the editor:
- Component tree: Upper › OSC 1, OSC 2, Mix/Mod, LFO 1, LFO 2, Pitch Env, Filter, Amp, Performance, Effects. The containers are the hardware's sections.
- Select a knob: Device Bindings shows the one profile parameter it sends; its tooltip names it and its address. The Source card names the library package (SH-201 Knob, Fader or LED Switch), and "Update N copies on panel" finds every copy.
- A copy's range, default and readout are published settings of the component (Public API), so Coarse Tune (sent 28..100, read -36..+36) and Cutoff (0..127) are the same knob.
- The UPPER button has a State, Editing, on its States tab: it lights the tone being edited, as the hardware does.
- No scripts.

No hardware needed: choose Simulated device as the device's output (Settings → MIDI). It answers from the profile.

The library: Roland SH-201 components.json, beside this file. Import it (Library → Package & Library → Import) if the Source card says "Not in this library".

Not built yet: the Lower tone (and how Upper/Lower switch), the effects, the arpeggiator, the system settings.`;

export function buildSh201Panel() {
  const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  seq = 0;

  const packages = buildPackages();
  const missing = [];

  const upperChildren = {};
  let y = PANEL.sectionTop - PANEL.upperTop;
  for (const row of SECTION_ROWS) {
    let x = PANEL.inset;
    for (const key of row.sections) {
      const spec = SECTIONS[key];
      const group = section(spec, { x, y }, byId, packages, missing);
      upperChildren[group._children.Core.id] = group;
      x += spec.w + PANEL.gap;
    }
    y += row.h + PANEL.gap;
  }
  if (missing.length) throw new Error(`layout.mjs places parameters the SH-201 profile does not have:\n  ${missing.join('\n  ')}`);

  const upper = createControl('Group', {
    Core: { id: 'sh201_upper', name: 'Upper', tooltip: 'The Upper tone. The Lower tone has the same sections.' },
    Transform: { x: 0, y: PANEL.upperTop, width: PANEL.width, height: y + PANEL.inset },
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 }, Corners: { radius: 0 } } },
    Text: { content: '' },
  });
  upper._children.Children = { ...upper._children.Children, _children: upperChildren };

  const controls = [
    label('ROLAND', { x: PANEL.inset, y: 14, w: 90, h: 22 }, { size: 15, bold: true, colour: SKIN.brand, align: 'left', name: 'brand' }),
    label('SH-201', { x: PANEL.inset + 92, y: 10, w: 120, h: 28 }, { size: 22, bold: true, colour: SKIN.model, align: 'left', name: 'model' }),
    label('TONE', { x: 330, y: 19, w: 44, h: 14 }, { size: 9, colour: SKIN.caption, align: 'right', name: 'tone caption' }),
    toneSelect({ x: 380, y: 14 }),
    label('LOWER — not in this draft', { x: 462, y: 19, w: 170, h: 14 }, { size: 9, colour: SKIN.dim, align: 'left', name: 'lower note' }),
    upper,
  ];

  const panel = createPanel('Roland SH-201');
  panel.controlSet = { id: DEFAULT_CONTROL_SET_ID };
  panel.controls = controls;
  panel.width = PANEL.width;
  panel.height = PANEL.upperTop + upper._children.Transform.height;
  panel.bgColour = SKIN.panelBg;
  panel.gridEnabled = false;
  panel.snapToGrid = false;
  panel.description = 'Roland SH-201 — Upper tone, first draft: library components, one binding per control, sections as containers';
  panel.requiredProfiles = [{ role: DEVICE_NAME, profileId: profile.id, version: '*' }];
  panel.notepad = { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: NOTES }] };
  panel.panelGuid = '6d1f3a52-0b7e-4c9a-a8f1-2e5b7c4d9a10';
  panel.scriptId = 'roland_sh201';
  panel.filePath = null;

  // Every copy is the package it came from, plus its own settings. If one ever counts as edited,
  // the "linked copies" this draft exists to show are not linked, and the build says so.
  const entries = libraryEntries(packages);
  const edited = [];
  const visit = (control) => {
    if (control._children?.Core?.controlType === 'CustomComponent') {
      const report = diffCustomComponentAgainstSource(control, entries);
      if (report.status !== 'current') edited.push(`${control._children.Core.name}: ${report.status} (${report.design.map((d) => d.path).join(', ')})`);
    }
    for (const child of Object.values(control._children?.Children?._children ?? {})) visit(child);
  };
  controls.forEach(visit);
  if (edited.length) throw new Error(`copies that are not clean copies of their package:\n  ${edited.join('\n  ')}`);

  return { panel, library: createCustomComponentLibraryEnvelope(Object.values(packages)) };
}

export function serializeSh201() {
  const { panel, library } = buildSh201Panel();
  library.exportedAt = STAMP;
  return { panel: `${serializePanel(panel)}\n`, library: `${JSON.stringify(library, null, 2)}\n` };
}

function main() {
  const check = process.argv.includes('--check');
  const { panel, library } = serializeSh201();
  if (check) {
    const stale = [[PANEL_OUT, panel], [LIBRARY_OUT, library]].filter(([file, text]) => {
      try { return readFileSync(file, 'utf8') !== text; } catch { return true; }
    });
    if (!stale.length) { console.log('SH-201 panel and library are up to date.'); return; }
    for (const [file] of stale) console.error(`Stale: ${path.relative(REPO, file)} — run: node tools/scripts/sh201-panel/make-sh201-panel.mjs`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(path.dirname(PANEL_OUT), { recursive: true });
  writeFileSync(PANEL_OUT, panel);
  writeFileSync(LIBRARY_OUT, library);
  const doc = JSON.parse(panel);
  console.log(`Wrote ${path.relative(REPO, PANEL_OUT)} (${doc.width}x${doc.height}, ${(panel.length / 1024).toFixed(0)} KB)`
    + ` and ${path.relative(REPO, LIBRARY_OUT)} (${(library.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
