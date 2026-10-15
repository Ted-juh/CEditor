// componentFamilies.js — which controlTypes share one engine.
//
// A controlType is an IDENTITY; an engine is the code that draws and drives it. Several types map
// to one engine: a ProgressBar is drawn by the meter renderer, a Pitch Wheel and a Mod Wheel by the
// ribbon's. The surfaces need to ask "is this drawn by the meter renderer" rather than "is this
// called Meter", or every new family member means hunting string comparisons.
//
// ITS OWN MODULE, not a corner of componentTypes.js, because both `componentTypes` and
// `componentPorts` need it and those two already import each other. Put the sets in either one and
// they resolve only because of the order the declarations happen to be in — which works until
// somebody moves a block and gets an empty Set at import time, silently, with no error.

export const METER_FAMILY = new Set(['Meter', 'ProgressBar']);
export const RIBBON_FAMILY = new Set(['Ribbon', 'PitchWheel', 'ModWheel']);

export function isMeterFamily(type) {
  return METER_FAMILY.has(String(type ?? ''));
}

export function isRibbonFamily(type) {
  return RIBBON_FAMILY.has(String(type ?? ''));
}

// The controlTypes CanvasControl draws with a body renderer of their own, one branch each. A
// control asks which branch is its with one lookup, `ownRendererKind`, rather than holding a
// derived flag per branch: thirty-three flags were thirty-three reactive values in every control on
// a panel, buttons and knobs included, for an answer that is one string.
const OWN_RENDERER_TYPES = new Set([
  'LcdDisplay', 'Shape', 'Keyboard', 'StepSequencer', 'TabContainer', 'ScrollArea', 'Envelope',
  'Matrix', 'VectorJoystick', 'Numpad', 'Crossfader', 'Macro', 'Orbit', 'Looper', 'Router', 'Timbre',
  'Turing', 'Kinetic', 'Constellation', 'Constraint', 'ChordPad', 'Arp', 'NoteRibbon', 'DrumPads',
  'Panic', 'SplitZone', 'Phrase', 'Recorder', 'Harmoniser', 'Setlist', 'Transport',
]);

/** The branch that draws `type`: its own name, its family's engine ('Meter', 'Ribbon'), or ''. */
export function ownRendererKind(type) {
  const name = String(type ?? '');
  if (METER_FAMILY.has(name)) return 'Meter';
  if (RIBBON_FAMILY.has(name)) return 'Ribbon';
  return OWN_RENDERER_TYPES.has(name) ? name : '';
}
