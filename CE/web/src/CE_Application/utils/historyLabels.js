// historyLabels.js — what an undo step did, in words: "Move Cutoff", "Delete 3 controls".
//
// History stores the state BEFORE each step, not the step itself, so a step is described by
// comparing two consecutive states. That keeps recording exactly as cheap as it is (nothing new is
// stored per edit) and costs a diff only when somebody looks — the Edit menu's Undo item, the
// toolbar tooltips and the History window. The diff is cheap for the same reason the snapshot is:
// edits never mutate in place, so an unchanged control or section is the same object on both
// sides and is skipped by reference.

import { jsonEqual } from './jsonEqual.js';

const TREE_KEYS = new Set(['controls', 'control']);

/** A control's name for people: its name, else its id, else its type. */
export function controlDisplayName(control) {
  const core = control?._children?.Core ?? {};
  return String(core.name || core.id || core.controlType || 'control');
}

/** Every control in a tree, nested ones included, by id. */
function flattenById(controls, out = new Map()) {
  for (const control of controls ?? []) {
    const id = control?._children?.Core?.id;
    if (id != null) out.set(id, control);
    const kids = control?._children?.Children?._children;
    if (kids) flattenById(Object.values(kids), out);
  }
  return out;
}

/** Sections of a control whose content differs, ignoring its children (they are counted on their own). */
function changedSections(before, after) {
  const a = before?._children ?? {};
  const b = after?._children ?? {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const name of names) {
    if (a[name] === b[name]) continue;
    if (name === 'Children') {
      // A container whose child moved is rebuilt; only its own Children settings count here.
      const { _children: ka, ...ra } = a[name] ?? {};
      const { _children: kb, ...rb } = b[name] ?? {};
      if (!jsonEqual(ra, rb)) out.push(name);
      continue;
    }
    if (!jsonEqual(a[name], b[name])) out.push(name);
  }
  return out;
}

function changedKeys(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter((key) => key !== '_children' && a?.[key] !== b?.[key] && !jsonEqual(a?.[key], b?.[key]));
}

