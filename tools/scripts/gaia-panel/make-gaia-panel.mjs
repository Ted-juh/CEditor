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
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';
import { ARP_STRIP, COMMON_STRIP, EFFECTS_STRIP, PANEL_WIDTH, SKIN, TONE_STRIP } from './layout.mjs';
import { gaiaArpGrid, gaiaEnvelope, gaiaFader, gaiaKnob, gaiaLeds, gaiaSectionTab, gaiaHardwareSyncStatus } from './components.mjs';
import { ARP_LANES, arpBridgeScript } from './arp-bridge.mjs';
import { EFFECT_PARAMETER_NAMES, effectLabelScript } from './effect-parameters.mjs';
import { effectProbeScript } from './effect-probe.mjs';
import { presetNamesScript } from './preset-names.mjs';
import { applyArpeggioLabels } from './arpeggio-labels.mjs';
import { applyStatusDisplay, moveStatusDisplayToBottom } from './status-display.mjs';
import { applyEditableEnvelopes } from './editable-envelopes.mjs';
import { readCommitted } from '../readCommitted.mjs';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { applyToneControls } from './tone-controls.mjs';
import { applyPerformanceLayout } from './performance-layout.mjs';
import { applyGaiaTabStyle } from './tab-style.mjs';
import { applyCompactHeader } from './compact-header.mjs';
import { applyWidescreenLayout } from './widescreen-layout.mjs';
import { applySectionTree } from './section-tree.mjs';
import { migrateDottedControlNames } from '../../../CE/web/src/CE_Application/utils/controlNames.js';

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
 * device by that name, so all 189 bindings resolved no mapping and failed with "Not sent: unresolved
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

/**
 * A caption is named after the control it captions, so the component tree says what it is: `label`
 * a hundred and seventy times said nothing. Underscores, not dots — a script path ends the control
 * name at its first dot.
 */
function captionName(control, parameter) {
  return `${String(control?._children?.Core?.name ?? parameter.id).replace(/[^A-Za-z0-9]+/g, '_')}_label`;
}

