// make-gaia-panel.mjs — build the Roland GAIA SH-01 editor panel.
//
//   node tools/scripts/gaia-panel/make-gaia-panel.mjs [outFile]
//   node tools/scripts/gaia-panel/make-gaia-panel.mjs --check
//
// Not QA-06. That sheet lays parameters out by algorithm so it can never miss one, which makes it
// exhaustive and makes it look nothing like a synthesiser. This is the other half: the SH-01's own
// layout, hand-placed in layout.mjs — signal flow left to right, the instrument's section colours,
// envelopes as fader banks, enums as LED columns rather than dropdowns.
//
// The two are not redundant. QA-06 fails when a binding breaks; this one is what a GAIA owner
// opens. Both are generated from the same profile, so neither can drift from the device.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { parameterAdoptionPatches } from '../../../CE/web/src/CE_Application/utils/parameterAdoptionRules.js';
import { createPanel, serializePanel } from '../../../CE/web/src/CE_Application/stores/panelModel.js';
import { COMMON_STRIP, EFFECTS_STRIP, PANEL_WIDTH, SKIN, TONE_STRIP } from './layout.mjs';
import { gaiaFader, gaiaKnob, gaiaLeds } from './components.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROFILE = path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json');
const DEFAULT_OUT = path.join(REPO, 'CE/panels/Roland GAIA SH-01.cepanel');

/** Which port a bound control exposes. */
/**
 * Every box reserves this much for its header tab before its first control.
 *
 * The tab sits at y+2..y+22, and a caption drawn at "control.y - 13" landed straight on top of it.
 * Reserving the row here rather than adding 16 to forty authored coordinates keeps layout.mjs
 * readable as a drawing — its numbers stay relative to the box's content, not to its chrome.
 */
const CONTENT_TOP = 16;

const PORT_FOR = {
  Knob: 'value', Slider: 'value', Number: 'value',
  ToggleButton: 'state', RadioButtonGroup: 'selectedChoice', Combobox: 'selectedChoice',
  TextInput: 'text',
};

let seq = 0;
const nextId = (hint) => `gaia_${hint}_${++seq}`;

function setPath(control, dotted, value) {
  const keys = dotted.split('.');
  let node = control._children;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]]) node[keys[i]] = {};
    node = node[keys[i]];
  }
  node[keys[keys.length - 1]] = value;
}

function label(text, { x, y, w, h = 13 }, { size = 9, colour = SKIN.labelDim, bold = false, align = 'center' } = {}) {
  return createControl('Label', {
    Core: { id: nextId('lbl'), name: 'label' },
    Transform: { x, y, width: w, height: h },
    Text: {
      content: text,
      _children: {
        Font: { size, bold, weight: bold ? 'Bold' : 'Regular', weightValue: bold ? 700 : 400, letterSpacing: 0.4 },
        Fill: { colour },
      },
    },
    // Border OFF, explicitly. SECTION_DEFAULTS.Background.Border is `enabled: true` at 2px of
    // FFFFFFFF, so every Label is born inside a thick white rectangle. On a panel made mostly of
    // small captions that is the loudest thing on screen — forty white boxes drowning the controls
    // they name.
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: align, verticalAlign: 'center', paddingLeft: 2, paddingRight: 2, paddingTop: 0, paddingBottom: 0 },
  });
}

/**
 * A section box: the instrument's coloured outline with a filled header tab carrying its name.
 *
 * Drawn as two controls rather than one, because the tab is a different colour from the box and
 * the box has to sit behind everything in it. The SH-01 prints its sections exactly this way —
 * a coloured rule around the group and the name in a solid tab on the top-left corner.
 */
