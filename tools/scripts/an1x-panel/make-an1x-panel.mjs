// make-an1x-panel.mjs — build the Yamaha AN1x editor panel.
//
//   node tools/scripts/an1x-panel/make-an1x-panel.mjs [outFile]
//   node tools/scripts/an1x-panel/make-an1x-panel.mjs --check
//
// The layout is the AN1x's own block diagram — CTRL over PEG/LFO1/LFO2 over the signal flow,
// VCO → MIX → HPF/VCF → VCA → EFFECT — drawn in layout.mjs and emitted TWICE, because an AN1x
// voice is two scenes and a profile that shows one is showing half a patch. Scene 1 binds the
// flat scene parameters, Scene 2 binds the same spec against `scene2.*`, which exist because the
// DPD emitter now emits every scope instance instead of dropping all but the first.
//
// The controls are the GAIA panel's component library — drawn faders with flat caps, knobs with a
// rotating pointer, LED columns with every option visible — because those are instrument controls
// rather than form widgets, and nothing about them is GAIA-specific.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../../../CE/web/src/CE_Application/models/sectionDefaults.js';
import { parameterAdoptionPatches } from '../../../CE/web/src/CE_Application/utils/parameterAdoptionRules.js';
import { createPanel, serializePanel } from '../../../CE/web/src/CE_Application/stores/panelModel.js';
import { gaiaArpGrid, gaiaEnvelope, gaiaFader, gaiaKnob, gaiaLeds } from '../gaia-panel/components.mjs';
import { midiControlBindingFrom } from '../../../CE/web/src/CE_Application/utils/midiControlBindings.js';
import { COMMON_STRIP, EFFECT_STRIP, PANEL_WIDTH, PATTERN_STRIP, PLAY_STRIP, SCENE_STRIP, SKIN, TINT } from './layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROFILE = path.join(REPO, 'CE/profiles/test/yamaha-an1x-dpd.ceditor-device.json');
const DEFAULT_OUT = path.join(REPO, 'CE/panels/Yamaha AN1x.cepanel');

/** The device name the panel's bindings carry — a name a person would give the instrument. */
const DEVICE_NAME = 'Yamaha AN1x';

/** Every box reserves this much for its header tab before its first control. */
const CONTENT_TOP = 16;

const PORT_FOR = {
  Knob: 'value', Slider: 'value',
  ToggleButton: 'state', RadioButtonGroup: 'selectedChoice', Combobox: 'selectedChoice',
  TextInput: 'text',
};

let seq = 0;
const nextId = (hint) => `an1x_${hint.replace(/\W+/g, '_')}_${++seq}`;

function setPath(control, dotted, value) {
  const keys = dotted.split('.');
  let node = control._children;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]]) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function label(text, { x, y, w, h = 16 }, { size = 9, colour = SKIN.labelDim, bold = false, align = 'center' } = {}) {
  const lines = String(text).includes('\n') ? 2 : 1;
  return createControl('Label', {
    Core: { id: nextId('lbl'), name: 'label' },
    Transform: { x, y, width: w, height: h },
    Text: {
      content: text,
      _children: {
        Font: { size, bold, weight: bold ? 'Bold' : 'Regular', weightValue: bold ? 700 : 400, letterSpacing: 0.3 },
        Fill: { colour },
        Multiline: { wrapMode: 'word', overflowMode: 'shrink', fitMode: 'shrink', maxLines: lines, lineHeight: 1.1 },
      },
    },
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: align, verticalAlign: 'center', paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 },
  });
}

