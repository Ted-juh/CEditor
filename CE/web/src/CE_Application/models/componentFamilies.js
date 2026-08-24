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