function label(text, { x, y, w, h = 16 }, { size = 9, colour = SKIN.labelDim, bold = false, align = 'center', name = 'label' } = {}) {
  // maxLines follows the text, rather than always allowing two. Reserving a second line in a
  // single-line box pushed the block past the box height and clipped the glyph bottoms — "NAME"
  // rendered as "NAMF", "SHAPE" as "SHAPF". A capital E losing its bottom bar is not a subtle
  // failure; it just does not look like a word.
  const lines = String(text).includes('\n') ? 2 : 1;
  return createControl('Label', {
    // A caption under a control is named for it (captionName); the effect parameter captions keep
    // the names their generated script finds them by. 'label' is left only on loose text, which
    // the section pass names for the section it lands in.
    Core: { id: nextId('lbl'), name },
    Transform: { x, y, width: w, height: h },
    Text: {
      content: text,
      _children: {
        Font: { size, bold, weight: bold ? 'Bold' : 'Regular', weightValue: bold ? 700 : 400, letterSpacing: 0.3 },
        Fill: { colour },
        Position: { justification: align === 'center' ? 'centred' : align },
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

  const tabWidth = Math.min(box.w - 4, Math.max(64, box.title.length * 9 + 22));
  const tab = gaiaSectionTab({ title: box.title, width: tabWidth, height: 20, tint: box.tint });
  tab._children.Core.id = nextId('tab');
  tab._children.Core.name = `tab_${box.title}`;
  Object.assign(tab._children.Transform, { x: x + 2, y: y + 2, width: tabWidth, height: 20 });

  // An optional printed caveat along the bottom of the box, where whoever is looking at the knobs
  // will see it. The notepad already says this; the notepad is not where anyone is looking.
  if (!box.note) return [frame, tab];
  return [frame, tab, label(box.note, { x: x + 8, y: y + box.h - 15, w: box.w - 16, h: 12 },
    { size: 7, colour: SKIN.labelDim, align: 'center' })];
}

/**
 * The slim rail over each repeated voice.
 *
 * Three complete tone strips are the screen's main advantage over the hardware, but without a
 * shared rail they looked like fifteen unrelated boxes. This line binds the boxes into one voice
 * and prints the same left-to-right signal path Roland uses on the top panel.
 */
function toneFlowHeader(tone, y) {
  const rail = createControl('Background', {
    Core: { id: nextId('voice_rail'), name: `tone${tone}.signalFlow` },
    Transform: { x: 16, y, width: 1560, height: 18 },
    Background: {
      _children: {
        Fill: { colour: 'FF1C2125' },
        Border: { enabled: true, thickness: 1, colour: 'FF46515B' },
        Corners: { radius: 4 },
      },
    },
  });
  const lamp = createControl('Background', {
    Core: { id: nextId('voice_lamp'), name: `tone${tone}.lamp` },
    Transform: { x: 24, y: y + 5, width: 8, height: 8 },
    Background: {
      _children: {
        Fill: { colour: 'FFFF3B30' },
        Border: { enabled: true, thickness: 1, colour: 'FF210908' },
        Corners: { radius: 999 },
      },
    },
  });
  return [
    rail,
    lamp,
    label(`TONE ${tone}`, { x: 38, y: y + 1, w: 82, h: 16 },
      { size: 11, bold: true, colour: 'FFE8EEF4', align: 'left' }),
    label('VOICE SIGNAL PATH', { x: 124, y: y + 1, w: 140, h: 16 },
      { size: 8, colour: SKIN.labelDim, align: 'left' }),
    label('AUDIO: OSC  →  FILTER  →  AMP     ·     LFO: PITCH / FILTER / AMP MODULATION', { x: 292, y: y + 1, w: 900, h: 16 },
      { size: 9, bold: true, colour: 'FFC6D0D8' }),
    label('MOD LFO · MIDI-ONLY VOICE MODULATION', { x: 1284, y: y + 1, w: 286, h: 16 },
      { size: 8, colour: SKIN.labelDim, align: 'right' }),
  ];
}

/**
 * What the effect-caption relabel script needs to address, resolved from the built panel.
 *
 * BY CONTROL ID, not by name. Every bound control here is named after its parameter —
 * "distortion.type" — and the script path syntax splits on dots, so `get("distortion.type")` looks
 * for a control called "distortion" and finds nothing. findControlByName matches ids as well, and
 * the ids are dot-free, so those are what get baked in.
 *
 * Returns only the effects whose four captions AND type selector were all found: a partial block
 * would produce a script that renames three captions and leaves the fourth reading whatever it was.
 */
function effectLabelBlocks(controls, byId) {
  const byName = new Map();
  for (const control of controls) {
    const core = control?._children?.Core;
    if (core?.name && !byName.has(core.name)) byName.set(core.name, core.id);
  }

  const blocks = {};
  for (const effect of ['distortion', 'flanger', 'delay', 'reverb']) {
    const typeControlId = byName.get(`${effect}.type`);
    const captionIds = Array.from({ length: 4 }, (unused, i) => byName.get(`${effect}.parameter${i + 1}.caption`));
    if (!typeControlId || captionIds.some((id) => !id)) continue;

    // Wire value -> printed label, straight from the profile's own choice list, so the script does
    // no label matching and cannot disagree with the profile about capitalisation.
    const labelByValue = {};
    for (const choice of byId.get(`${effect}.type`)?.choices ?? []) labelByValue[choice.value] = choice.label;
    blocks[effect] = { captionIds, typeControlId, labelByValue };
  }
  return blocks;
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
  // GAIA OFF/ON selectors use boolean buttons, not an enum cycler with no enumValues.
  if (type === 'ToggleButton' && parameter.choices?.length === 2
    && parameter.choices.some(c => c.value === 0) && parameter.choices.some(c => c.value === 1)) {
    control._children.Behavior.valueType = 'bool';
    control._children.Behavior.defaultValue = parameter.choices.find(c => c.id === parameter.default)?.value === 1;
  }
  if (type === 'Number') control._children.Behavior.defaultValue = parameter.default;
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
      // createValueChannel picked the precision from the type it was BUILT with (float, 2 decimals)
      // and the type is being corrected here. Leaving it made every whole-numbered synth parameter
      // read "64.00" the moment anything formatted it.
      channel.format = { ...channel.format, precision: channel.type === 'float' ? 2 : 0 };
    }
    // BOTH, and this is the whole point: customChannelDefaultValue reads `currentValue ?? defaultValue`,
    // and createValueChannel stamped currentValue from the factory default before this ran. Setting
    // only defaultValue left currentValue at 0, so every knob and fader on the panel opened at the
    // bottom of its range instead of at the value the instrument ships with — a filter shut, a
    // master tune at -100 cent — and looked, convincingly, like a panel with no values in it.
    if (typeof parameter.default === 'number') {
      channel.defaultValue = parameter.default;
      channel.currentValue = parameter.default;
    }

    // The range the INSTRUMENT prints, when it is not the range on the wire. Octave Shift is
    // stored 61..67 and reads -3..+3; every MFX parameter is stored 12768..52768 and reads
    // -20000..+20000. Without this a knob shows the wire number, which is not wrong by a rounding
    // — it is wrong by a constant, on every bipolar parameter the machine has.
    const displayMin = Number(parameter.display?.min);
    const displayMax = Number(parameter.display?.max);
    if (Number.isFinite(displayMin) && Number.isFinite(displayMax)
      && (displayMin !== parameter.range?.min || displayMax !== parameter.range?.max)) {
      channel.format = { ...channel.format, displayMin, displayMax };
    }
    if (parameter.display?.unit) channel.format = { ...channel.format, unit: String(parameter.display.unit) };
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

    const w = spec.w ?? SKIN.ledW;
    const build = () => gaiaLeds({ options, width: w, rowHeight: SKIN.ledRow });
    const h = options.length * SKIN.ledRow + 8;
    const control = boundCustom(parameter, build, { x: at.x, y: at.y, w, h });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x + 3, y: at.y - 14, w: w - 3, align: 'left' } : null, bottom: at.y + h };
  },

  // Same component at the pre-glyph width, for option lists the instrument prints as words —
  // FILTER SLOPE, an effect TYPE, D BEAM POLARITY. Giving those a glyph gutter would be 32px of
  // nothing in a box that has none to spare.
  ledsNarrow: (parameter, spec, at) => {
    const options = (parameter.choices ?? []).map((choice) => ({ label: choice.label, value: choice.value }));
    if (options.length === 0) return KINDS.ledsLegacy(parameter, spec, at);
    const w = spec.w ?? 104;
    const h = options.length * SKIN.ledRow + 8;
    const control = boundCustom(parameter, () => gaiaLeds({ options, width: w, rowHeight: SKIN.ledRow }), { x: at.x, y: at.y, w, h });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x + 3, y: at.y - 14, w: w - 3, align: 'left' } : null, bottom: at.y + h };
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
    const control = bound(parameter, 'ToggleButton', { x: at.x, y: at.y, w: spec.w ?? 80, h: spec.h ?? 22 }, {
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
    const selected = control._children.States?._children?.Selected;
    if (selected) selected.patches.component = { 'Background.Fill.colour': 'FFAA3445', 'Background.Border.colour': 'FFFF7B8B', 'Text.Fill.colour': 'FFFFFFFF' };
    return { controls: [control], caption: spec.caption ? { text: spec.caption, x: at.x, y: at.y - 20, w: spec.w ?? 80 } : null, bottom: at.y + (spec.h ?? 22) };
  },

  combo: (parameter, spec, at) => {
    const control = bound(parameter, 'Combobox', { x: at.x, y: at.y, w: spec.w ?? 100, h: 24 });
    return { controls: [control], caption: spec.label ? { text: spec.label, x: at.x, y: at.y - (spec.captionOffset ?? 13), w: spec.w ?? 100 } : null, bottom: at.y + 24 };
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
        controls.push(label(env.title, { x, y: y - 13, w: env.w, h: 13 }, { size: 8, colour: SKIN.labelDim, name: `env_${env.bind.replace(/\W+/g, '_')}_title` }));
      }
    }

    if (box.grid) {
      const g = box.grid;
      controls.push(label('RULER: CLICK / DRAG = END STEP     |     NOTE: LEFT = MOVE   ·   MIDDLE = VELOCITY   ·   RIGHT = LENGTH   ·   SHIFT = FINE',
        { x: originX + box.x + g.x, y: originY + box.y + 23, w: g.w, h: 16 },
        { size: 9, colour: SKIN.labelDim, align: 'left', name: 'arp_gesture_guide' }));
      const grid = placeStatic(gaiaArpGrid({ width: g.w, height: g.h, steps: g.steps }),
        'arp_pattern_grid', { x: originX + box.x + g.x, y: originY + box.y + CONTENT_TOP + g.y, w: g.w, h: g.h });
      grid._children.Designer.patternEditing = { kind: 'gaia', mode: 'manual' };
      grid._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, bindings: [{
        kind: 'deviceParameter', port: 'arpEndStep', deviceRole: DEVICE_NAME,
        parameterId: 'arp.endStep', parameterType: byId.get('arp.endStep').type,
        adoptMetadata: false, dryRun: false,
        feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
      }] };
      controls.push(grid);
    }

    for (const spec of box.controls) {
      const parameter = byId.get(resolve(spec.p));
      if (!parameter) { missing.push(resolve(spec.p)); continue; }

      const at = { x: originX + box.x + spec.x, y: originY + box.y + CONTENT_TOP + spec.y };
      const built = KINDS[spec.kind](parameter, spec, at);
      // Reserve the retired knob/caption IDs so existing panels and scripts keep stable IDs.
      if (!spec.rulerOnly) controls.push(...built.controls);
      if (built.caption) {
        const caption = label(built.caption.text, {
          x: built.caption.x, y: built.caption.y, w: built.caption.w,
          h: built.caption.lines === 2 ? 26 : 16,
        }, { size: 9, colour: SKIN.label, align: built.caption.align ?? 'center', name: spec.captionName ?? captionName(built.controls[0], parameter) });
        if (!spec.rulerOnly) controls.push(caption);
      }
    }
  }

  return { controls, missing };
}