/** The coloured section outline with its filled header tab, same two-control trick as the GAIA. */
function sectionBox(box, originX, originY) {
  const x = originX + box.x;
  const y = originY + box.y;

  const frame = createControl('Background', {
    Core: { id: nextId(`box_${box.title}`), name: `box_${box.title}` },
    Transform: { x, y, width: box.w, height: box.h },
    Background: {
      _children: {
        Fill: { colour: SKIN.boxFill },
        Border: { enabled: true, thickness: 2, colour: box.tint },
        Corners: { radius: 6 },
      },
    },
  });

  const tab = createControl('Label', {
    Core: { id: nextId(`tab_${box.title}`), name: `tab_${box.title}` },
    Transform: { x: x + 2, y: y + 2, width: Math.min(box.w - 4, Math.max(64, box.title.length * 9 + 22)), height: 20 },
    Text: {
      content: box.title,
      _children: {
        Font: { size: 11, bold: true, weight: 'Bold', weightValue: 700, letterSpacing: 1 },
        Fill: { colour: 'FF13161A' },
      },
    },
    Background: { _children: { Fill: { colour: box.tint }, Border: { enabled: false, thickness: 0 }, Corners: { radius: 4 } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: 'center', verticalAlign: 'center', paddingLeft: 8, paddingRight: 8, paddingTop: 1, paddingBottom: 1 },
  });

  return [frame, tab];
}

function bound(parameter, type, box, overrides = {}) {
  const control = createControl(type, {
    Core: { id: nextId(parameter.id), name: parameter.id, description: `${parameter.name} — ${parameter.address ?? parameter.messageRecipe}` },
    Transform: { x: box.x, y: box.y, width: box.w, height: box.h },
    DeviceBindings: {
      bindings: [{
        kind: 'deviceParameter',
        port: PORT_FOR[type] ?? 'value',
        deviceRole: DEVICE_NAME,
        parameterId: parameter.id,
        parameterType: parameter.type,
        adoptMetadata: true,
        dryRun: false,
        feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
      }],
    },
  });

  for (const [dotted, value] of Object.entries(parameterAdoptionPatches(type, parameter))) {
    setPath(control, dotted, value);
  }
  for (const [dotted, value] of Object.entries(overrides)) setPath(control, dotted, value);
  return control;
}

/** A custom component, positioned and bound — range adopted into its value channel. */
function boundCustom(parameter, build, box) {
  const control = build();
  control._children.Core.id = nextId(parameter.id);
  control._children.Core.name = parameter.id;
  control._children.Core.description = `${parameter.name} — ${parameter.address ?? parameter.messageRecipe}`;
  Object.assign(control._children.Transform, { x: box.x, y: box.y, width: box.w, height: box.h });
  control._children.DeviceBindings = {
    _type: 'DeviceBindings',
    enabled: true,
    debug: false,
    bindings: [{
      kind: 'deviceParameter',
      port: 'value',
      deviceRole: DEVICE_NAME,
      parameterId: parameter.id,
      parameterType: parameter.type,
      adoptMetadata: true,
      dryRun: false,
      feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    }],
  };
  const channel = control._children.ValueChannels?._children?.value;
  if (channel) {
    if (parameter.range) {
      channel.min = parameter.range.min;
      channel.max = parameter.range.max;
      channel.step = 1;
      channel.type = 'int';
    }
    if (typeof parameter.default === 'number') channel.defaultValue = parameter.default;
  }
  return control;
}

const KINDS = {
  // An LED column with every option visible — from the parameter's own choices, or from options
  // the layout supplies where the profile has a bare integer whose settings the manual names.
  leds: (parameter, spec, at) => {
    const options = spec.options
      ?? (parameter.choices ?? []).map((choice) => ({ label: choice.label, value: choice.value }));
    const w = spec.w ?? 104;
    const h = options.length * SKIN.ledRow + 8;
    const control = boundCustom(parameter, () => gaiaLeds({ options, width: w, rowHeight: SKIN.ledRow }), { x: at.x, y: at.y, w, h });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 14, w } : null };
  },

  fader: (parameter, spec, at) => {
    const control = boundCustom(parameter, () => gaiaFader({ width: SKIN.faderW + 4, height: SKIN.faderH }), { x: at.x, y: at.y, w: SKIN.faderW + 4, h: SKIN.faderH });
    return {
      controls: [control],
      caption: { text: spec.label, x: at.x - 12, y: at.y + SKIN.faderH + 2, w: SKIN.faderW + 24, lines: 2 },
    };
  },

  knob: (parameter, spec, at) => {
    const control = boundCustom(parameter, () => gaiaKnob({ size: SKIN.knob }), { x: at.x, y: at.y, w: SKIN.knob, h: SKIN.knob });
    return { controls: [control], caption: { text: spec.label, x: at.x - 14, y: at.y + SKIN.knob + 5, w: SKIN.knob + 28 } };
  },

  knobBig: (parameter, spec, at) => {
    const control = boundCustom(parameter, () => gaiaKnob({ size: SKIN.knobBig }), { x: at.x, y: at.y, w: SKIN.knobBig, h: SKIN.knobBig });
    return { controls: [control], caption: { text: spec.label, x: at.x - 14, y: at.y + SKIN.knobBig + 5, w: SKIN.knobBig + 28 } };
  },

  knobSmall: (parameter, spec, at) => {
    const control = boundCustom(parameter, () => gaiaKnob({ size: SKIN.knobSmall }), { x: at.x, y: at.y, w: SKIN.knobSmall, h: SKIN.knobSmall });
    return { controls: [control], caption: { text: spec.label, x: at.x - 14, y: at.y + SKIN.knobSmall + 3, w: SKIN.knobSmall + 28 } };
  },

  // A named list, shown as a list. The profile carries the manual's own member names now — the
  // 30 arpeggio types, the 57 Free EG destinations, the 46 control-matrix destinations — and a
  // knob for any of those is a number where the instrument shows a word. `bound` adopts the
  // choices into Value.rows, so the label the user picks and the byte the AN1x receives come from
  // the same row.
  combo: (parameter, spec, at) => {
    const w = spec.w ?? 150;
    const control = bound(parameter, 'Combobox', { x: at.x, y: at.y, w, h: 24 }, {
      'Text.content': '',
      'Text._children.Font.size': 10,
      'Background._children.Corners.radius': 3,
    });
    return {
      controls: [control],
      caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 13, w, align: 'left' } : null,
    };
  },

  toggle: (parameter, spec, at) => {
    const control = bound(parameter, 'ToggleButton', { x: at.x, y: at.y, w: spec.w ?? 80, h: 22 }, {
      'Text.content': spec.label,
      'Background._children.Corners.radius': 4,
      'Text._children.Font.size': 9,
      'Text._children.Font.weightValue': 600,
      'Text._children.Font.weight': 'SemiBold',
      'Text._children.Multiline.wrapMode': 'word',
      'Text._children.Multiline.fitMode': 'shrink',
      'Text._children.Multiline.maxLines': 1,
      'ContentLayout.paddingLeft': 4,
      'ContentLayout.paddingRight': 4,
      'ContentLayout.paddingTop': 2,
      'ContentLayout.paddingBottom': 2,
    });
    return { controls: [control], caption: null };
  },
};

