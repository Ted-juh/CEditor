/**
 * svgPanelReimport.js — bring a panel up to date with a revised drawing of itself.
 *
 * `svgPanelImport.js` makes a NEW panel from artwork. That is a one-time head start: artwork is revised
 * again and again, and by then the panel has bindings, scripts and links that a fresh panel would lose.
 * This updates the panel that exists. The rules are the ones the linked-component update keeps
 * (utils/customComponentSourceLink.js) — take the source's changes, keep the panel's own work, and
 * never discard anything without saying so:
 *
 *   - A control is MOVED only when its placeholder moved in the artwork. The panel remembers where each
 *     placeholder was (`panel.artworkImport`), so a control nudged in CEditor while the artwork stayed
 *     put keeps the nudge. When both moved, the artwork wins and the report names the control.
 *   - A new placeholder becomes a new control.
 *   - A control whose placeholder is gone is KEPT, with its bindings, and reported. Deleting is the
 *     author's call.
 *   - A control the author deleted from the panel is NOT re-added while its placeholder remains; the
 *     record keeps the deletion.
 *   - A control never changes type. If the placeholder now says slider and the control is a knob, it
 *     is moved and reported.
 *   - Only geometry changes on a matched control. Nothing else it carries is touched.
 *
 * Matching, in order: the placeholder's key (its name, else its element id) against the record; then,
 * for placeholders with no key, overlap with where a same-role placeholder used to be; then, on a panel
 * with no record at all (built by hand, or imported before the record existed), a control whose name
 * is the placeholder's name.
 *
 * Pure: panel + plan in, a list of changes out. stores/svgPanelImportActions.js applies them.
 */
import { buildSvgImportControls } from './svgPanelImport.js';

export const ARTWORK_RECORD_VERSION = 1;

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function boxOf(entry) {
  return {
    x: Math.round(Number(entry?.x) || 0),
    y: Math.round(Number(entry?.y) || 0),
    width: Math.max(1, Math.round(Number(entry?.width) || 0)),
    height: Math.max(1, Math.round(Number(entry?.height) || 0)),
  };
}