const NOTES = `Roland GAIA SH-01 — editor panel.

Generated by tools/scripts/gaia-panel/make-gaia-panel.mjs from
CE/profiles/test/roland-gaia-sh01.ceditor-device.json. Do not hand-edit — change layout.mjs.

The layout is the instrument's:
  Audio flows OSC -> FILTER -> AMP; the LFO separately modulates those sections.
  Blue for the LFO, amber for OSC/FILTER/AMP/EFFECTS, the same as the panel. Envelopes are fader banks,
  not knobs, with an editable envelope curve over each bank in the silkscreen's position. WAVE,
  FILTER MODE, LFO SHAPE and the rest are LED columns with every option visible, not dropdowns —
  because that is how you read them on the hardware — and each option carries its wave GLYPH, not
  the word for it, for the same reason.

  The envelope graphs share their stage values with the faders, including incoming MIDI updates.
  Drag A/D/R horizontally; D vertically sets sustain level. S moves horizontally at D height,
  changing only the illustrated key-hold duration (not a synth parameter). Shift-drag is fine.
  A/D/S/R keys select a handle,
  arrows adjust it, and Escape restores a cancelled drag. Graphs show relative stage settings,
  not calibrated milliseconds. The oscillator has AD only; filter and amp each have ADSR.

Three tones, all visible
  The instrument has one strip and a TONE SELECT button, because it has one set of knobs. A screen
  does not need that compromise, so all three are here and every MIDI-exposed tone parameter is
  present. MOD LFO is set apart in grey: it is a real part of every tone but it is not on the front
  panel, so it should not look like it is.

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
  edge to lengthen it. It reaches the synth: the panel script "Arpeggio pattern -> synth" turns
  the blocks into the sixteen lanes the GAIA stores and writes them. A block of length 4 is one
  velocity followed by three ties (128), not four velocities — four velocities is four retriggers,
  and it sounds like a stutter rather than a held note.

  Two things worth knowing about it. It writes only what CHANGED: 528 messages per pointer move
  would be seconds of MIDI for dragging one block one step, so the script keeps the last lanes it
  sent and diffs. And the GAIA has sixteen lanes while the grid does not stop you drawing a
  seventeenth note — the extra notes are not sent, and the script says which ones in the console
  rather than dropping them quietly.

  The grid's note rows are still a 12-row piano-roll view rather than the hardware's sixteen fixed
  lanes; the lanes are assigned by ascending note when the pattern is written.

Patch bank names
  Open PATCH BANKS, choose USER / PRESET / USB / PCM, then READ NAMES FROM GAIA.
  Every slot shows its bank number and the actual twelve-character name returned by the synth.
  USER reads use 20 nn 00 00 directly and do not change the selected sound.
  PRESET, USB and PCM reads select each patch, verify System bank/program, and read 10 00 00 00.
  Save unsaved edits before those scans; the confirmation explains this. No stored patch is written.
  The original patch is reselected on completion or STOP, but unsaved edits cannot be recovered.
  Names are cached with the panel (save it after scanning); [not read] is explicitly unknown.
  A timeout or invalid reply does not replace a cached name. Refresh USER/USB after changing patches.

Not here
  No keyboard: this edits a patch, and the synth has its own keys.`;