/**
 * Drop the default-valued fields a custom part carries.
 *
 * The component factory clones SECTION_DEFAULTS wholesale into every part, so one 42px knob
 * serializes sixteen rectangles each spelling out ~4.7 KB of stock Fill/Border/Corners fields it
 * never changed — which is how the GAIA panel came to cost 107 KB per control and 43 MB per file.
 * The panel serializer already elides CONTROLS against their type defaults; parts had no such pass.
 *
 * Keeping only what differs cuts a part to a few hundred bytes. Verified by rendering the slim and
 * fat panels and comparing the screenshots pixel for pixel before this became the default.
 */
/**
 * A key may only be dropped when its absence READS the same as its value. Nothing re-expands a
 * part on load (documentShape's NEVER_ELIDE says why), so every reader sees the raw document and
 * treats a missing key as undefined — falsy. Deleting `linked: true` from a Corners section
 * because true is the default therefore turned every knob and LED square: the renderer read
 * absent-linked as unlinked and fell back to the per-corner radii of 0. Found by rendering the
 * slim and fat panels and comparing pixels, which is also how this rule is enforced.
 */
const falsyish = (v) => v === false || v === 0 || v === '' || v === null;

function elideAgainst(node, defaults) {
  if (!node || typeof node !== 'object' || !defaults || typeof defaults !== 'object') return;
  for (const key of Object.keys(node)) {
    if (key === '_type') continue;
    const ours = node[key];
    const theirs = defaults[key];
    if (ours && typeof ours === 'object' && theirs && typeof theirs === 'object' && !Array.isArray(ours)) {
      elideAgainst(ours, theirs);
      if (Object.keys(ours).every((k) => k === '_type')) delete node[key];
    } else if (falsyish(ours) && JSON.stringify(ours) === JSON.stringify(theirs)) {
      delete node[key];
    }
  }
}

