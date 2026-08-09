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
import { ARP_STRIP, COMMON_STRIP, EFFECTS_STRIP, PANEL_WIDTH, SKIN, TONE_STRIP } from './layout.mjs';
import { gaiaArpGrid, gaiaEnvelope, gaiaFader, gaiaKnob, gaiaLeds } from './components.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROFILE = path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json');
const DEFAULT_OUT = path.join(REPO, 'CE/panels/Roland GAIA SH-01.cepanel');

/**
 * What this panel calls the instrument it drives.
 *
 * A device is identified by its name — bindings name one, sends name one, and the MIDI settings map
 * that name to a port. So the name has to be one a person would recognise in a list of their gear.
 *
 * This said `primary` by accident, which was worse than ugly: nothing in the app could configure a
 * device by that name, so all 183 bindings resolved no mapping and failed with "Not sent: unresolved
 * profile for primary" whichever port was chosen. Naming it after the instrument means the device
 * shows up in Settings already called the right thing, and anyone who calls their GAIA something
 * else can rename it there — which rewrites these bindings to match.
 */
const DEVICE_NAME = 'Roland GAIA SH-01';

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

function label(text, { x, y, w, h = 16 }, { size = 9, colour = SKIN.labelDim, bold = false, align = 'center' } = {}) {
  // maxLines follows the text, rather than always allowing two. Reserving a second line in a
  // single-line box pushed the block past the box height and clipped the glyph bottoms — "NAME"
  // rendered as "NAMF", "SHAPE" as "SHAPF". A capital E losing its bottom bar is not a subtle
  // failure; it just does not look like a word.
  const lines = String(text).includes('\n') ? 2 : 1;
  return createControl('Label', {
    Core: { id: nextId('lbl'), name: 'label' },
    Transform: { x, y, width: w, height: h },
    Text: {
      content: text,
      _children: {
        Font: { size, bold, weight: bold ? 'Bold' : 'Regular', weightValue: bold ? 700 : 400, letterSpacing: 0.3 },
        Fill: { colour },
        // A caption is one or two short words under a control. Left to its own devices it breaks
        // mid-word — "PORTAMENTO" came out as "PORTAME / NTO" — which no instrument does and no
        // reader forgives. Word wrapping, two lines at most, and shrink rather than break.
        Multiline: { wrapMode: 'word', overflowMode: 'shrink', fitMode: 'shrink', maxLines: lines, lineHeight: 1.1 },
      },
    },
    // Border OFF, explicitly. SECTION_DEFAULTS.Background.Border is `enabled: true` at 2px of
    // FFFFFFFF, so every Label is born inside a thick white rectangle. On a panel made mostly of
    // small captions that is the loudest thing on screen — forty white boxes drowning the controls
    // they name.
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: align, verticalAlign: 'center', paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 },
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
      deviceRole: DEVICE_NAME,
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

  // Same component at the pre-glyph width, for option lists the instrument prints as words —
  // FILTER SLOPE, an effect TYPE, D BEAM POLARITY. Giving those a glyph gutter would be 32px of
  // nothing in a box that has none to spare.
  ledsNarrow: (parameter, spec, at) => {
    const options = (parameter.choices ?? []).map((choice) => ({ label: choice.label, value: choice.value }));
    if (options.length === 0) return KINDS.ledsLegacy(parameter, spec, at);
    const w = 104;
    const h = options.length * SKIN.ledRow + 8;
    const control = boundCustom(parameter, () => gaiaLeds({ options, width: w, rowHeight: SKIN.ledRow }), { x: at.x, y: at.y, w, h });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - 14, w } : null, bottom: at.y + h };
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
      // 12pt in a 22px-tall button is what wrapped PORTAMENTO across two lines and clipped it.
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

/** Place a control that draws but does not bind — an envelope silkscreen, the arpeggio field. */
function placeStatic(control, id, { x, y, w, h }) {
  control._children.Core.id = nextId(id);
  control._children.Core.name = id;
  Object.assign(control._children.Transform, { x, y, width: w, height: h });
  return control;
}

function buildStrip(strip, byId, { originX = 0, originY = 0, resolve = (p) => p }) {
  const controls = [];
  const missing = [];

  for (const box of strip.boxes) {
    controls.push(...sectionBox(box, originX, originY));

    // The printed envelope drawings, before the controls so captions land on top of them.
    for (const env of box.envelopes ?? []) {
      const x = originX + box.x + env.x;
      const y = originY + box.y + CONTENT_TOP + env.y;
      controls.push(placeStatic(gaiaEnvelope({ stages: env.stages, width: env.w, height: env.h }),
        `env_${env.bind.replace(/\W+/g, '_')}`, { x, y, w: env.w, h: env.h }));
      if (env.title) {
        controls.push(label(env.title, { x, y: y - 13, w: env.w, h: 13 }, { size: 8, colour: SKIN.labelDim }));
      }
    }

    if (box.grid) {
      const g = box.grid;
      controls.push(placeStatic(gaiaArpGrid({ width: g.w, height: g.h, steps: g.steps }),
        'arp_pattern_grid', { x: originX + box.x + g.x, y: originY + box.y + CONTENT_TOP + g.y, w: g.w, h: g.h }));
    }

    for (const spec of box.controls) {
      const parameter = byId.get(resolve(spec.p));
      if (!parameter) { missing.push(resolve(spec.p)); continue; }

      const at = { x: originX + box.x + spec.x, y: originY + box.y + CONTENT_TOP + spec.y };
      const built = KINDS[spec.kind](parameter, spec, at);
      controls.push(...built.controls);
      if (built.caption) {
        controls.push(label(built.caption.text, {
          x: built.caption.x, y: built.caption.y, w: built.caption.w,
          h: built.caption.lines === 2 ? 26 : 16,
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
  not knobs, with the envelope curve printed over each bank the way the silkscreen does. WAVE,
  FILTER MODE, LFO SHAPE and the rest are LED columns with every option visible, not dropdowns —
  because that is how you read them on the hardware — and each option carries its wave GLYPH, not
  the word for it, for the same reason.

  The envelope drawings are printed, not driven: they do not move when the faders do. The Envelope
  component declares attack/decay/sustain/release ports, but inbound device sync only reflects
  value / state / selectedChoice / text / brightness / backlight, so wiring them would look live
  and be dead. A drawing that is honestly a drawing beats a control that lies.

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

The arpeggiator is a grid, because that is what it is
  The MIDI implementation has sixteen Patch Arpeggio Pattern blocks at 00 0D 00 .. 00 1C 00, each
  an Original Note plus THIRTY-TWO step slots holding 0 for a rest and 1..127 for a velocity. All
  528 addresses are in the profile now. An earlier draft left them out as "addresses, not
  controls", which was backwards: they are exactly what a step grid writes.

  So the bottom row is the engine's arpeggiator surface — draw a block, drag it, drag its right
  edge to lengthen it. What is NOT wired: the drawn pattern is not written out to those 528
  addresses. The arpPattern channel is read-only by design (customComponentArpeggiator.js: "a
  channel write racing a grid edit has no clean precedence"), and no pattern-to-parameter bridge
  exists yet. The addresses are here so that bridge has somewhere to land. Until it does, this
  grid edits a pattern, not a synth. Its note rows are also a 12-row piano-roll view rather than
  the hardware's sixteen fixed lanes.

Not here
  No keyboard: this edits a patch, and the synth has its own keys.`;

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

  const arp = buildStrip(ARP_STRIP, byId, { originX: 16, originY: y });
  controls.push(...arp.controls);
  missing.push(...arp.missing);
  y += ARP_STRIP.height;

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
  panel.requiredProfiles = [{ role: DEVICE_NAME, profileId: profile.id, version: '*' }];
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
