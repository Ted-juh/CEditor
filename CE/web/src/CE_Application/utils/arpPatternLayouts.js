// arpPatternLayouts.js — where a synth keeps the arpeggio pattern the grid edits.
//
// The GAIA SH-01 and the SH-201 store a user arpeggio the same way: sixteen lanes of one note each,
// every lane an Original Note (0..127, or 128 for OFF) and thirty-two steps (0 a rest, 1..127 a
// velocity, 128 a tie to the step before), with one End Step for the loop. What differs is what the
// profiles call those 529 parameters, and the requests that read them back.
//
// The pattern editor — Read Pattern, Send Pattern, undo, the readback status (gaiaPatternEditing.js,
// gaiaPatternTransfer.js, gaiaSyncStatus.js) — was written for the GAIA with its names inline. It
// takes them from here, so a grid marked `Designer.patternEditing.kind: 'sh201'` edits an SH-201
// exactly as the GAIA's grid edits a GAIA. A layout is data; a third synth with the same scheme is
// one more entry.

const pad2 = (n) => String(n).padStart(2, '0');

export const ARP_PATTERN_LAYOUTS = {
  gaia: {
    kind: 'gaia',
    synth: 'GAIA',
    label: 'Roland GAIA SH-01',
    lanes: 16,
    steps: 32,
    endStep: 'arp.endStep',
    endStepRequest: 'requestArpeggioCommon',
    originalNote: (lane) => `arpPattern.note${lane}.originalNote`,
    step: (lane, step) => `arpPattern.note${lane}.step${step}Data`,
    laneRequest: (lane) => `requestArpPattern${lane}`,
  },
  sh201: {
    kind: 'sh201',
    synth: 'SH-201',
    label: 'Roland SH-201',
    lanes: 16,
    steps: 32,
    endStep: 'arpeggio.endStep',
    endStepRequest: 'requestArpeggioCommon',
    originalNote: (lane) => `arpeggio.pattern${pad2(lane)}.originalNote`,
    step: (lane, step) => `arpeggio.pattern${pad2(lane)}.step${pad2(step)}`,
    laneRequest: (lane) => `requestArpeggioPattern${pad2(lane)}`,
  },
};

/** The layout a grid is marked with, or null for a grid that edits no synth's pattern. */
export function patternLayoutOf(control) {
  return ARP_PATTERN_LAYOUTS[control?._children?.Designer?.patternEditing?.kind] ?? null;
}

export function hasPatternEditing(control) {
  return patternLayoutOf(control) != null;
}

/** The layout a pattern function works in: the grid's own, or the GAIA's, which was the only one
 *  before there was a choice — a grid built without the mark still reads and writes a GAIA. */
export function layoutFor(control) {
  return patternLayoutOf(control) ?? ARP_PATTERN_LAYOUTS.gaia;
}

/** A custom component with an arpeggiator grid: the only kind a pattern layout means anything on. */
export function isPatternGrid(control) {
  return control?._children?.Core?.controlType === 'CustomComponent'
    && control?._children?.Designer?.arpeggiator?.enabled === true;
}

/**
 * What the Device tab shows for a grid: which synth's pattern it edits, the choices, and whether
 * the one thing a pattern read needs from the panel is there — a binding of the synth's End Step,
 * whose device role is the device Read Pattern and Send Pattern talk to.
 */
export function patternEditingChoice(control) {
  if (!isPatternGrid(control)) return null;
  const layout = patternLayoutOf(control);
  const binding = layout
    ? (control._children.DeviceBindings?.bindings ?? []).find((entry) => entry?.parameterId === layout.endStep) ?? null
    : null;
  return {
    kind: layout?.kind ?? '',
    options: [{ kind: '', label: 'None' }, ...Object.values(ARP_PATTERN_LAYOUTS).map(({ kind, label }) => ({ kind, label }))],
    endStep: layout?.endStep ?? '',
    deviceRole: binding?.deviceRole ?? '',
  };
}

/** The change that marks a grid for a synth's pattern, or clears the mark ('' or an unknown kind). */
export function patternEditingPatch(kind) {
  return { 'Designer.patternEditing': ARP_PATTERN_LAYOUTS[kind] ? { kind, mode: 'manual' } : null };
}