// A stock part, to elide the boilerplate every part is born with — the factory's own defaults for
// the node fields and the Layout section. Built once, from the same factory the parts came from,
// so the reference cannot drift from the code that stamps them.
import { createPartNode } from '../../../CE/web/src/CE_Application/utils/customComponentFactory.js';
const REFERENCE_PART = createPartNode('__reference', { role: 'custom' });

const SLIM_LEVEL = Number(process.env.AN1X_SLIM_LEVEL ?? 3);

function slimCustomParts(control) {
  const parts = control._children?.Parts?._children;
  if (!parts) return control;
  for (const part of Object.values(parts)) {
    const sections = part?._children;
    if (!sections) continue;
    if (SLIM_LEVEL >= 2) {
      for (const key of Object.keys(part)) {
        if (key === '_type' || key === 'name' || key === '_children') continue;
        if (falsyish(part[key]) && JSON.stringify(part[key]) === JSON.stringify(REFERENCE_PART[key])) delete part[key];
      }
      if (sections.Layout) elideAgainst(sections.Layout, REFERENCE_PART._children.Layout);
    }
    if (sections.Background) {
      elideAgainst(sections.Background, SECTION_DEFAULTS.Background);
      // With linked corners the four per-corner sub-objects are dead weight — the renderer takes
      // the linked radius. They are ~2 KB of every part; the pixel comparison below is what
      // licenses dropping them.
      const corners = sections.Background._children?.Corners;
      if (corners && corners.linked === true) {
        delete corners.topLeft; delete corners.topRight; delete corners.bottomLeft; delete corners.bottomRight;
      }
    }
    if (SLIM_LEVEL >= 3 && sections.Text) elideAgainst(sections.Text, SECTION_DEFAULTS.Text);
  }
  return control;
}

/**
 * One Free EG track: the recorded curve, drawn and editable, over the sequence length.
 *
 * An Envelope rather than a drawing, because the Free EG is not decoration — it is a shape the user
 * makes. What it is NOT, yet, is transmitted. The instrument stores each track as 192 two-byte
 * samples (10 00 68 for track 1, 384 bytes per track), and those addresses now exist in the
 * profile; what does not exist is a binding kind that maps one curve onto an array of parameters.
 * Until it does, this lane edits the panel's copy. The two ways to close that gap are both open
 * now that the addresses are modelled: 192 parameter writes, or one voiceCommon bulk send.
 *
 * Saying so here rather than only in the notes, because a control that looks connected and is not
 * is the single failure this panel has already shipped twice.
 */
function curveLane(lane, at) {
  const flat = [
    { id: 'p0', x: 0, y: 0.5, curve: 'linear', tension: 0 },
    { id: 'p1', x: 0.5, y: 0.5, curve: 'linear', tension: 0 },
    { id: 'p2', x: 1, y: 0.5, curve: 'linear', tension: 0 },
  ];
  const control = createControl('Envelope', {
    Core: {
      id: nextId(`feg_track_${lane.track}`),
      name: `fegTrack${lane.track}Curve`,
      description: `Free EG track ${lane.track} curve — 192 points at 10 0${(lane.track - 1) * 3} 68 `
        + '(not transmitted: no binding maps a curve onto an array of parameters)',
    },
    Transform: { x: at.x, y: at.y, width: lane.w, height: lane.h },
    Envelope: {
      preset: 'free',
      points: flat,
      sustainIndex: -1,
      editable: true,
      addOnDoubleClick: true,
      showGrid: true,
      showPlayhead: false,
      xLabel: '',
      yLabel: '',
      snapX: 0,
      snapY: 0,
      fillUnder: true,
      // The Envelope section keeps its colours flat, not under a Curve/Grid child. Nesting them
      // wrote four keys nothing reads and left every lane the stock blue.
      lineColour: lane.colour,
      fillColour: `28${lane.colour.slice(2)}`,
      nodeColour: lane.colour,
      gridColour: '14FFFFFF',
      lineWidth: 1.6,
      nodeRadius: 3,
      gridX: 8,
      gridY: 2,
    },
    Background: {
      _children: {
        Fill: { colour: 'FF161B21' },
        Border: { enabled: true, thickness: 1, colour: '553F4A55' },
        Corners: { radius: 3 },
      },
    },
  });
  return control;
}