function sectionBox(box, originX, originY) {
  const x = originX + box.x;
  const y = originY + box.y;

  const frame = createControl('Background', {
    Core: { id: nextId('box'), name: `box_${box.title}` },
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
    Core: { id: nextId('tab'), name: `tab_${box.title}` },
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

/**
 * Build one bound control, shaped like the parameter it drives.
 *
 * `make` lets a caller hand in a control it built itself — which is how the custom fader and knob
 * get here. They bind exactly like a native control does: one port, one parameter, one adoption
 * pass. The only difference is who drew them.
 */
function bound(parameter, type, box, overrides = {}, make = null) {
  const control = (make ?? createControl)(type, {
    Core: { id: nextId(parameter.id.replace(/\W+/g, '_')), name: parameter.id, description: `${parameter.name} — ${parameter.address ?? parameter.messageRecipe}` },
    Transform: { x: box.x, y: box.y, width: box.w, height: box.h },
    DeviceBindings: {
      bindings: [{
        kind: 'deviceParameter',
        port: PORT_FOR[type] ?? 'value',
        deviceRole: 'primary',
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

/**
 * A custom component, positioned and bound to a parameter.
 *
 * Its single published `value` channel is the port. Adoption still runs, so the component gets the
 * parameter's range the same way a native control would — the drawing is custom, the wiring is not.
 */
function boundCustom(parameter, build, box) {
  const control = build();
  control._children.Core.id = nextId(parameter.id.replace(/\W+/g, '_'));
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
      deviceRole: 'primary',
      parameterId: parameter.id,
      parameterType: parameter.type,
      adoptMetadata: true,
      dryRun: false,
      feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    }],
  };
  // Adoption, but into the VALUE CHANNEL — which is where a custom component keeps its range.
  //
  // The first version copied adoption's `Behavior.*` patches straight on, which quietly CREATED a
  // Behavior section on a control type that does not have one. CustomComponent carries `Behaviors`
  // (plural: the behaviour modules it drives its parts with); singular `Behavior` belongs to the
  // native interactive controls. A section the type never declares is a section nothing downstream
  // agrees about, and it showed up on screen as stray marks above every fader.
  const channel = control._children.ValueChannels?._children?.value;
  if (channel) {
    if (parameter.range) {
      channel.min = parameter.range.min;
      channel.max = parameter.range.max;
      channel.step = parameter.type === 'float' ? (parameter.range.max - parameter.range.min) / 1000 : 1;
      channel.type = parameter.type === 'float' ? 'float' : 'int';
    }
    if (typeof parameter.default === 'number') channel.defaultValue = parameter.default;
  }
  return control;
}

/**
 * Each control kind, as the instrument draws it.
 *
 * The three that matter for it reading as a GAIA rather than as a form:
 *   leds   a vertical list of named options, like the LED columns beside WAVE and FILTER MODE —
 *          not a dropdown, because on the hardware every option is visible at once
 *   fader  a vertical slider, which is what every envelope stage on the front panel is
 *   knob   a rotary, only where the hardware has one
 */
const KINDS = {
  leds: (parameter, spec, at) => {
    // A custom LED column, not a RadioButtonGroup. Every option printed with a lamp beside it, one
    // lit — which is how you read WAVE or FILTER MODE on the instrument without touching anything.
    const options = (parameter.choices ?? []).map((choice) => ({ label: choice.label, value: choice.value }));
    if (options.length === 0) return KINDS.ledsLegacy(parameter, spec, at);

    const build = () => gaiaLeds({ options, width: SKIN.ledW, rowHeight: SKIN.ledRow });
    const h = options.length * SKIN.ledRow + 8;
    const control = boundCustom(parameter, build, { x: at.x, y: at.y, w: SKIN.ledW, h });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 14, w: SKIN.ledW } : null, bottom: at.y + h };
  },

  ledsLegacy: (parameter, spec, at) => {
    const rows = parameter.choices?.length ?? 2;
    const h = Math.max(28, rows * SKIN.ledRow + 8);
    const control = bound(parameter, 'RadioButtonGroup', { x: at.x, y: at.y, w: SKIN.ledW, h }, {
      'Behavior.orientation': 'vertical',
      'Behavior.itemColumns': 1,
      'Text.content': '',
    });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 14, w: SKIN.ledW } : null, bottom: at.y + h };
  },

  fader: (parameter, spec, at) => {
    // A custom component, not a Slider. SliderFamilyRenderer draws its thumb as a hardcoded
    // circle, and a flat cap is most of what makes a bank of four read as an envelope.
    const control = boundCustom(parameter, () => gaiaFader({ width: SKIN.faderW + 4, height: SKIN.faderH }), { x: at.x, y: at.y, w: SKIN.faderW + 4, h: SKIN.faderH });
    return {
      controls: [control],
      caption: { text: spec.label, x: at.x - 12, y: at.y + SKIN.faderH + 2, w: SKIN.faderW + 24, lines: 2 },
      bottom: at.y + SKIN.faderH + 26,
    };
  },

  faderLegacy: (parameter, spec, at) => {
    const control = bound(parameter, 'Slider', { x: at.x, y: at.y, w: SKIN.faderW, h: SKIN.faderH }, {
      'Behavior.orientation': 'vertical',
      'Behavior.showTicks': false,
      'Behavior.showValueReadout': false,
      'Behavior.showMinMaxLabels': false,
      // The slot. SliderFamilyRenderer reads the track's THICKNESS from bodyTrackBase's
      // Layout.height regardless of orientation (line ~243) — setting height to the fader's
      // length, which is the intuitive reading, produces a track 100px thick.
      'Parts._children.bodyTrackBase._children.Layout.height': 7,
      'Parts._children.bodyTrackBase._children.Background._children.Fill.colour': 'FF0E1113',
      'Parts._children.bodyTrackBase._children.Background._children.Corners.radius': 3,
      'Parts._children.bodyTrackFill._children.Layout.height': 7,
      'Parts._children.bodyTrackFill._children.Background._children.Fill.colour': 'FF35424D',
      // The cap. Its DIAMETER comes from pointerCurrent's Layout.width — the renderer draws this
      // part as `{ kind: 'circle', r: size / 2 }`, so a flat fader cap is not expressible today.
      // A round one at the right size still reads far better than the 20px default.
      'Parts._children.pointerCurrent._children.Layout.width': 17,
      'Parts._children.pointerCurrent._children.Background._children.Fill.colour': 'FFE9EDF1',
      'Parts._children.pointerCurrent._children.Background._children.Border.enabled': true,
      'Parts._children.pointerCurrent._children.Background._children.Border.thickness': 1,
      'Parts._children.pointerCurrent._children.Background._children.Border.colour': 'CC0B0E10',
    });
    return {
      controls: [control],
      caption: { text: spec.label, x: at.x - 12, y: at.y + SKIN.faderH + 2, w: SKIN.faderW + 24, lines: 2 },
      bottom: at.y + SKIN.faderH + 26,
    };
  },

  knob: (parameter, spec, at) => {
    const control = boundCustom(parameter, () => gaiaKnob({ size: SKIN.knob }), { x: at.x, y: at.y, w: SKIN.knob, h: SKIN.knob });
    return { controls: [control], caption: { text: spec.label, x: at.x - 14, y: at.y + SKIN.knob + 5, w: SKIN.knob + 28 }, bottom: at.y + SKIN.knob + 19 };
  },

  knobLegacy: (parameter, spec, at) => {
    const control = bound(parameter, 'Knob', { x: at.x, y: at.y, w: SKIN.knob, h: SKIN.knob }, {
      'Behavior.showTicks': true,
      'Behavior.showValueReadout': false,
      'Behavior.showMinMaxLabels': false,
    });
    return { controls: [control], caption: { text: spec.label, x: at.x - 14, y: at.y + SKIN.knob + 5, w: SKIN.knob + 28 }, bottom: at.y + SKIN.knob + 19 };
  },

  knobSmall: (parameter, spec, at) => {
    const control = boundCustom(parameter, () => gaiaKnob({ size: 42 }), { x: at.x, y: at.y, w: 42, h: 42 });
    return { controls: [control], caption: { text: spec.label, x: at.x - 14, y: at.y + 44, w: 70 }, bottom: at.y + 58 };
  },

  toggle: (parameter, spec, at) => {
    const control = bound(parameter, 'ToggleButton', { x: at.x, y: at.y, w: spec.w ?? 80, h: 22 }, {
      'Text.content': spec.label,
      'Background._children.Corners.radius': 4,
    });
    return { controls: [control], caption: null, bottom: at.y + 22 };
  },

  combo: (parameter, spec, at) => {
    const control = bound(parameter, 'Combobox', { x: at.x, y: at.y, w: spec.w ?? 100, h: 24 });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 13, w: spec.w ?? 100 } : null, bottom: at.y + 24 };
  },

  text: (parameter, spec, at) => {
    const control = bound(parameter, 'TextInput', { x: at.x, y: at.y, w: spec.w ?? 180, h: 26 });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 13, w: spec.w ?? 180 } : null, bottom: at.y + 26 };
  },
};

