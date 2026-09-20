import { ADDITIONAL_DIRECTIONS } from './additionalControlSets.js';
// Forms are independent of palettes. The existing control owns input, MIDI and accessibility.
export const CONTROL_FORMS = {
  Knob: [['disc','Flat disc'],['pointer','Drafting pointer'],['tab','Paper tab'],['pebble','Moulded pebble'],['halo','Open glass ring'],['lens','Optical lens'],['skirt','Console skirt'],['roller','Rubber roller'],['vernier','Vernier dial'],['tuning','Radio tuning window'],['scallop','Scalloped selector'],['encoder','Segment encoder']],
  Button: [['tile','Flat tile'],['crosskey','Crosshair key'],['fold','Folded paper'],['cushion','Soft cushion'],['glasskey','Glass disc'],['touch','Touch strip'],['piano','Piano key'],['rubber','Rubber pad'],['hexkey','Hexagonal plunger'],['typewriter','Typewriter key'],['guardkey','Guarded key'],['pixelkey','Pixel key']],
  ToggleButton: [['slide','Sliding tab'],['knife','Exposed knife switch'],['bookmark','Paper bookmark'],['rocker','Moulded rocker'],['orbit','Orbit switch'],['split','Split touch field'],['latch','Console latch'],['strap','Rubber strap'],['bolt','Sliding bolt'],['lever','Bakelite lever'],['guard','Guarded toggle'],['binary','Binary cells']],
  Meter: [['bar','Flat bar'],['ruler','Ruler cursor'],['ticket','Paper tally'],['capsule','Capsule fill'],['column','Glass column'],['counter','Digit counter'],['vu','Studio needle'],['blocks','Rubber blocks'],['dial','Instrument dial'],['radio','Radio needle'],['semaphore','Flag indicator'],['dots','Dot array']],
};
for (const [type, forms] of Object.entries(CONTROL_FORMS)) {
  for (const d of ADDITIONAL_DIRECTIONS) forms.push([`new-${d.id}`, `${d.name} ${type === 'Knob' ? d.rotary : type === 'Meter' ? 'indicator' : type === 'ToggleButton' ? 'switch' : 'key'}`]);
}
export const FORM_SETS = ['graphite','blueprint','pop','soft','frost','obsidian','console','carbon','machined','tolex','field','phosphor',...ADDITIONAL_DIRECTIONS.map(d=>d.id)];
export function anatomyOptions(type) { return CONTROL_FORMS[type] ?? (['MomentaryButton','TimedButton','OneShotButton'].includes(type) ? CONTROL_FORMS.Button : type === 'ProgressBar' ? CONTROL_FORMS.Meter : []); }
export function anatomyForm(type, form) { return anatomyOptions(type).some(([id]) => id === form) ? form : ''; }
export function setAnatomy(type, id) { return anatomyOptions(type)[FORM_SETS.indexOf(id)]?.[0] ?? ''; }
export function anatomyValue(control, signals = {}) {
  const b = control?._children?.Behavior ?? {};
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const min = finite(b.min, 0), max = finite(b.max, 1);
  const raw = finite(signals.currentValueRaw ?? signals.valueRaw, finite(b.defaultCurrentValue, finite(b.defaultValue, min)));
  const normalized = finite(signals.currentValueNormalized ?? signals.valueNormalized, max === min ? 0 : (raw - min) / (max - min));
  return { raw, normalized: Math.max(0, Math.min(1, normalized)) };
}