function placeStatic(control, id, { x, y, w, h }) {
  control._children.Core.id = nextId(id);
  control._children.Core.name = id;
  Object.assign(control._children.Transform, { x, y, width: w, height: h });
  return control;
}

/**
 * The control matrix: eight sets of SOURCE / PARAM / DEPTH, two columns of four.
 *
 * The AN1x's headline feature after the scenes, and the diagram's CTRL bar made concrete: any of
 * 115 sources scaled into any of 37 destinations. Laid out as knob triplets because the profile
 * carries the manual's numbered lists, not named choices — the hardware picks names on its display,
 * this picks numbers, and the parameter browser shows the mapping.
 */
function buildMatrix(box, byId, resolve, originX, originY) {
  const controls = [];
  const missing = [];
  const m = box.matrix;
  const x0 = originX + box.x + m.x;
  const y0 = originY + box.y + CONTENT_TOP + m.y;

  // Column headings once, rather than a caption under all twenty-four knobs.
  for (const [text, cx, cw, align] of [['SRC', 0, 40, 'center'], ['DESTINATION', 52, 176, 'left'], ['DEPTH', 240, 44, 'center']]) {
    controls.push(label(text, { x: x0 + cx, y: y0 - 15, w: cw, h: 13 }, { size: 8, colour: SKIN.label, align }));
  }

  for (let set = 1; set <= m.sets; set++) {
    const y = y0 + (set - 1) * m.rowH;

    const source = byId.get(resolve(`scCmSource${set}`));
    const destination = byId.get(resolve(`scCmParam${set}`));
    const depth = byId.get(resolve(`scCmDepth${set}`));
    for (const [id, parameter] of [[`scCmSource${set}`, source], [`scCmParam${set}`, destination], [`scCmDepth${set}`, depth]]) {
      if (!parameter) missing.push(resolve(id));
    }
    if (!source || !destination || !depth) continue;

    controls.push(boundCustom(source, () => gaiaKnob({ size: SKIN.knobTiny }), { x: x0, y, w: SKIN.knobTiny, h: SKIN.knobTiny }));
    // The destination is a named list — 46 of them, from the manual's own Control Matrix List. It
    // was a knob for as long as the profile carried it as a bare integer; a number in a box is
    // what a knob can say, and "VCF Cutoff" is what the instrument's display says.
    controls.push(bound(destination, 'Combobox', { x: x0 + 52, y: y + 7, w: 176, h: 22 }, {
      'Text.content': '',
      'Text._children.Font.size': 9,
      'Background._children.Corners.radius': 3,
    }));
    controls.push(boundCustom(depth, () => gaiaKnob({ size: SKIN.knobTiny }), { x: x0 + 240, y, w: SKIN.knobTiny, h: SKIN.knobTiny }));
    controls.push(label(String(set), { x: x0 - 10, y: y + 12, w: 10, h: 12 }, { size: 8, colour: SKIN.labelDim }));
  }

  return { controls, missing };
}