function sameBox(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

/** The record an import leaves on a panel: which placeholder made which control, and where it was. */
export function artworkRecord(plan, links, fileName = '', importedAt = new Date().toISOString()) {
  return {
    version: ARTWORK_RECORD_VERSION,
    file: String(fileName ?? ''),
    importedAt,
    width: plan.width,
    height: plan.height,
    links: links.map((link) => ({
      key: String(link.key ?? ''),
      role: String(link.role ?? ''),
      controlId: String(link.controlId ?? ''),
      ...boxOf(link),
    })),
  };
}

/** For a fresh import: pair each placeholder with the control built from it. */
export function linksForNewImport(plan, controls) {
  return (plan?.placeholders ?? []).map((placeholder, index) => ({
    ...placeholder,
    controlId: controlId(controls[index]),
  }));
}

/**
 * Plan the update of `panel` from a new import `plan`. Returns
 *
 *   moves      [{ controlId, name, from, to, overrodeLocal }]   geometry to write
 *   added      [control]                                         new controls, built and named
 *   kept       [{ controlId, name }]                             placeholder gone; control kept
 *   retyped    [{ controlId, name, type, wanted }]               placeholder now says another type
 *   notReadded [{ key }]                                         deleted on the panel; stays deleted
 *   nested     [{ controlId, name }]                             inside a container; not moved
 *   unchanged  n
 *   size       { from, to } | null
 *   record     the new panel.artworkImport
 */
export function planSvgPanelReimport(panel, plan, { fileName = '', importedAt, topLevelIds = null } = {}) {
  const previous = Array.isArray(panel?.artworkImport?.links) ? panel.artworkImport.links : [];
  const all = flatten(panel?.controls ?? []);
  const byId = new Map(all.map((control) => [controlId(control), control]));
  const topLevel = topLevelIds ?? new Set((panel?.controls ?? []).map(controlId));

  const placeholders = plan.placeholders.map((placeholder, index) => ({ ...placeholder, index, box: boxOf(placeholder) }));
  const match = new Map();         // placeholder index → previous link
  const usedLinks = new Set();

  // 1. By key.
  for (const placeholder of placeholders) {
    if (!placeholder.key) continue;
    const link = previous.find((entry) => !usedLinks.has(entry) && entry.key && entry.key === placeholder.key);
    if (link) { match.set(placeholder.index, link); usedLinks.add(link); }
  }

  // 2. Keyless placeholders, by overlap with where a same-role one used to be. Best pairs first, so
  //    two neighbouring knobs cannot swap because one of them was considered earlier.
  const candidates = [];
  for (const placeholder of placeholders) {
    if (match.has(placeholder.index) || placeholder.key) continue;
    for (const link of previous) {
      if (usedLinks.has(link) || link.key || link.role !== placeholder.role) continue;
      const score = overlap(placeholder.box, boxOf(link));
      if (score >= 0.25) candidates.push({ placeholder, link, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const { placeholder, link } of candidates) {
    if (match.has(placeholder.index) || usedLinks.has(link)) continue;
    match.set(placeholder.index, link);
    usedLinks.add(link);
  }

  // 3. A panel with no record: adopt controls whose names are the placeholders' names.
  const adopted = new Map();       // placeholder index → control
  if (!previous.length) {
    const taken = new Set();
    for (const placeholder of placeholders) {
      const wanted = String(placeholder.name ?? '').toLowerCase();
      if (!wanted) continue;
      const control = all.find((entry) => !taken.has(controlId(entry))
        && String(entry._children?.Core?.name ?? '').toLowerCase() === wanted);
      if (control) { adopted.set(placeholder.index, control); taken.add(controlId(control)); }
    }
  }

  const moves = [];
  const retyped = [];
  const notReadded = [];
  const nested = [];
  const links = [];
  const toBuild = [];
  let unchanged = 0;

  for (const placeholder of placeholders) {
    const link = match.get(placeholder.index);
    const control = link ? byId.get(String(link.controlId)) : adopted.get(placeholder.index);

    if (link && !control) {
      // Matched a record whose control is gone: the author deleted it. Keep that decision.
      notReadded.push({ key: placeholder.key || placeholder.source });
      links.push({ ...placeholder, controlId: link.controlId });
      continue;
    }
    if (!control) { toBuild.push(placeholder); continue; }

    const id = controlId(control);
    const name = String(control._children?.Core?.name ?? id);
    links.push({ ...placeholder, controlId: id });
    const type = String(control._children?.Core?.controlType ?? '');
    if (type && type !== placeholder.type) retyped.push({ controlId: id, name, type, wanted: placeholder.type });

    const current = boxOf(control._children?.Transform ?? {});
    const target = placeholder.box;
    const artMoved = link ? !sameBox(boxOf(link), target) : !sameBox(current, target);
    if (!artMoved || sameBox(current, target)) { unchanged += 1; continue; }
    if (!topLevel.has(id)) { nested.push({ controlId: id, name }); continue; }
    const overrodeLocal = !!link && !sameBox(current, boxOf(link));
    moves.push({ controlId: id, name, from: current, to: target, overrodeLocal });
  }

  const existingNames = all.map((control) => String(control._children?.Core?.name ?? ''));
  const added = buildSvgImportControls({ placeholders: toBuild }, existingNames);
  toBuild.forEach((placeholder, index) => links.push({ ...placeholder, controlId: controlId(added[index]) }));

  const matchedIds = new Set(links.map((link) => String(link.controlId)));
  const kept = previous
    .filter((link) => !usedLinks.has(link) && byId.has(String(link.controlId)) && !matchedIds.has(String(link.controlId)))
    .map((link) => ({ controlId: String(link.controlId), name: String(byId.get(String(link.controlId))._children?.Core?.name ?? link.controlId) }));

  const sizeChanged = Number(panel?.width) !== plan.width || Number(panel?.height) !== plan.height;
  return {
    moves,
    added,
    kept,
    retyped,
    notReadded,
    nested,
    unchanged,
    size: sizeChanged ? { from: { width: panel?.width, height: panel?.height }, to: { width: plan.width, height: plan.height } } : null,
    record: artworkRecord(plan, links, fileName, importedAt),
  };
}

function flatten(controls, out = []) {
  for (const control of controls ?? []) {
    if (!control) continue;
    out.push(control);
    const children = control._children?.Children?._children;
    if (children) flatten(Object.values(children), out);
  }
  return out;
}

/** Whether applying the update would change anything at all. */
export function reimportIsEmpty(update) {
  return !update.moves.length && !update.added.length && !update.size;
}

/** The summary shown before applying and logged after, one line per thing worth knowing. */
export function describeSvgReimport(update) {
  const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const head = [
    update.moves.length ? `move ${count(update.moves.length, 'control')}` : '',
    update.added.length ? `add ${count(update.added.length, 'control')}` : '',
    update.size ? `resize the panel to ${update.size.to.width}×${update.size.to.height}` : '',
  ].filter(Boolean);
  const lines = [head.length ? `This will ${head.join(', ')}, and replace the background.` : 'Only the background changes.'];
  if (update.unchanged) lines.push(`${count(update.unchanged, 'control')} already where the artwork puts ${update.unchanged === 1 ? 'it' : 'them'}.`);
  for (const move of update.moves.filter((entry) => entry.overrodeLocal)) {
    lines.push(`${move.name} was moved in CEditor and has moved in the artwork too; the artwork wins.`);
  }
  if (update.kept.length) {
    lines.push(`Kept, though their placeholders are gone: ${update.kept.map((entry) => entry.name).join(', ')}.`);
  }
  for (const entry of update.retyped) lines.push(`${entry.name} is a ${entry.type}; its placeholder now says ${entry.wanted}. It keeps its type.`);
  if (update.notReadded.length) lines.push(`${count(update.notReadded.length, 'placeholder')} for controls deleted from the panel stay deleted.`);
  for (const entry of update.nested) lines.push(`${entry.name} is inside a container and was not moved.`);
  return lines;
}