function buildStrip(strip, byId, { originX = 0, originY = 0, resolve = (p) => p }) {
  const controls = [];
  const missing = [];

  for (const box of strip.boxes) {
    controls.push(...sectionBox(box, originX, originY));

    for (const spec of box.controls) {
      const parameter = byId.get(resolve(spec.p));
      if (!parameter) { missing.push(resolve(spec.p)); continue; }

      const at = { x: originX + box.x + spec.x, y: originY + box.y + CONTENT_TOP + spec.y };
      const built = KINDS[spec.kind](parameter, spec, at);
      controls.push(...built.controls);
      if (built.caption) {
        controls.push(label(built.caption.text, {
          x: built.caption.x, y: built.caption.y, w: built.caption.w,
          h: built.caption.lines === 2 ? 22 : 12,
        }, { size: 9, colour: SKIN.label }));
      }
    }
  }

  return { controls, missing };
}

const NOTES = `Roland GAIA SH-01 — editor panel.

Generated by tools/scripts/gaia-panel/make-gaia-panel.mjs from
CE/profiles/test/roland-gaia-sh01.ceditor-device.json. Do not hand-edit — change layout.mjs.

The layout is the instrument's
  Left to right is the signal path, the way the SH-01 prints it: LFO -> OSC -> FILTER -> AMP.
  Blue for the LFO, amber for OSC/FILTER/AMP, the same as the panel. Envelopes are fader banks,
  not knobs. WAVE, FILTER MODE, LFO SHAPE and the rest are LED columns with every option visible,
  not dropdowns — because that is how you read them on the hardware.

Three tones, all visible
  The instrument has one strip and a TONE SELECT button, because it has one set of knobs. A screen
  does not need that compromise, so all three are here. MOD LFO is set apart in grey: it is a real
  part of every tone but it is not on the front panel, so it should not look like it is.

The effects are honest, not pretty
  The hardware's EFFECTS section is SELECT CONTROL, CONTROL 1/2/3 and LEVEL — five knobs whose
  meaning changes with the effect type. The MIDI implementation names those addresses "Distortion
  Parameter 1..32" and never says which one CONTROL 1 turns; that mapping lives in the owner's
  manual. So this shows the type selector and the first four parameters under Roland's own names.
  Labels that looked right and were wrong would be worse.

Not here
  No keyboard: this edits a patch, and the synth has its own keys. No arpeggio pattern grid — that
  is 528 values of step data, which belongs to an Arpeggiator component and a dump.`;