function buildStrip(strip, byId, { originX = 0, originY = 0, resolve = (p) => p }) {
  const controls = [];
  const missing = [];

  for (const box of strip.boxes) {
    controls.push(...sectionBox(box, originX, originY));

    for (const env of box.envelopes ?? []) {
      const x = originX + box.x + env.x;
      const y = originY + box.y + CONTENT_TOP + env.y;
      controls.push(placeStatic(gaiaEnvelope({ stages: env.stages, width: env.w, height: env.h }),
        `env_${env.bind}`, { x, y, w: env.w, h: env.h }));
    }

    if (box.grid) {
      const g = box.grid;
      controls.push(placeStatic(gaiaArpGrid({ width: g.w, height: g.h, steps: g.steps, viewNote: 60 }),
        'step_seq_grid', { x: originX + box.x + g.x, y: originY + box.y + CONTENT_TOP + g.y, w: g.w, h: g.h }));
    }

    for (const lane of box.curves ?? []) {
      const x = originX + box.x + lane.x;
      const y = originY + box.y + CONTENT_TOP + lane.y;
      controls.push(label(lane.label, { x: originX + box.x + lane.labelX, y: y + 10, w: 62, h: 16 },
        { size: 10, bold: true, colour: lane.colour, align: 'left' }));
      controls.push(curveLane(lane, { x, y }));
    }

    // The note-playing controls. They carry no DeviceBindings — they emit notes rather than drive a
    // parameter — so they are placed rather than bound, and the preview surface addresses them to
    // the device this panel names.
    if (box.ribbon) {
      const r = box.ribbon;
      controls.push(placeStatic(createControl('NoteRibbon', {
        NoteRibbon: { mode: 'chromatic', baseNote: r.baseNote, octaves: r.octaves, channel: 1, velocity: 100 },
      }), 'play_ribbon', { x: originX + box.x + r.x, y: originY + box.y + CONTENT_TOP + r.y, w: r.w, h: r.h }));
    }

    if (box.chords) {
      const c = box.chords;
      controls.push(placeStatic(createControl('ChordPad', {
        ChordPad: { layout: 'grid', baseOctave: 3 },
      }), 'play_chords', { x: originX + box.x + c.x, y: originY + box.y + CONTENT_TOP + c.y, w: c.w, h: c.h }));
    }

    if (box.transport) {
      const t = box.transport;
      // clockOut on, because the AN1x's arpeggiator and step sequencer follow MIDI clock and this
      // panel is the only thing here that can start one.
      controls.push(placeStatic(createControl('Transport', {
        Transport: { bpm: 120, clockOut: true },
      }), 'play_transport', { x: originX + box.x + t.x, y: originY + box.y + CONTENT_TOP + t.y, w: t.w, h: t.h }));
    }

    // Raw MIDI bindings: a message rather than a profile parameter. The only way to select a voice,
    // because the engine's recipe vocabulary has no program change in it.
    for (const spec of box.raw ?? []) {
      const at = { x: originX + box.x + spec.x, y: originY + box.y + CONTENT_TOP + spec.y };
      const control = createControl('CustomComponent', {});
      const built = gaiaKnob({ size: SKIN.knob });
      built._children.Core.id = nextId(`raw_${spec.label}`);
      built._children.Core.name = spec.label;
      Object.assign(built._children.Transform, { x: at.x, y: at.y, width: SKIN.knob, height: SKIN.knob });
      const channel = built._children.ValueChannels?._children?.value;
      if (channel) Object.assign(channel, { min: 0, max: spec.max ?? 127, step: 1, type: 'int', defaultValue: 0 });
      built._children.DeviceBindings = {
        _type: 'DeviceBindings',
        enabled: true,
        debug: false,
        bindings: [midiControlBindingFrom({
          message: spec.message,
          controller: spec.controller,
          port: 'value',
          deviceRole: DEVICE_NAME,
        })],
      };
      controls.push(built);
      controls.push(label(spec.label, { x: at.x - 14, y: at.y + SKIN.knob + 5, w: SKIN.knob + 28, h: 16 }, { size: 9, colour: SKIN.label }));
      void control;
    }

    if (box.matrix) {
      const built = buildMatrix(box, byId, resolve, originX, originY);
      controls.push(...built.controls);
      missing.push(...built.missing);
    }

    for (const spec of box.controls ?? []) {
      const parameter = byId.get(resolve(spec.p));
      if (!parameter) { missing.push(resolve(spec.p)); continue; }

      const at = { x: originX + box.x + spec.x, y: originY + box.y + CONTENT_TOP + spec.y };
      const built = KINDS[spec.kind](parameter, spec, at);
      controls.push(...built.controls);
      if (built.caption) {
        controls.push(label(built.caption.text, {
          x: built.caption.x, y: built.caption.y, w: built.caption.w,
          h: built.caption.lines === 2 ? 26 : 16,
        }, { size: 9, colour: SKIN.label, align: built.caption.align ?? 'center' }));
      }
    }
  }

  return { controls, missing };
}

