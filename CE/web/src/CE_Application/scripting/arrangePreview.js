// arrangePreview.js — what an arrangement verb (ce.panel.align, distribute, match, grid, circle,
// flip) will do to the controls it names, for the script editor's Values tab: where each is now and
// where the verb puts it, read off the panel the editor holds and arranged by the verb's own plan
// (utils/arrangement.js's arrangementPlan, which the runtime applies), and a map to draw both on.
//
// The panel's canvas is not on screen while a script is written, and "ce.panel.distribute(pads,
// 'hSpacing')" says nothing of what it will look like. The row carries the picture.
//
// Read only when every part the verb reads is written out: the names, the word and the options. A
// name built from parts, or a list the script makes, is not known until it runs, and draws nothing.
// The panel is the one the editor holds, so a control the script itself creates before the call is
// not on it: that name is said as the runtime says one that is not a control.

import { ARRANGE_VERBS, arrangementPlan } from '../utils/arrangement.js';
import { controlPanelOffset } from '../utils/containment.js';
import { LAYOUT_WORDS, layoutWord } from './layoutWords.js';
import { controlNamed, didYouMean } from './scriptValueKinds.js';

const box = (t) => ({ x: t.x, y: t.y, w: t.width, h: t.height });
const sameBox = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const literalArg = (args, name) => args.find((a) => a.param?.name === name);

/**
 * The arrangement an arrangement verb's call makes, or null when it is not one, the editor has no
 * panel, or a part it reads is not written out (or its word is refused, which the word's own row
 * says):
 *
 *   { verb: 'ce.panel.grid', items: [{ id, name, before, after, moved, key }], others, ref, edge,
 *     count, moved, missing: [{ name, message }], refused, said }
 *
 * `before` and `after` are boxes { x, y, w, h } in panel coordinates; `others` are the panel's other
 * controls, for where the arrangement lands among them; `ref` is the box align lines up on and
 * `edge` the edge it lines up, `key` the control a `to` names (or match's first); `refused` the
 * runtime's sentence for a `to` that is not one of the names, and `said` what the row says of it.
 */
export function readArrangement(memberId, args, { panel, controls } = {}) {
  const verbWord = ARRANGE_VERBS[memberId];
  if (!verbWord || !panel) return null;
  const verb = `ce.panel.${verbWord}`;
  const namesArg = literalArg(args, 'names');
  if (!namesArg?.literal || namesArg.value === null || typeof namesArg.value !== 'object') return null;
  const names = Array.isArray(namesArg.value) ? namesArg.value : Object.values(namesArg.value);
  let which = null;
  const words = LAYOUT_WORDS[memberId];
  if (words) {
    const wordArg = literalArg(args, words.param);
    if (wordArg && !wordArg.literal) return null;
    const read = layoutWord(memberId, wordArg?.value);
    if (read.refused) return null;
    which = read.which;
  }
  const optsArg = literalArg(args, 'opts');
  if (optsArg && !optsArg.literal) return null;
  const opts = optsArg?.value && typeof optsArg.value === 'object' ? optsArg.value : undefined;

  // The controls the names find, in panel space, as panelRuntime's panelTransforms gathers them.
  const list = Array.isArray(controls) ? controls : [];
  const transforms = [];
  const missing = [];
  const allNames = list.map((c) => c._children.Core.name).filter(Boolean);
  for (const raw of names) {
    const control = controlNamed(list, raw);
    if (!control) {
      missing.push({ name: String(raw), message: `${verb}: no control named "${raw}".${didYouMean(String(raw), allNames)}` });
      continue;
    }
    const id = control._children.Core.id;
    const t = control._children.Transform ?? {};
    const offset = controlPanelOffset(panel.controls ?? [], id);
    transforms.push({
      id, name: control._children.Core.name ?? '',
      x: (Number(t.x) || 0) + offset.x, y: (Number(t.y) || 0) + offset.y,
      width: Number(t.width) || 0, height: Number(t.height) || 0,
      offsetX: offset.x, offsetY: offset.y,
    });
  }

  const plan = arrangementPlan(memberId, transforms, which, opts);
  const items = transforms.map((t) => {
    const patch = plan.refused ? null : plan.patches.get(t.id);
    const before = box(t);
    // Written back in each control's own frame, rounded there, as panelApplyPatches writes it.
    const at = (field, panelValue, offset) => (patch && `Transform.${field}` in patch
      ? Math.round(patch[`Transform.${field}`] - offset) + offset : panelValue);
    const after = {
      x: at('x', t.x, t.offsetX), y: at('y', t.y, t.offsetY),
      w: patch && 'Transform.width' in patch ? patch['Transform.width'] : t.width,
      h: patch && 'Transform.height' in patch ? patch['Transform.height'] : t.height,
    };
    return { id: t.id, name: t.name, before, after, moved: !sameBox(before, after), key: plan.key === t.id };
  });
  const named = new Set(items.map((i) => i.id));
  const others = [];
  for (const control of list) {
    const id = control._children.Core.id;
    if (named.has(id)) continue;
    const t = control._children.Transform ?? {};
    const offset = controlPanelOffset(panel.controls ?? [], id);
    others.push({ name: control._children.Core.name ?? '', x: (Number(t.x) || 0) + offset.x, y: (Number(t.y) || 0) + offset.y,
      w: Number(t.width) || 0, h: Number(t.height) || 0 });
  }
  const moved = items.filter((i) => i.moved).length;
  return {
    verb, items, others, ref: plan.ref ? box(plan.ref) : null, edge: memberId === 'panelAlign' ? which : null,
    count: items.length, moved, missing, refused: plan.refused ?? null,
    said: arrangementSaid({ memberId, verb, items, moved, refused: plan.refused }),
  };
}