export function buildGaiaPanel() {
  const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  seq = 0;

  const panel = createPanel('Roland GAIA SH-01');
  const controls = [];
  const missing = [];

  // The dark control plate the sections sit on, and the white body around it. Emitted first so
  // everything else lands on top — the panel has no z-order beyond document order.
  const PLATE_INSET = 10;
  const plate = createControl('Background', {
    Core: { id: 'gaia_plate', name: 'plate' },
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

  // Header, then three tone strips, then arpeggio + effects.
  let y = 26;
  const common = buildStrip(COMMON_STRIP, byId, { originX: 16, originY: y });
  controls.push(...common.controls);
  missing.push(...common.missing);
  y += COMMON_STRIP.height;

  for (const tone of [1, 2, 3]) {
    controls.push(label(`TONE ${tone}`, { x: 16, y: y - 2, w: 90, h: 16 }, { size: 12, bold: true, colour: 'FFE8EEF4', align: 'left' }));
    const strip = buildStrip(TONE_STRIP, byId, {
      originX: 16,
      originY: y + 16,
      // The one line that makes three strips out of one spec.
      resolve: (id) => (id.startsWith('common.') || id.startsWith('master.') ? id : `tone${tone}.${id}`),
    });
    controls.push(...strip.controls);
    missing.push(...strip.missing);
    y += TONE_STRIP.height + 18;
  }

  const effects = buildStrip(EFFECTS_STRIP, byId, { originX: 16, originY: y });
  controls.push(...effects.controls);
  missing.push(...effects.missing);
  y += EFFECTS_STRIP.height;

  if (missing.length) {
    throw new Error(`layout.mjs places parameters the profile does not have:\n  ${[...new Set(missing)].join('\n  ')}`);
  }

  // The instrument's own branding, bottom-left on the white body exactly where Roland prints it.
  const brandY = y + 16;
  controls.push(label('Roland', { x: 26, y: brandY, w: 120, h: 30 }, { size: 24, bold: true, colour: 'FF23282D', align: 'left' }));
  controls.push(label('GAIA', { x: 150, y: brandY - 2, w: 130, h: 34 }, { size: 28, bold: true, colour: 'FFB0161C', align: 'left' }));
  controls.push(label('SYNTHESIZER  SH-01', { x: 286, y: brandY + 12, w: 220, h: 14 }, { size: 10, colour: 'FF5A626A', align: 'left' }));

  plate._children.Transform.height = y - PLATE_INSET + 4;

  panel.controls = controls;
  panel.width = PANEL_WIDTH;
  panel.height = brandY + 46;
  panel.bgColour = SKIN.panelBg;
  panel.gridEnabled = false;
  panel.snapToGrid = false;
  panel.description = 'Roland GAIA SH-01 — all three tones, laid out like the instrument';
  panel.requiredProfiles = [{ role: 'primary', profileId: profile.id, version: '*' }];
  panel.notepad = { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: NOTES }] };
  panel.panelGuid = 'a1a7c3e0-5f21-4b8e-9d44-6ca0f2b71e93';
  panel.scriptId = 'roland_gaia_sh01';
  panel.filePath = null;

  return panel;
}

export function serializeGaiaPanel() {
  return `${serializePanel(buildGaiaPanel())}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const out = path.resolve(REPO, args.find((a) => !a.startsWith('--')) ?? DEFAULT_OUT);
  const json = serializeGaiaPanel();

  if (check) {
    let current = null;
    try { current = readFileSync(out, 'utf8'); } catch { /* missing counts as stale */ }
    if (current === json) { console.log('GAIA panel is up to date.'); return; }
    console.error(`Stale: ${path.relative(REPO, out)} — run: node tools/scripts/gaia-panel/make-gaia-panel.mjs`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json);
  const panel = JSON.parse(json);
  console.log(`Wrote ${path.relative(REPO, out)}  (${panel.controls.length} controls, ${panel.width}x${panel.height}, ${(json.length / 1024).toFixed(0)} KB)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
