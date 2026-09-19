// Hardware stage values stay independent: a generic normalized MSEG's segment
// fractions sum to one and cannot represent A=D=R=127. These graphs use fixed
// units per stage plus small display gaps so even zero-time handles are grabbable.
import { flatControls } from './containment.js';

export const linkedEnvelopeHold = (value = .15) => Math.max(.05, Math.min(.25, Number.isFinite(Number(value)) ? Number(value) : .15));
// Shared by the design canvas and preview/player, not just a preview-only overlay.
export function resolveLinkedEnvelope(control, controls, sessions = {}, hold = undefined) {
  const links = linkedEnvelopeConfig(control);
  if (!links) return control;
  const sources = flatControls(controls ?? []);
  const values = {};
  for (const [stage, link] of Object.entries(links)) {
    const source = sources.find(c => c._children.Core.id === link.controlId);
    if (!source) return control; // An isolated component thumbnail has no sibling context.
    const channel = source._children.ValueChannels?._children?.[link.channel];
    values[stage] = linkedEnvelopeValue(link, sessions[link.controlId]?.customValues?.[link.channel]
      ?? channel?.currentValue ?? channel?.defaultValue ?? link.defaultValue);
  }
  const cfg = control._children.Envelope;
  const duration = linkedEnvelopeHold(hold ?? cfg.__hold ?? cfg.holdPreview);
  return { ...control, _children: { ...control._children, Envelope: { ...cfg,
    points: linkedEnvelopePoints(control, values, duration), __stageValues: values, __hold: duration } } };
}
export function linkedEnvelopeConfig(control) {
  const cfg = control?._children?.Envelope?.stageSources;
  return cfg?.attack && cfg?.decay ? cfg : null;
}
export function linkedEnvelopeStages(control) {
  const cfg = linkedEnvelopeConfig(control);
  return cfg ? ['attack', 'decay', ...(cfg.sustain && cfg.release ? ['sustain', 'release'] : [])] : [];
}
export function linkedEnvelopeValue(source, value) {
  const n = Number(value ?? source.defaultValue ?? source.min);
  return Math.max(source.min, Math.min(source.max, Math.round(Number.isFinite(n) ? n : source.min)));
}
export function linkedEnvelopePoints(control, values = {}, holdDuration = undefined) {
  const cfg = linkedEnvelopeConfig(control);
  if (!cfg) return null;
  const fraction = stage => {
    const s = cfg[stage];
    return s.max === s.min ? 0 : (linkedEnvelopeValue(s, values[stage]) - s.min) / (s.max - s.min);
  };
  const adsr = !!cfg.sustain && !!cfg.release;
  const gap = adsr ? .075 : .1, span = adsr ? .175 : .35;
  const a = gap + span * fraction('attack'), d = a + gap + span * fraction('decay');
  const p = (id,x,y) => ({id,x,y,curve:'linear',tension:0});
  if (!adsr) return [p('start',0,0),p('attack',a,1),p('decay',d,0)];
  const s = fraction('sustain'), hold = d + linkedEnvelopeHold(holdDuration ?? control._children.Envelope.holdPreview);
  return [p('start',0,0),p('attack',a,1),p('decay',d,s),p('sustain',hold,s),p('release',hold+gap+span*fraction('release'),0)];
}
export function linkedEnvelopeDragValue(control, stage, startValue, dx, dy, geometry, fine = false) {
  const cfg=linkedEnvelopeConfig(control), source=cfg?.[stage];
  if (!source) return null;
  const span=cfg.sustain && cfg.release ? .175 : .35;
  const fraction=stage==='sustain' ? -dy/geometry.h : dx/(geometry.w*span);
  return linkedEnvelopeValue(source,startValue+fraction*(source.max-source.min)*(fine?.1:1));
}