function tabs(name, x, y, width, height, pages, stripSize = 28) {
  const control = createControl('TabContainer', {
    Core: { id: nextId(name), name }, Transform: { x, y, width, height },
    TabContainer: { pages: pages.map(({ id, title }) => ({ id, label: title })), pageIndex: 0,
      stripSize, stripColour: SKIN.plate, tabColour: 'FF252C32', activeTabColour: 'FF8894A0',
      labelColour: 'FFBAC5CE', activeLabelColour: 'FF10171D' },
    Children: { padding: 0, clipChildren: true },
    Background: { _children: { Fill: { colour: SKIN.plate }, Border: { enabled: false } } },
  });
  control._children.Children._children = {};
  for (const page of pages) for (const child of page.controls) {
    child._children.Core.tabPageId = page.id;
    control._children.Children._children[child._children.Core.id] = child;
  }
  return control;
}

function patchBanks(profile, scripts) {
  const pages = ['preset', 'user', 'usb', 'preset-pcm'].map((bankId) => {
    const bank = profile.presets.banks.find((b) => b.id === bankId);
    const controls = [];
    const groups = bank.slotCount / 8;
    for (let group = 0; group < groups; group++) {
      const letter = 'ABCDEFGH'[group];
      const x = 8 + group * 194;
      controls.push(label(bankId === 'preset-pcm' ? 'PCM' : `BANK ${letter}`, { x, y: 2, w: 182, h: 16 }, { bold: true, size: 10 }));
      controls.at(-1)._children.Core.name = `patch_bank_header_${bankId.replace(/-/g, '_')}_${letter}`;
      for (let note = 0; note < 8; note++) {
        const slot = bank.startSlot + group * 8 + note;
        const name = `recall_${bankId.replace(/-/g, '_')}_${letter}${note + 1}`;
        const button = createControl('Button', {
          Core: { id: nextId(name), name, description: `Recall ${bank.label} ${letter}-${note + 1}; does not store or overwrite a patch.` },
          Transform: { x, y: 22 + note * 19, width: 182, height: 17 },
          Text: { content: `${bankId === 'preset-pcm' ? `PCM ${note + 1}` : `${letter}-${note + 1}`}  [not read]`, _children: { Font: { size: 11 }, Position: { justification: 'left' } } },
          Background: { _children: { Fill: { colour: 'FF333D46' }, Border: { thickness: 1, colour: 'FF65717C' }, Corners: { radius: 3 } } },
          ContentLayout: { horizontalAlign: 'left', paddingLeft: 8, paddingRight: 4, paddingTop: 0, paddingBottom: 0 },
        });
        controls.push(button);
        scripts.push(createScript({ id: name, name: `Recall ${bank.label} ${letter}-${note + 1}`, scope: 'panel', target: name,
          language: 'javascript', event: 'onClick',
          source: `function onClick() { run("gaiaNamesRecall", ${slot}); }` }));
      }
    }
    if (groups === 1) controls.push(label('PCM PRESETS  ·  8 SLOTS\nPatch recall only — no memory writes.', { x: 220, y: 55, w: 800, h: 60 }, { size: 14, align: 'left' }));
    for (const [suffix, title, x, width, action, arg] of [
      ['read', 'READ NAMES FROM GAIA', 8, 182, 'gaiaNamesScan', bankId],
      ['stop', 'STOP', 202, 76, 'gaiaNamesStop', null],
    ]) {
      const name = `names_${suffix}_${bankId.replace(/-/g, '_')}`;
      controls.push(createControl('Button', {
        Core: { id: nextId(name), name },
        Transform: { x, y: 178, width, height: 22 },
        Text: { content: title, _children: { Font: { size: 10 } } },
        Background: { _children: { Fill: { colour: 'FF333D46' }, Border: { thickness: 1, colour: 'FF65717C' }, Corners: { radius: 3 } } },
      }));
      scripts.push(createScript({ id: name, name: title, scope: 'panel', target: name, language: 'javascript', event: 'onClick',
        source: `function onClick() { run(${JSON.stringify(action)}, ${JSON.stringify(arg)}); }` }));
    }
    const info = label('READ NAMES fetches actual patch names from the connected GAIA.', { x: 290, y: 178, w: 1258, h: 22 }, { size: 10, align: 'left' });
    // Explicit IDs do not disturb IDs referenced by previously saved panel scripts.
    const checkName = `names_check_${bankId.replace(/-/g, '_')}`;
    controls.push(createControl('Button', {
      Core: { id: `gaia_${checkName}`, name: checkName, tooltip: 'Read current bank/program without changing sounds or writing memory.' },
      Transform: { x: 290, y: 178, width: 132, height: 22 },
      Text: { content: 'CHECK SELECTION', _children: { Font: { size: 10 } } },
      Background: { _children: { Fill: { colour: 'FF333D46' }, Border: { thickness: 1, colour: 'FF65717C' }, Corners: { radius: 3 } } },
    }));
    scripts.push(createScript({ id: checkName, name: 'Check current patch', scope: 'panel', target: checkName, language: 'javascript', event: 'onClick',
      source: 'function onClick() { run("gaiaNamesCheck"); }' }));
    info._children.Transform.x = 434;
    info._children.Transform.width = 1114;
    info._children.Text._children.Font.size = 9;
    info._children.Core.name = `names_status_${bankId.replace(/-/g, '_')}`;
    controls.push(info);
    return { id: bank.id, title: bankId === 'preset' ? 'PRESET / ROM' : bankId === 'usb' ? 'USB MEMORY' : bankId === 'user' ? 'USER' : 'PCM / ROM', controls };
  });
  return tabs('patch_banks', 0, 0, 1560, 228, pages, 24);
}

