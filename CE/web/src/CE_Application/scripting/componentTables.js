// componentTables.js — the value sets a component script verb may offer, read from the app.
//
// componentVerbs.js used to carry these as hand-typed literals beside the components. That is a
// bug factory, and it had already gone off once: its own comment records a phase-7 scale list that
// offered "pentatonic" and "chromatic" (which no component understands, so the verb wrote a name
// that silently did nothing) and omitted "pentatonicMaj"/"pentatonicMin" (which they do, so the
// verb refused a value that was perfectly valid).
//
// That fix was applied to scales and nowhere else. It was still true of TWENTY-FOUR of the
// twenty-eight enum verbs — `arp.pattern` accepted "converge" and "diverge", which the Arpeggiator
// has never had, and refused "chord", which it has; `envelope.preset` offered three shapes the
// engine has no case for and hid three it does; `arp.division` offered eight of the transport's
// fourteen note values while `ce.time.divisions()` — same panel, same script — already answered
// from all fourteen.
//
// So there are no literals here that the app does not own. Each table is imported from the module
// whose switch or lookup actually consumes the value, and the two the app had no util module for
// (the LCD's scroll, the Pixel display's animation mode) are pinned by componentEnums.test.js
// against the editor `<select>` that offers them. A verb can only offer what a component reads.

import { SCALE_NAMES } from './musicTheory.js';
import { DIVISION_IDS } from '../utils/transportLayout.js';
import { ARP_PATTERNS, ARP_SOURCES } from '../utils/arpLayout.js';
import { CHORDPAD_MODES, CHORD_TYPES, CHORDPAD_VOICINGS } from '../utils/chordPadLayout.js';
import { RIBBON_MODES } from '../utils/noteRibbonLayout.js';
import {
  PAD_MAPS, PAD_MODES, PAD_ORIGINS, PAD_VELOCITY_SOURCES, PAD_ZONE_ACTIONS,
} from '../utils/drumPadLayout.js';
import { CONSTELLATION_MODES } from '../utils/constellationLayout.js';
import { ROUTER_INPUT_SOURCES } from '../utils/routerLayout.js';
import { POLY_PRESSURE_MODES } from '../utils/midiNoteInput.js';
import { MACRO_CURVES } from '../utils/macroLayout.js';
import { CONSTRAINT_MODES } from '../utils/constraintLayout.js';
import { ENVELOPE_CURVES, ENVELOPE_PRESETS } from '../utils/envelopeLayout.js';
import { RETURN_CURVES, RETURN_MODES } from '../utils/returnToRest.js';
import { CROSSFADER_LAWS } from '../utils/crossfaderLayout.js';
import { JOYSTICK_RETURN_AXES } from '../utils/joystickLayout.js';
import { METER_SCALES } from '../utils/meterLayout.js';
import { TRANSPORT_SOURCES } from '../utils/transportLayout.js';
import { PANIC_SCOPES } from '../utils/panicLayout.js';
import { VOICINGS, HARMONY_MODES, OUT_OF_KEY, VOICE_LEADING } from '../utils/harmoniserLayout.js';
import { RECORDER_SOURCES } from '../utils/noteRecorderLayout.js';

/* The LCD and the Pixel display have no layout module of their own — their behaviour lives in the
 * renderer and the editor. Declared here rather than invented into a new module, and held to the
 * editor's own picker by componentEnums.test.js, which reads the `<select>` out of the .svelte
 * source. Derived by test where it cannot be derived by import. */
export const LCD_SCROLLS = ['off', 'left', 'right'];
export const LCD_CURSORS = ['off', 'block', 'underline'];
export const PIXEL_ANIM_MODES = ['off', 'file', 'preset'];
/* …and the coverage audit's crop. Same rule: each is held to the editor's own `<select>` by
 * componentEnums.test.js, because the value is consumed by a renderer conditional rather than by a
 * table any module exports. `orientation` is spelled by four components and they do NOT agree —
 * the Meter has an arc and the others do not — so they are four entries, not one shared list. */
export const CHORDPAD_LAYOUTS = ['wheel', 'grid'];
export const RIBBON_ORIENTATIONS = ['vertical', 'horizontal'];
export const RIBBON_STYLES = ['ribbon', 'wheel', 'wheel3d'];
export const NOTERIBBON_ORIENTATIONS = ['horizontal', 'vertical'];
export const NOTERIBBON_VELOCITY_SOURCES = ['fixed', 'position'];
export const NOTERIBBON_MOD_AXES = ['none', 'cc'];
export const CROSSFADER_ORIENTATIONS = ['horizontal', 'vertical'];
export const METER_ORIENTATIONS = ['horizontal', 'vertical', 'arc'];
export const MATRIX_CELL_STYLES = ['bar', 'fill', 'dot'];
export const LCD_SCROLL_MODES = ['loop', 'bounce'];
export const PIXEL_LAYOUT_TRANSITIONS = ['none', 'fade', 'slide'];

