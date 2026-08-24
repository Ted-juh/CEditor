// sectionValueOverrides.js — letting a host parameter reach a component's own section.
//
// THE DEFECT THIS CLOSES, and it was silent in the worst way: a control could export a host
// parameter that moved nothing.
//
// `deriveExportParameters` has three doors. A control with a `Behavior` section exports its value,
// a CustomComponent exports its value channels, and a type can declare `exportValues` naming a
// field on one of its OWN sections — a Crossfader's `mix`, a VectorJoystick's `x` and `y`, an Arp's
// `rate`. The first two land somewhere the player already writes: `valueOverride` for a Behavior
// value, `customValues` for a channel. The third had nowhere to land at all. The parameter appeared
// in the DAW, automated, saved with the session, and the component never moved — indistinguishable,
// from the user's chair, from a broken plugin.
//
// It went unnoticed because the only types using the third door were `Crossfader` (whose spec
// carries no `suffix`, so it takes the `valueOverride` path by accident and works), and
// `VectorJoystick` / `Timbre` / `Constellation`, whose parameters nobody had automated yet.
//
// THE FIX is one session key. `sectionValues` is `{ [SectionName]: { [field]: value } }`, overlaid
// onto the control BEFORE anything renders it, so every component reads its own section as usual
// and needs no knowledge of automation. Deliberately not per-component plumbing: there are ten
// types using this door today and the next one should need no work here at all.

/** Nothing to overlay -> the control itself, so the common path allocates nothing. */
export function applySectionValues(control, sectionValues) {
  if (!control || !sectionValues || typeof sectionValues !== 'object') return control;

  const names = Object.keys(sectionValues);
  if (names.length === 0) return control;

  let children = null;
  for (const name of names) {
    const fields = sectionValues[name];
    const section = control._children?.[name];
    // A section the control does not have is skipped rather than created: a stale override from a
    // control whose type changed must not conjure a section the renderer would then read.
    if (!section || !fields || typeof fields !== 'object') continue;

    let next = null;
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined || !(field in section)) continue;
      next = next ?? { ...section };
      next[field] = value;
    }
    if (next) {
      children = children ?? { ...control._children };
      children[name] = next;
    }
  }

  return children ? { ...control, _children: children } : control;
}

/**
 * The patch that writes one field, merged with what is already overridden.
 *
 * Merged rather than replaced because a component can have several exported fields — an Arp has
 * four — and automating one must not clear the other three.
 */
export function sectionValuePatch(existing, sectionName, field, value) {
  const current = existing && typeof existing === 'object' ? existing : {};
  const section = current[sectionName] && typeof current[sectionName] === 'object' ? current[sectionName] : {};
  return { ...current, [sectionName]: { ...section, [field]: value } };
}

/** Read one back, or undefined when nothing has written it. */
export function sectionValueOf(sectionValues, sectionName, field) {
  const value = sectionValues?.[sectionName]?.[field];
  return value === undefined ? undefined : value;
}
