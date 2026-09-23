// controlNames.js — a control name never contains a dot.
//
// A control's NAME is its script handle, and a script path is `name.property`: `cutoff.value`,
// `cutoff.background.fill.colour`. Both runtimes split that path at its FIRST dot (panelRuntime
// splitScriptPath, PanelValueModel::splitScriptPath), so a control named `tone1.lfo.rate` could
// never be reached by name — `tone1.lfo.rate.value` asked for a control called `tone1`. Worse
// than unreachable once the GAIA panel was sectioned: a group really is called `tone1` now, so
// the path found the wrong control. The GAIA's scripts had long since given up and addressed
// everything by id; the exported plugin had no such workaround, and its window-closed value
// mirror and patch dump quietly missed every dotted parameter.
//
// Two ways out: teach every path parser to find the longest name that fits, or take the dot out
// of names. The second keeps the rule simple in both runtimes and ends the ambiguity for good, so
// a dot typed or generated into a name becomes an underscore, and a document saved before this
// is converted when it is opened (migrateDottedControlNames).

import { flatControls } from './containment.js';
import { deepClone } from './deepClone.js';

/** The name with every dot replaced by an underscore. Everything else is left as it is. */
export function sanitizeControlName(name) {
  return String(name ?? '').replace(/\./g, '_');
}

/** Does any control in this tree carry a dotted name? Cheap enough to ask on every open. */
export function hasDottedControlNames(controls) {
  return flatControls(controls ?? []).some((c) => String(c?._children?.Core?.name ?? '').includes('.'));
}

/**
 * Rewrite `path` if it begins with a renamed control's name, taking the LONGEST name that fits.
 *
 * Longest, because the names being replaced overlap: `tone1` (a group) and `tone1.lfo.rate` (a
 * knob) both begin `tone1.lfo.rate.value`, and it is the knob that path means.
 */
function renamePath(path, renames, byLength) {
  const text = String(path ?? '');
  for (const from of byLength) {
    if (text === from) return renames.get(from);
    if (text.startsWith(`${from}.`)) return `${renames.get(from)}${text.slice(from.length)}`;
  }
  return text;
}

function renameKeys(object, rewrite) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return object;
  let changed = false;
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    const next = rewrite(key);
    if (next !== key) changed = true;
    out[next] = value;
  }
  return changed ? out : object;
}

/**
 * Convert a panel whose controls have dotted names, and every reference that addresses a control
 * BY NAME, together. Returns the same panel object when there is nothing to do.
 *
 * Field by field, never a text replace: the GAIA names its bound controls after their device
 * parameters, so `tone1.lfo.rate` is also the `parameterId` in the control's own DeviceBindings,
 * in `exportParameters[].deviceParameterId` and in the generated scripts' source. Those are the
 * instrument's addresses and must stay exactly as they are; only the references below are names.
 *
 * What is rewritten: `Core.name`; `exportParameters[]` `controlName`, `id`, `path` and `label`;
 * `snapshots[].values` keys (export parameter ids); Setlist `capturePaths` and scene `values`
 * keys; every script `target`, panel-level and per-control; LCD soft keys' `press.set`; and the
 * GAIA arpeggio feedback's `gridName`. Script SOURCES are not touched — a dotted name never
 * resolved in a script, so no working script can name one.
 *
 * A converted name that would clash with another control's name or id gets `_2`, `_3`…
 */
export function migrateDottedControlNames(panel) {
  if (!panel || !hasDottedControlNames(panel.controls)) return panel;
  const next = deepClone(panel);
  const all = flatControls(next.controls);

  // Who holds each name and id, case-folded as the runtimes look them up. A control may take its
  // OWN id as its name — the GAIA's envelope views are `tone1_osc_pitchEnv_view` by id and become
  // it by name — but not another control's name or id.
  const owner = new Map();
  for (const c of all) {
    const core = c._children?.Core ?? {};
    if (!String(core.name ?? '').includes('.')) owner.set(String(core.name ?? '').toLowerCase(), c);
    if (core.id != null) owner.set(String(core.id).toLowerCase(), c);
  }
  const renames = new Map();
  for (const c of all) {
    const core = c._children?.Core;
    const from = String(core?.name ?? '');
    if (!from.includes('.')) continue;
    const base = sanitizeControlName(from);
    const free = (name) => { const holder = owner.get(name.toLowerCase()); return !holder || holder === c; };
    let to = base;
    for (let n = 2; !free(to); n++) to = `${base}_${n}`;
    owner.set(to.toLowerCase(), c);
    renames.set(from, to);
    core.name = to;
  }
  const byLength = [...renames.keys()].sort((a, b) => b.length - a.length);
  const path = (text) => renamePath(text, renames, byLength);
  const whole = (text) => renames.get(String(text ?? '')) ?? text;

  const retarget = (scripts) => {
    for (const script of Array.isArray(scripts) ? scripts : []) {
      if (script && typeof script.target === 'string') script.target = whole(script.target);
    }
  };
  retarget(next.scripts);

  for (const c of all) {
    const kids = c._children ?? {};
    retarget(kids.Scripts?.scripts);
    for (const layout of Array.isArray(kids.Display?.layouts) ? kids.Display.layouts : []) {
      for (const zone of Array.isArray(layout?.zones) ? layout.zones : []) {
        if (typeof zone?.press?.set === 'string') zone.press.set = whole(zone.press.set);
      }
    }
    const feedback = kids.Designer?.deviceSyncFeedback;
    if (typeof feedback?.gridName === 'string') feedback.gridName = whole(feedback.gridName);
    const setlist = kids.Setlist;
    if (setlist) {
      if (Array.isArray(setlist.capturePaths)) setlist.capturePaths = setlist.capturePaths.map(path);
      if (Array.isArray(setlist.scenes)) {
        setlist.scenes = setlist.scenes.map((scene) => (scene?.values ? { ...scene, values: renameKeys(scene.values, path) } : scene));
      }
    }
  }

  if (Array.isArray(next.exportParameters)) {
    next.exportParameters = next.exportParameters.map((entry) => {
      if (!entry || !renames.has(String(entry.controlName ?? ''))) return entry;
      return {
        ...entry,
        controlName: whole(entry.controlName),
        id: path(entry.id),
        path: path(entry.path),
        ...(typeof entry.label === 'string' ? { label: renameLabel(entry.label, renames, byLength) } : {}),
      };
    });
  }
  if (Array.isArray(next.snapshots)) {
    next.snapshots = next.snapshots.map((snapshot) => (snapshot?.values ? { ...snapshot, values: renameKeys(snapshot.values, path) } : snapshot));
  }
  return next;
}

/** A parameter's display label begins with its control's name ("tone1.lfo.rate", "Tab Page"). */
function renameLabel(label, renames, byLength) {
  for (const from of byLength) {
    if (label === from || label.startsWith(`${from} `) || label.startsWith(`${from}.`)) {
      return `${renames.get(from)}${label.slice(from.length)}`;
    }
  }
  return label;
}