function systemPage(byId) {
  const controls = [];
  const groups = [
    { title: 'MASTER / CLOCK', x: 0, w: 252, ids: ['masterLevel', 'masterTune', 'patchRemain', 'clockSource', 'tempo', 'powerSave'], labels: ['MASTER LEVEL', 'TUNE (cent)', 'PATCH REMAIN', 'CLOCK SOURCE', 'TEMPO (BPM)', 'POWER SAVE'] },
    { title: 'CONTROLLERS', x: 262, w: 270, ids: ['keyboardVelocity', 'pedalPolarity', 'pedalAssign', 'dBeamSens', 'rxTxChannel'], labels: ['KEY VELOCITY', 'PEDAL POLARITY', 'PEDAL ASSIGN', 'D BEAM SENS', 'MIDI CHANNEL'] },
    { title: 'MIDI', x: 542, w: 280, ids: ['midiUsbThru', 'softThru', 'rxProgramChange', 'rxBankSelect', 'remoteKeyboard', 'txProgramChange', 'txBankSelect', 'txEditData'], labels: ['MIDI–USB THRU', 'SOFT THRU', 'RX PROGRAM', 'RX BANK', 'REMOTE KEYBOARD', 'TX PROGRAM', 'TX BANK', 'TX EDIT DATA'] },
    { title: 'RECORDER / ADDRESS', x: 832, w: 310, ids: ['recorderSyncOutput', 'metronomeMode', 'metronomeLevel', 'bankSelectMsb', 'bankSelectLsb', 'programNumber'], labels: ['SYNC OUTPUT', 'METRONOME', 'CLICK LEVEL', 'BANK MSB (RAW)', 'BANK LSB (RAW)', 'PROGRAM (0–127)'] },
  ];
  for (const group of groups) {
    controls.push(...sectionBox({ ...group, y: 0, h: 292, tint: 'FF98A4AE' }, 0, 0));
    group.ids.forEach((id, i) => {
      const parameter = byId.get(`system.${id}`);
      if (!parameter) throw new Error(`Missing System parameter ${id}`);
      const y = 38 + i * 29;
      const inputWidth = group.title === 'CONTROLLERS' ? 130 : 112;
      const x = group.x + group.w - inputWidth - 10;
      controls.push(label(group.labels[i], { x: group.x + 8, y, w: x - group.x - 14, h: 23 }, { size: 9, align: 'left', name: `system_${id}_label` }));
      const input = bound(parameter, parameter.choices ? 'Combobox' : 'Number', { x, y, w: inputWidth, h: 23 });
      controls.push(input);
    });
  }
  const x = 1152;
  controls.push(...sectionBox({ title: 'USER PATCH WRITE PROTECT', x, y: 0, w: 408, h: 292, tint: 'FF98A4AE' }, 0, 0));
  controls.push(label('LIT = PROTECTED   ·   Click one slot to change', { x: x + 8, y: 27, w: 390, h: 16 }, { size: 9, align: 'left' }));
  for (let bank = 0; bank < 8; bank++) {
    for (let slot = 1; slot <= 8; slot++) {
      const key = `${'ABCDEFGH'[bank]}${slot}`;
      const parameter = byId.get(`system.writeProtect${key}`);
      controls.push(...KINDS.toggle(parameter, { label: `${'ABCDEFGH'[bank]}-${slot}`, w: 44, h: 23 },
        { x: x + 10 + slot * 48 - 48, y: 52 + bank * 28 }).controls);
    }
  }
  // None of this is a DAW parameter. These are the instrument's settings, not the patch's: a MIDI
  // channel or a write-protect flag that a host lane could move mid-song is a hazard, not a feature,
  // and the plugin window still edits every one of them.
  for (const control of controls) control._children.Core.hostAutomation = false;
  return controls;
}