const NOTES = `Yamaha AN1x — editor panel.

Generated by tools/scripts/an1x-panel/make-an1x-panel.mjs from
CE/profiles/test/yamaha-an1x-dpd.ceditor-device.json. Do not hand-edit — change layout.mjs.

The layout is the block diagram
  Left to right is the manual's own signal flow: VCO1/VCO2 (with SYNC and FM between them) ->
  MIX (with RING MOD and NOISE feeding it) -> HPF/VCF with the filter EG -> VCA with the amp EG
  and the FEEDBACK loop -> VARIATION -> EQ -> DELAY -> REVERB. PEG and the LFOs sit at the left
  of each scene, where the diagram pours them in from above.

Two scenes, both on screen
  An AN1x voice is two scenes and the morph between them. The hardware shows one at a time behind
  a SCENE button; here Scene 1 is the blue strip and Scene 2 the amber one, each a complete signal
  path. Scene 2's parameters live at their own SysEx addresses (10 11 nn) — emitted from the DPD
  since the emitter learned to keep every scope instance instead of only the first.

What the labels do not promise
  VCO wave names are the manual's standard set; the instrument re-labels waves 3..5 when the VCO
  algorithm changes, and this panel does not. The control matrix shows sets 1-8 of 16 — the other
  eight are in the parameter browser. Its DESTINATION is the manual's own list of 46, by name; its
  SOURCE is still a number, because this Data List does not enumerate the 115 sources.

The Free EG is four tracks, not twelve knobs
  It used to be twelve knobs and no curve at all, which described the Free EG about as well as a
  list of ingredients describes a meal. It is four recorder tracks running together over one
  timeline: each picks a destination out of 46, each has a scene switch, each holds a shape. So it
  is drawn as four lanes against a shared x, one colour per track.

  The destination and the scene switch are real addresses (10 00 60..67) and transmit. The CURVE
  does not, yet. The instrument keeps each track as 192 two-byte samples — track 1 at 10 00 68,
  384 bytes per track — and those addresses are in the profile now; what does not exist is a
  binding kind that maps one curve onto an array of parameters. Two ways to close it, both open
  now that the addresses are modelled: 192 parameter writes, or one voiceCommon bulk send.

The step sequencer grid edits a pattern, not the synth
  Same honesty as the GAIA's arpeggio grid: the drawn blocks publish through the component's
  pattern channel, and no pattern-to-parameter bridge exists yet. The 70 step parameters DO exist
  now (10 0E 00 — sixteen each of note, velocity, gate and control value), so the grid could be
  bound step by step; nothing binds it today. The controls beside it — type, kbd mode, hold,
  scene, subdivide, swing, velocity, gate — are real addresses and fully wired.

Named lists read as names
  Arpeggio type, keyboard mode, scene switch, Free EG destination, control-matrix destination and
  the effect types are the manual's own lists now, so they are choosers rather than knobs. A knob
  can show a number; only a list can show "BassLineD".`;

