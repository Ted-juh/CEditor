// controlSources.js — which controls may drive another control, in the one place both callers use.
//
// Nine fields across six components hold the ID of a control that feeds them: the Meter's level, the
// Envelope's playhead, the Router's input, the LCD's value and brightness and backlight, the Pixel
// display's two, and the Arpeggiator's Chord Pad. Every one of them was picked from a `<select>`
// whose candidate list was computed inline in that editor's own .svelte — the SAME `$derived` block,
// copy-pasted five times, under four different variable names (`valueSources`, `rangeSources`,
// `linkSources`, `allSources`).
//
// Two consequences. One: a script had no way to make the link at all, because the acceptance rule
// existed only inside a Svelte component. Two: five copies of one rule is how the Meter ends up
// accepting something the Router refuses, and nothing would have caught it.
//
// So the rule lives here. The editors' pickers read from it, the script verbs check against it, and
// controlSources.test.js asserts the two agree — a script may set exactly what the inspector offers.
//
// There are only three rules, which is the other half of the finding: `valueSources` and
// `rangeSources` and `linkSources` were always the same list.

const coreOf = (control) => control?._children?.Core ?? {};
const familyOf = (control) =>
  String(control?._children?.Behavior?.family ?? '').trim().toLowerCase();

/**
 * The kinds of source a field can name.
 *
 * `label` is written to be read at the end of "…is not ", because that is where it ends up: a script
 * naming the wrong control gets told what would have been right.
 */
export const SOURCE_KINDS = {
  // A knob, slider, number or anything else whose Behavior family is `range` — the things that
  // produce a value. Six of the nine fields want this.
  range: {
    label: 'a knob, slider or other range control',
    accepts: (control) => familyOf(control) === 'range',
  },
  // Anything at all. The backlight fields take a toggle, a button, a range — whatever the panel has,
  // because "is this thing on" is a question any control can answer.
  any: {
    label: 'a control on this panel',
    accepts: () => true,
  },
  // The Arpeggiator takes its notes from a Chord Pad and from nothing else.
  chordPad: {
    label: 'a Chord Pad',
    accepts: (control) => String(coreOf(control).controlType ?? '') === 'ChordPad',
  },
};

export const SOURCE_KIND_IDS = Object.keys(SOURCE_KINDS);

/** Whether one control may drive a field of this kind. A control never drives itself. */
export function sourceAccepts(kind, control, selfId = '') {
  const rule = SOURCE_KINDS[String(kind)];
  if (!rule || !control) return false;
  if (String(coreOf(control).id ?? '') === String(selfId ?? '')) return false;
  return rule.accepts(control);
}

/**
 * The candidates for one field, as the picker shows them: `{ id, name }`, in document order.
 *
 * `controls` is the panel's TOP-LEVEL list, which is what the editors passed and what the pickers
 * have always offered. Left as-is deliberately: widening it to nested controls would change what the
 * inspector shows, and that is a product decision rather than a refactor.
 */
export function controlSources(controls, kind, selfId = '') {
  return (Array.isArray(controls) ? controls : [])
    .filter((control) => sourceAccepts(kind, control, selfId))
    .map((control) => ({
      id: String(coreOf(control).id ?? ''),
      name: String(coreOf(control).name ?? coreOf(control).id ?? ''),
    }))
    .filter((entry) => entry.id);
}

/** The control one id refers to, or nothing. */
export function sourceById(controls, id) {
  const wanted = String(id ?? '');
  if (!wanted) return null;
  return (Array.isArray(controls) ? controls : [])
    .find((control) => String(coreOf(control).id ?? '') === wanted) ?? null;
}

/** …and by NAME, which is how a script addresses a control. Matched case-insensitively, as paths are. */
export function sourceByName(controls, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return (Array.isArray(controls) ? controls : [])
    .find((control) => String(coreOf(control).name ?? '').trim().toLowerCase() === wanted) ?? null;
}

/**
 * The NAME a stored source id refers to, or '' when it refers to nothing.
 *
 * '' covers both "no source" and "a source that has been deleted or is no longer eligible", and
 * that is the truthful answer to what a script is asking: in either case the component is running
 * on its static value. A dangling id read back as an opaque `ctl_…` would be worse than useless.
 */
export function sourceName(controls, id) {
  const control = sourceById(controls, id);
  return control ? String(coreOf(control).name ?? '') : '';
}