/** "Background" → "background", "ContentLayout" → "content layout", "Behavior" → "behaviour". */
function sectionWords(name) {
  if (name === 'Behavior') return 'behaviour';
  return String(name).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * The verb for one control's change: Move / Resize / Rotate / Rename, or "Edit <section>".
 * Returns { verb, detail } so several controls can share a verb ("Move 4 controls").
 */
function controlChange(before, after) {
  const sections = changedSections(before, after);
  if (sections.length === 0) return null;
  if (sections.length === 1 && sections[0] === 'Transform') {
    const keys = changedKeys(before._children.Transform, after._children.Transform);
    if (keys.some((key) => key === 'width' || key === 'height')) return { verb: 'Resize' };
    if (keys.length && keys.every((key) => key === 'rotation')) return { verb: 'Rotate' };
    if (keys.length && keys.every((key) => key === 'x' || key === 'y')) return { verb: 'Move' };
    return { verb: 'Edit', detail: 'transform' };
  }
  if (sections.length === 1 && sections[0] === 'Core') {
    const keys = changedKeys(before._children.Core, after._children.Core);
    if (keys.length === 1 && keys[0] === 'name') {
      return { verb: 'Rename', rename: [controlDisplayName(before), controlDisplayName(after)] };
    }
  }
  if (sections.length === 1) return { verb: 'Edit', detail: sectionWords(sections[0]) };
  return { verb: 'Edit', detail: '' };
}

function countNoun(count, noun = 'control') {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The control-tree half of a step, or '' if the tree did not change. */
function describeControls(beforeList, afterList) {
  if (beforeList === afterList) return '';
  const before = flattenById(beforeList);
  const after = flattenById(afterList);
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changes = [];
  for (const [id, next] of after) {
    const prev = before.get(id);
    if (!prev || prev === next) continue;
    const change = controlChange(prev, next);
    if (change) changes.push({ control: next, ...change });
  }

  const parts = [];
  if (added.length) {
    parts.push(added.length === 1 ? `Add ${controlDisplayName(after.get(added[0]))}` : `Add ${countNoun(added.length)}`);
  }
  if (removed.length) {
    parts.push(removed.length === 1 ? `Delete ${controlDisplayName(before.get(removed[0]))}` : `Delete ${countNoun(removed.length)}`);
  }
  if (changes.length === 1) {
    const [change] = changes;
    if (change.verb === 'Rename') parts.push(`Rename ${change.rename[0]} to ${change.rename[1]}`);
    else if (change.verb === 'Edit' && change.detail) parts.push(`Edit ${change.detail} of ${controlDisplayName(change.control)}`);
    else parts.push(`${change.verb} ${controlDisplayName(change.control)}`);
  } else if (changes.length > 1) {
    const verbs = new Set(changes.map((change) => (change.verb === 'Edit' ? `Edit ${change.detail}` : change.verb)));
    const [only] = verbs;
    const count = countNoun(changes.length);
    if (verbs.size !== 1 || only === 'Edit ') parts.push(`Edit ${count}`);          // mixed, or several sections each
    else if (only.startsWith('Edit ')) parts.push(`${only} of ${count}`);           // "Edit background of 3 controls"
    else parts.push(`${only} ${count}`);                                             // "Move 4 controls"
  }
  // Only the order changed (arrange front/back, or a reorder in a container).
  if (parts.length === 0 && !jsonEqual([...before.keys()], [...after.keys()])) parts.push('Reorder controls');
  if (parts.length === 0 && (beforeList?.length ?? 0) !== (afterList?.length ?? 0)) parts.push('Rearrange controls');
  return parts.join(' · ');
}

const PANEL_WORDS = {
  width: 'Resize panel', height: 'Resize panel', name: 'Rename panel', notepad: 'Edit notes',
  snapshots: 'Edit snapshots', layers: 'Edit layers', guides: 'Edit guides',
};

/** The panel-settings half of a step. */
function describeChrome(before, after) {
  const keys = changedKeys(
    Object.fromEntries(Object.entries(before ?? {}).filter(([key]) => !TREE_KEYS.has(key))),
    Object.fromEntries(Object.entries(after ?? {}).filter(([key]) => !TREE_KEYS.has(key))),
  );
  if (keys.length === 0) return '';
  const words = [...new Set(keys.map((key) => PANEL_WORDS[key] ?? 'Change panel settings'))];
  return words.length === 1 ? words[0] : 'Change panel settings';
}

/** A custom component being designed: its parts, then its other sections. */
function describeComponent(before, after) {
  if (before === after) return '';
  const partsBefore = before?._children?.Parts?._children ?? {};
  const partsAfter = after?._children?.Parts?._children ?? {};
  const added = Object.keys(partsAfter).filter((name) => !(name in partsBefore));
  const removed = Object.keys(partsBefore).filter((name) => !(name in partsAfter));
  const edited = Object.keys(partsAfter).filter((name) => name in partsBefore
    && partsBefore[name] !== partsAfter[name] && !jsonEqual(partsBefore[name], partsAfter[name]));
  const parts = [];
  if (added.length) parts.push(added.length === 1 ? `Add part ${added[0]}` : `Add ${countNoun(added.length, 'part')}`);
  if (removed.length) parts.push(removed.length === 1 ? `Delete part ${removed[0]}` : `Delete ${countNoun(removed.length, 'part')}`);
  if (edited.length === 1) {
    const layoutOnly = changedKeys(partsBefore[edited[0]]?._children ?? {}, partsAfter[edited[0]]?._children ?? {});
    const verb = layoutOnly.length === 1 && layoutOnly[0] === 'Layout' ? 'Move or resize part' : 'Edit part';
    parts.push(`${verb} ${edited[0]}`);
  } else if (edited.length > 1) {
    parts.push(`Edit ${countNoun(edited.length, 'part')}`);
  }
  const sections = changedSections(before, after).filter((name) => name !== 'Parts');
  if (sections.length === 1) parts.push(`Edit ${sectionWords(sections[0])}`);
  else if (sections.length > 1) parts.push(`Edit ${countNoun(sections.length, 'section')}`);
  if (parts.length === 0 && !jsonEqual(Object.keys(partsBefore), Object.keys(partsAfter))) parts.push('Reorder parts');
  return parts.join(' · ');
}

/**
 * Describe the step that turned `before` into `after`. `kind` is the history context's kind:
 * 'panel', 'component', or a registered workspace's own kind.
 */
export function describeHistoryStep(before, after, kind = 'panel') {
  if (before == null || after == null) return 'Change';
  let label = '';
  if (kind === 'panel') {
    label = [describeControls(before.controls, after.controls), describeChrome(before, after)].filter(Boolean).join(' · ');
  } else if (kind === 'component') {
    label = describeComponent(before.control, after.control);
  } else {
    const keys = changedKeys(before, after);
    label = keys.length === 1 ? `Edit ${sectionWords(keys[0])}` : keys.length ? `Edit ${countNoun(keys.length, 'setting')}` : '';
  }
  return label || 'Change';
}

// One label per pair of states, remembered for as long as the older state is. States are the
// objects history holds, so a menu opened twice does not diff twice.
const cache = new WeakMap();

export function cachedHistoryStepLabel(before, after, kind) {
  if (before == null || typeof before !== 'object') return describeHistoryStep(before, after, kind);
  const hit = cache.get(before);
  if (hit && hit.after === after && hit.kind === kind) return hit.label;
  const label = describeHistoryStep(before, after, kind);
  cache.set(before, { after, kind, label });
  return label;
}