/** What the row says of an arrangement, under its map. */
function arrangementSaid({ memberId, verb, items, moved, refused }) {
  // Too few controls is said in the row's own words before the plan's refusal, which now names it too.
  if (!items.length) return 'None of the names is a control on this panel, so nothing moves.';
  if (memberId !== 'panelAlign' && items.length < 2) {
    return `${verb} needs at least two controls, and only "${items[0].name}" is one, so nothing moves.`;
  }
  if (refused) return 'Nothing moves.';
  if (!moved) return memberId === 'panelMatch' ? 'Nothing changes size: they are already the same.' : 'Nothing moves: they are already where it puts them.';
  const still = items.filter((i) => !i.moved).map((i) => `"${i.name}"`);
  const verbed = memberId === 'panelMatch' ? 'Resizes' : 'Moves';
  const stays = memberId === 'panelMatch' ? 'keeps its size' : 'stays where it is';
  const staysMany = memberId === 'panelMatch' ? 'keep their sizes' : 'stay where they are';
  const rest = !still.length ? '' : still.length === 1 ? `; ${still[0]} ${stays}` : still.length <= 3 ? `; ${still.join(', ')} ${staysMany}` : '';
  return `${verbed} ${moved} of ${items.length}${rest}.`;
}

/**
 * Where the map shows an arrangement, fitted to `maxW` by `maxH` pixels: { viewBox, width, height,
 * scale, labelSize, others, line } — the box around every control before and after with a margin,
 * the other controls that fall in it, and align's line, the edge it lines up on.
 */
export function arrangementView(arrange, { maxW = 200, maxH = 110 } = {}) {
  const boxes = arrange.items.flatMap((i) => [i.before, i.after]);
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const span = Math.max(1, x1 - x0, y1 - y0);
  const pad = span * 0.08;
  const vx = x0 - pad;
  const vy = y0 - pad;
  const vw = Math.max(1, x1 - x0) + 2 * pad;
  const vh = Math.max(1, y1 - y0) + 2 * pad;
  const scale = Math.min(maxW / vw, maxH / vh);
  const inView = (b) => b.x < vx + vw && b.x + b.w > vx && b.y < vy + vh && b.y + b.h > vy;
  // What else is there: drawn faint, so a grid that lands on another control shows it. A control
  // that holds the whole view (a container, a background) is left out, as it says nothing.
  const others = arrange.others
    .filter((b) => inView(b) && !(b.x <= vx && b.y <= vy && b.x + b.w >= vx + vw && b.y + b.h >= vy + vh))
    .slice(0, 60);
  let line = null;
  const r = arrange.ref;
  if (r && arrange.edge) {
    const at = { left: r.x, hCenter: r.x + r.w / 2, right: r.x + r.w, top: r.y, vCenter: r.y + r.h / 2, bottom: r.y + r.h }[arrange.edge];
    line = ['left', 'hCenter', 'right'].includes(arrange.edge)
      ? { x1: at, y1: vy, x2: at, y2: vy + vh } : { x1: vx, y1: at, x2: vx + vw, y2: at };
  }
  return {
    viewBox: `${vx} ${vy} ${vw} ${vh}`, width: Math.round(vw * scale), height: Math.round(vh * scale),
    scale, labelSize: 9 / scale, others, line,
  };
}

/** Whether a control's name fits inside its box on the map, at the map's 9 px label size. */
export function labelFits(name, b, scale) {
  return b.h * scale >= 11 && String(name ?? '').length * 5.4 <= b.w * scale - 4;
}
