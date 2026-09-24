import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// Values you set to an exact number — a tempo, an octave, a bend range in semitones, the arpeggio's
// octave range, accent and fixed velocity — are − value + counters, the same control the SYSTEM
// page uses. Landing a knob on exactly 120 BPM or +2 octaves is a fiddle; a counter is one click per
// step and takes typing. LEVEL and PORTA TIME stay knobs: they are amounts you turn by ear.
//
// Final geometry, applied last. Each counter replaces its knob in place and keeps the knob's ID,
// name, tooltip, page and status-display readout, so the arpeggio caption script, the status
// display and any saved script that names the control still find it.
const PATCH_ROW = { y: 175, width: 96, height: 20 };
export const STEP_COUNTERS = {
  'common.patchTempo': { x: 456, ...PATCH_ROW },
  'common.octaveShift': { x: 568, ...PATCH_ROW },
  'common.pitchBendRangeUp': { x: 1124, ...PATCH_ROW },
  'common.pitchBendRangeDown': { x: 1293, ...PATCH_ROW },
  // Three rows under MOTIF / NOTE ORDER: the column is too narrow for three counters side by side.
  'arp.accentRate': { x: 76, y: 139, width: 86, height: 20 },
  'arp.velocity': { x: 76, y: 171, width: 86, height: 20 },
  'arp.octaveRange': { x: 76, y: 203, width: 86, height: 20 },
};

/** `number(parameterId, box)` builds a bound Number control; the generator passes its `bound`. */
export function applyStepCounters(panel, number) {
  const holders = new Map();
  (function index(list, holder) {
    for (const c of list) {
      holders.set(c._children.Core.id, holder);
      const children = c._children.Children?._children;
      if (children) index(Object.values(children), children);
    }
  })(panel.controls, panel.controls);
  const all = flatControls(panel.controls);
  for (const [name, rect] of Object.entries(STEP_COUNTERS)) {
    const knob = all.find(c => c._children.Core.name === name);
    if (!knob) throw new Error(`Missing ${name}`);
    const parameterId = knob._children.DeviceBindings?.bindings?.find(b => b.parameterId)?.parameterId ?? name;
    const counter = knob._children.Core.controlType === 'Number' ? knob
      : number(parameterId, { x: rect.x, y: rect.y, w: rect.width, h: rect.height });
    if (counter !== knob) {
      const from = knob._children.Core, to = counter._children.Core;
      for (const key of ['id', 'name', 'tooltip', 'description', 'tabPageId', 'hostAutomation']) {
        if (from[key] !== undefined) to[key] = from[key];
      }
      const readout = knob._children.Designer?.lcdReadout;
      if (readout) (counter._children.Designer ??= {}).lcdReadout = readout;
      const holder = holders.get(from.id);
      if (Array.isArray(holder)) holder.splice(holder.indexOf(knob), 1, counter);
      else holder[from.id] = counter;
    }
    Object.assign(counter._children.Transform, rect);
    // The arpeggio's readable caption ("VELOCITY / REAL (played)") moves to the left of its counter.
    const caption = all.find(c => c._children.Core.name === `${name}.caption`);
    if (caption) Object.assign(caption._children.Transform, { x: 4, y: rect.y - 5, width: 68, height: 30 });
  }
  return panel;
}