/**
 * The GAIA panel. `sections: false` stops before the section pass, at the flat layout every other
 * pass works on — for checking that those passes are idempotent, which they can only be on the
 * shape they were written for.
 */
export function buildGaiaPanel({ sections = true } = {}) {
  const profile = JSON.parse(readFileSync(PROFILE, 'utf8'));
  const byId = new Map(profile.parameters.map((p) => [p.id, p]));
  seq = 0;

  const panel = createPanel('Roland GAIA SH-01');
  const controls = [];
  const missing = [];
  const bankScripts = [];

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
  const common = buildStrip(COMMON_STRIP, byId, { originX: 0, originY: 0 });
  controls.push(tabs('top_pages', 16, y, 1560, 256, [
    { id: 'controls', title: 'CONTROLS', controls: common.controls },
    { id: 'banks', title: 'PATCH BANKS — RECALL', controls: [patchBanks(profile, bankScripts)] },
  ]));
  missing.push(...common.missing);
  y += 264;

  for (const tone of [1, 2, 3]) {
    controls.push(...toneFlowHeader(tone, y - 2));
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

  const arp = buildStrip(ARP_STRIP, byId, { originX: 0, originY: 0 });
  const feedback = gaiaHardwareSyncStatus();
  Object.assign(feedback._children.Core, { id: 'gaia_hardware_sync_status', name: 'gaia_hardware_sync_status' });
  Object.assign(feedback._children.Transform, { x: 196, y: 2 });
  arp.controls.push(feedback); // Dedicated ID: inserting this must not renumber existing controls.
  controls.push(tabs('bottom_pages', 16, y, 1560, 320, [
    { id: 'arpeggiator', title: 'ARPEGGIATOR', controls: arp.controls },
    { id: 'system', title: 'SYSTEM', controls: systemPage(byId) },
  ]));
  missing.push(...arp.missing);
  y += 328;

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
  panel.description = 'Roland GAIA SH-01 — three complete tones, hardware-style signal flow, 32-step arpeggiator';
  panel.requiredProfiles = [{ role: DEVICE_NAME, profileId: profile.id, version: '*' }];
  panel.notepad = { activeNoteIndex: 0, notes: [{ name: 'About this panel', content: NOTES }] };
  // The grid actually reaches the synth now — see arp-bridge.mjs. A panel-scope script rather than
  // a binding because 528 addresses driven by one array channel is not a shape bindings have, and
  // because the write has to DIFF: sending all 528 on every pointer move during a drag is seconds
  // of MIDI for moving one block one step.
  panel.scripts = [createScript({
    id: 'gaia_arp_pattern_bridge',
    enabled: false, // Replaced by explicit, validated Read/Send Pattern in the grid toolbar.
    name: 'Arpeggio pattern → synth',
    language: 'javascript',
    scope: 'panel',
    event: 'onPanelLoad',
    target: '*',
    description: 'Writes the drawn arpeggio grid to the GAIA\'s sixteen Patch Arpeggio Pattern blocks.',
    source: arpBridgeScript('arp_pattern_grid', { lanes: ARP_LANES, steps: ARP_STRIP.boxes[0].grid.steps }),
  }), createScript({
    id: 'gaia_preset_names', name: 'Patch bank names from GAIA', language: 'javascript',
    scope: 'panel', event: 'onPanelLoad', target: '*',
    description: 'Reads and caches real SH-01 patch names. User reads never select a patch. ROM/USB scans ask before switching sounds.',
    source: presetNamesScript(profile, DEVICE_NAME),
  }), ...bankScripts];

  // The effect knobs' captions, IF anyone has filled in the names table. Null while it is empty,
  // so the panel carries no dead script waiting for the owner's manual — see effect-parameters.mjs.
  const relabel = effectLabelScript(effectLabelBlocks(flatControls(controls), byId));
  if (relabel) {
    panel.scripts.push(createScript({
      id: 'gaia_effect_parameter_labels',
      name: 'Effect captions → selected type',
      language: 'javascript',
      scope: 'panel',
      event: 'onPanelLoad',
      target: '*',
      description: 'Renames each effect block\'s four parameter captions when its TYPE selector moves.',
      source: relabel,
    }));
  }

  // And the probe that fills that table in, for whoever has the instrument. DISABLED: it is a
  // diagnostic with three console actions, not something a panel should be running. The names it
  // helps establish are the last thing standing between the effect knobs and real captions, and
  // the MIDI implementation cannot supply them — but the hardware can, one knob at a time.
  panel.scripts.push(createScript({
    id: 'gaia_effect_probe',
    name: 'Effect probe (diagnostic)',
    language: 'javascript',
    scope: 'panel',
    event: 'onPanelLoad',
    target: '*',
    enabled: false,
    description: 'Asks the GAIA which MFX Parameter each effect knob drives. Enable, run '
      + 'fxProbe/fxMark/fxReport from the console, then disable again.',
    source: effectProbeScript(Object.fromEntries(Object.keys(EFFECT_PARAMETER_NAMES).map((effect) => [effect, {
      requestId: `request${effect[0].toUpperCase()}${effect.slice(1)}`,
      parameterPrefix: `${effect}.parameter`,
      // Counted from the profile rather than assumed: distortion has 32 slots, the other three 20.
      slots: profile.parameters.filter((p) => p.id.startsWith(`${effect}.parameter`)).length,
    }]))),
  }));
  panel.panelGuid = 'a1a7c3e0-5f21-4b8e-9d44-6ca0f2b71e93';
  panel.scriptId = 'roland_gaia_sh01';
  panel.filePath = null;

  // Sectioning is last: it works on the finished geometry, so no layout pass has to know about nesting.
  const flat = applyWidescreenLayout(applyGaiaTabStyle(applyCompactHeader(applyPerformanceLayout(moveStatusDisplayToBottom(applyToneControls(applyEditableEnvelopes(applyStatusDisplay(applyArpeggioLabels(panel), profile))))))));
  // Names last of all: every pass above finds controls by their parameter-id names, and the saved
  // panel must carry none of those dots (utils/controlNames.js). The flat layout stays as the
  // passes built it, for the idempotence checks that run them again.
  return sections ? migrateDottedControlNames(applySectionTree(flat)) : flat;
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
    if (readCommitted(out) === json) { console.log('GAIA panel is up to date.'); return; }
    console.error(`Stale: ${path.relative(REPO, out)} — run: node tools/scripts/gaia-panel/make-gaia-panel.mjs`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json);
  const panel = JSON.parse(json);
  console.log(`Wrote ${path.relative(REPO, out)}  (${panel.controls.length} controls, ${panel.width}x${panel.height}, ${(json.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