export function buildAn1xPanel({ slim = true } = {}) {
  const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  seq = 0;

  const panel = createPanel('Yamaha AN1x');
  const controls = [];
  const missing = [];

  const PLATE_INSET = 10;
  const plate = createControl('Background', {
    Core: { id: 'an1x_plate', name: 'plate' },
    Transform: { x: PLATE_INSET, y: PLATE_INSET, width: PANEL_WIDTH - PLATE_INSET * 2, height: 10 },
    Background: {
      _children: {
        Fill: { colour: SKIN.plate },
        Border: { enabled: true, thickness: 1, colour: SKIN.plateEdge },
        Corners: { radius: 10 },
      },
    },
  });
  controls.push(plate);

  let y = 26;
  const common = buildStrip(COMMON_STRIP, byId, { originX: 16, originY: y });
  controls.push(...common.controls);
  missing.push(...common.missing);
  y += COMMON_STRIP.height + 8;

  for (const scene of [1, 2]) {
    controls.push(label(`SCENE ${scene}`, { x: 16, y: y - 2, w: 110, h: 18 }, {
      size: 13, bold: true, colour: scene === 1 ? 'FF9FCBEA' : 'FFEFC38A', align: 'left',
    }));
    const strip = buildStrip(
      { ...SCENE_STRIP, boxes: SCENE_STRIP.boxes.map((b) => ({ ...b, tint: b.tint === TINT.ctrl ? b.tint : (scene === 1 ? TINT.scene1 : TINT.scene2) })) },
      byId,
      {
        originX: 16,
        originY: y + 18,
        // The one line that makes two scenes out of one drawing.
        resolve: (id) => (scene === 1 ? id : `scene2.${id}`),
      },
    );
    controls.push(...strip.controls);
    missing.push(...strip.missing);
    y += SCENE_STRIP.height + 30;
  }

  const effects = buildStrip(EFFECT_STRIP, byId, { originX: 16, originY: y });
  controls.push(...effects.controls);
  missing.push(...effects.missing);
  y += EFFECT_STRIP.height + 8;

  const pattern = buildStrip(PATTERN_STRIP, byId, { originX: 16, originY: y });
  controls.push(...pattern.controls);
  missing.push(...pattern.missing);
  y += PATTERN_STRIP.height + 8;

  const play = buildStrip(PLAY_STRIP, byId, { originX: 16, originY: y });
  controls.push(...play.controls);
  missing.push(...play.missing);
  y += PLAY_STRIP.height;

  if (missing.length) {
    throw new Error(`layout.mjs places parameters the profile does not have:\n  ${[...new Set(missing)].join('\n  ')}`);
  }

  // The wordmark, the way the instrument prints it: YAMAHA small, AN1x big and orange.
  const brandY = y + 14;
  controls.push(label('YAMAHA', { x: 26, y: brandY + 6, w: 120, h: 22 }, { size: 17, bold: true, colour: 'FF2A2E33', align: 'left' }));
  controls.push(label('AN1x', { x: 150, y: brandY - 2, w: 130, h: 34 }, { size: 28, bold: true, colour: 'FFE87722', align: 'left' }));
  controls.push(label('CONTROL SYNTHESIZER', { x: 286, y: brandY + 12, w: 260, h: 14 }, { size: 10, colour: 'FF5A626A', align: 'left' }));

  plate._children.Transform.height = y - PLATE_INSET + 4;

  panel.controls = slim ? controls.map(slimCustomParts) : controls;
  panel.width = PANEL_WIDTH;
  panel.height = brandY + 46;
  panel.bgColour = SKIN.panelBg;
  panel.gridEnabled = false;
  panel.snapToGrid = false;
  panel.description = 'Yamaha AN1x — both scenes, laid out as the block diagram';
  panel.requiredProfiles = [{ role: DEVICE_NAME, profileId: profile.id, version: '*' }];
  panel.notepad = { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: NOTES }] };
  panel.panelGuid = 'f2b4d9c1-7a35-4e02-8b16-3dd80a95c4e7';
  panel.scriptId = 'yamaha_an1x';
  panel.filePath = null;

  return panel;
}

export function serializeAn1xPanel({ slim = true } = {}) {
  return `${serializePanel(buildAn1xPanel({ slim }))}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const slim = !args.includes('--fat');
  const out = path.resolve(REPO, args.find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
  const json = serializeAn1xPanel({ slim });

  if (check) {
    let current = null;
    try { current = readFileSync(out, 'utf8'); } catch { /* missing counts as stale */ }
    if (current === json) { console.log('AN1x panel is up to date.'); return; }
    console.error(`Stale: ${path.relative(REPO, out)} — run: node tools/scripts/an1x-panel/make-an1x-panel.mjs`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json);
  const panel = JSON.parse(json);
  console.log(`Wrote ${path.relative(REPO, out)}  (${panel.controls.length} controls, ${panel.width}x${panel.height}, ${(json.length / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
