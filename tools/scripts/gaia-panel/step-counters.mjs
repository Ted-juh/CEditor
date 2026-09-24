import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';

// Values you set to an exact number — a tempo, an octave, a bend range in semitones, the arpeggio's
// octave range, accent and fixed velocity — are − value + counters, the same control the SYSTEM
// page uses. Landing a knob on exactly 120 BPM or +2 octaves is a fiddle; a counter is one click per
// step and takes typing. LEVEL and PORTA TIME stay knobs: they are amounts you turn by ear.
//
// Each counter replaces its knob in place and keeps the knob's ID, name, tooltip, page and
// status-display readout, so the arpeggio caption script, the status display and any saved script
// that names the control still find it.
//
// Where each counter goes, worked out from the finished layout rather than written down: a counter
// is centred on the knob it replaces, so a later layout change to the PATCH strip carries the
// counters with it. The arpeggio's three stack under MOTIF / NOTE ORDER, because its column is too
// narrow for three counters side by side.
const COUNTER = { width: 96, height: 20 };
const ARP_ROWS = ['arp.accentRate', 'arp.velocity', 'arp.octaveRange'];
export const STEP_COUNTERS = ['common.patchTempo', 'common.octaveShift', 'common.pitchBendRangeUp',
  'common.pitchBendRangeDown', ...ARP_ROWS];

function counterRect(name, knob, named) {
  const arpRow = ARP_ROWS.indexOf(name);
  if (arpRow >= 0) {
    const motif = named('arp.motif')._children.Transform;
    const box = named('box_ARPEGGIO')._children.Transform;
    return { x: box.x + 76, y: motif.y + motif.height + 20 + arpRow * 32, width: box.width - 82, height: COUNTER.height };
  }
  const k = knob._children.Transform;
  return { x: Math.round(k.x + k.width / 2 - COUNTER.width / 2), y: Math.round(k.y + k.height / 2 - COUNTER.height / 2), ...COUNTER };
}

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
  const named = (name) => all.find(c => c._children.Core.name === name);
  for (const name of STEP_COUNTERS) {
    const knob = named(name);
    if (!knob) throw new Error(`Missing ${name}`);
    const rect = counterRect(name, knob, named);
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