/** The source of truth per verb, as `<family>.<verb>` — read by componentVerbs.js to build the
 *  spec, and by componentEnums.test.js to prove nothing drifted. */
export const VERB_VALUES = {
  'arp.pattern': ARP_PATTERNS,
  'arp.division': DIVISION_IDS,
  'arp.scale': SCALE_NAMES,
  'arp.chordType': CHORD_TYPES,
  'arp.source': ARP_SOURCES,
  'chordpad.mode': CHORDPAD_MODES,
  'chordpad.scale': SCALE_NAMES,
  'chordpad.chordType': CHORD_TYPES,
  'chordpad.voicing': CHORDPAD_VOICINGS,
  'noteribbon.mode': RIBBON_MODES,
  'noteribbon.scale': SCALE_NAMES,
  'drumpads.map': PAD_MAPS,
  'drumpads.mode': PAD_MODES,
  'drumpads.origin': PAD_ORIGINS,
  'drumpads.velocityFrom': PAD_VELOCITY_SOURCES,
  'drumpads.rollRate': DIVISION_IDS,
  'chordpad.layout': CHORDPAD_LAYOUTS,
  'noteribbon.orientation': NOTERIBBON_ORIENTATIONS,
  'noteribbon.velocityFrom': NOTERIBBON_VELOCITY_SOURCES,
  'noteribbon.modAxis': NOTERIBBON_MOD_AXES,
  'ribbon.orientation': RIBBON_ORIENTATIONS,
  'ribbon.style': RIBBON_STYLES,
  'crossfader.orientation': CROSSFADER_ORIENTATIONS,
  'meter.orientation': METER_ORIENTATIONS,
  'matrix.cellStyle': MATRIX_CELL_STYLES,
  'lcd.anim': PIXEL_ANIM_MODES,
  'lcd.scrollMode': LCD_SCROLL_MODES,
  'pixel.layoutTransition': PIXEL_LAYOUT_TRANSITIONS,
  // One table for all four corners: they offer the same vocabulary, and a corner that offered a
  // different set from its neighbour would be a surprise rather than a feature.
  ...Object.fromEntries(['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight']
    .map((c) => [`drumpads.corner${c}`, PAD_ZONE_ACTIONS])),
  'turing.division': DIVISION_IDS,
  'constellation.mode': CONSTELLATION_MODES,
  'router.source': ROUTER_INPUT_SOURCES.map((s) => String(s?.id ?? s)),
  'router.poly': POLY_PRESSURE_MODES,
  'macro.slotCurve': MACRO_CURVES,
  // Same evaluator, same vocabulary — see the note beside the verb.
  'router.curveShape': ENVELOPE_CURVES,
  'constraint.mode': CONSTRAINT_MODES,
  'envelope.preset': ENVELOPE_PRESETS,
  'envelope.pointCurve': ENVELOPE_CURVES,
  // One spring, one vocabulary: the ribbon, the crossfader and the joystick all answer from the
  // same two lists now that they share an implementation.
  'ribbon.returnMode': RETURN_MODES,
  'ribbon.returnCurve': RETURN_CURVES,
  'crossfader.returnMode': RETURN_MODES,
  'crossfader.returnCurve': RETURN_CURVES,
  'joystick.returnMode': RETURN_MODES,
  'joystick.returnCurve': RETURN_CURVES,
  'crossfader.law': CROSSFADER_LAWS,
  'joystick.returnAxes': JOYSTICK_RETURN_AXES,
  'meter.scale': METER_SCALES,
  'transport.source': TRANSPORT_SOURCES,
  'panic.scope': PANIC_SCOPES,
  'lcd.scroll': LCD_SCROLLS,
  'lcd.cursor': LCD_CURSORS,
  'pixel.anim': PIXEL_ANIM_MODES,
};

/** …and the same for the five hand-written families, whose reducers already validate against these
 *  but whose DOCUMENTATION named values that do not exist (`harmonyOutOfKey` was described as
 *  "skip"/"nearest"/"pass" where the engine has pass/nearest/mute). */
export const HAND_WRITTEN_VALUES = {
  'harmony.mode': HARMONY_MODES,
  'harmony.voicing': VOICINGS,
  'harmony.outOfKey': OUT_OF_KEY,
  'harmony.voiceLeading': VOICE_LEADING,
  'recorder.source': RECORDER_SOURCES,
};
