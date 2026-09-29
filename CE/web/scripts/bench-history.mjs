// bench-history.mjs — what undo history costs on the largest real panels, measured, not guessed.
//
// Handoff item 7 asked whether history needs a new data model (Immer patches, jsondiffpatch) and
// said to profile first. This is the profile. It loads the real shipped panels into the real
// stores and edits them through the same store path a drag uses (mutatePanelControlsByIdsInList),
// committing each edit with pushSnapshot(), as a gesture boundary does. For each scenario it
// reports:
//
//   edit       the store mutation itself (not history, but it is what history's retention follows)
//   commit     pushSnapshot(): snapshot + compare + tag + push
//   undo/redo  one step each
//   retained   heap still held after MAX_HISTORY steps, per step, after a forced GC
//
// Run from CE/web:
//   node --expose-gc --import ./test/support/register-svelte.mjs scripts/bench-history.mjs [panel.cepanel ...]

import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { get } from 'svelte/store';

import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, addPanel, setActivePanel } from '../src/CE_Application/stores/panels.js';
import { mutatePanelControlsByIdsInList } from '../src/CE_Application/stores/panelDocumentHelpers.js';
import { mapControlsTree } from '../src/CE_Application/utils/containment.js';
import { initHistory, pushSnapshot, undo, redo } from '../src/CE_Application/stores/history.js';

if (typeof globalThis.gc !== 'function') {
  console.error('run with --expose-gc');
  process.exit(2);
}

const STEPS = 50;                       // MAX_HISTORY in stores/history.js
const here = resolve(import.meta.dirname, '..', '..', 'panels');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Roland GAIA SH-01.cepanel', 'Yamaha AN1x.cepanel'].map((name) => resolve(here, name));

initHistory();

const heap = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage().heapUsed; };
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const ms = (value) => `${value.toFixed(2)} ms`;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const time = (fn) => { const t = performance.now(); fn(); return performance.now() - t; };

/** Every control, nested ones included, with its depth and subtree size. */
function walk(controls, depth = 0, out = []) {
  for (const control of controls ?? []) {
    const kids = control?._children?.Children?._children;
    out.push({ control, depth, id: control?._children?.Core?.id, type: control?._children?.Core?.controlType, kids: kids ? Object.keys(kids).length : 0 });
    if (kids) walk(Object.values(kids), depth + 1, out);
  }
  return out;
}

function moveBy(panelId, ids, dx) {
  panels.update((list) => mutatePanelControlsByIdsInList(list, panelId, ids, (draft) => {
    draft._children.Transform.x = Number(draft._children.Transform.x ?? 0) + dx;
    return true;
  }));
}

/**
 * The same move, but copying only what it changes: the control shell, its _children map and its
 * Transform. Every other section stays shared with the previous state. Not what the app does —
 * the comparison that says how much of the cost is the edit path's whole-control deepClone.
 */
function moveBySharing(panelId, ids, dx) {
  const wanted = new Set(ids);
  panels.update((list) => list.map((panel) => {
    if (panel.id !== panelId) return panel;
    const controls = mapControlsTree(panel.controls, (control) => {
      if (!wanted.has(control?._children?.Core?.id)) return control;
      const transform = control._children.Transform;
      return { ...control, _children: { ...control._children, Transform: { ...transform, x: Number(transform.x ?? 0) + dx } } };
    });
    return { ...panel, controls, modified: true };
  }));
}

function scenario(panelId, label, ids, move = moveBy) {
  pushSnapshot();                       // baseline
  const before = heap();
  const edits = [];
  const commits = [];
  for (let i = 0; i < STEPS; i += 1) {
    edits.push(time(() => move(panelId, ids, i % 2 ? -1 : 2)));
    commits.push(time(() => pushSnapshot()));
  }
  const after = heap();
  const undos = [];
  const redos = [];
  for (let i = 0; i < 10; i += 1) undos.push(time(() => undo()));
  for (let i = 0; i < 10; i += 1) redos.push(time(() => redo()));
  return {
    label,
    controls: ids.length,
    edit: median(edits), editP95: p95(edits),
    commit: median(commits), commitP95: p95(commits),
    undo: median(undos), redo: median(redos),
    retainedPerStep: Math.max(0, (after - before) / STEPS),
  };
}

const rows = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const heapBeforeLoad = heap();
  const loaded = deserializePanel(text, file, basename(file, '.cepanel'));
  if (!loaded) { console.error(`cannot load ${file}`); continue; }
  const name = `bench-${basename(file, '.cepanel')}`;
  addPanel({ ...loaded, name });
  const live = get(panels).find((p) => p.name === name);
  setActivePanel(live.id);
  const panelHeap = heap() - heapBeforeLoad;

  const all = walk(live.controls);
  const sized = all.map((entry) => ({ ...entry, bytes: JSON.stringify(entry.control).length }));
  const leaves = sized.filter((entry) => entry.kids === 0);
  const smallLeaf = leaves.sort((a, b) => a.bytes - b.bytes)[Math.floor(leaves.length / 2)];
  const biggest = [...sized].sort((a, b) => b.bytes - a.bytes)[0];
  const topLevel = (live.controls ?? []).map((c) => c._children.Core.id);
  const twenty = leaves.slice(0, 20).map((entry) => entry.id);

  const expandedString = JSON.stringify(live);
  console.log(`\n${basename(file)}: ${mb(text.length)} on disk, ${mb(expandedString.length)} expanded, ~${mb(panelHeap)} heap, `
    + `${all.length} controls (${topLevel.length} top level, deepest nesting ${Math.max(...all.map((e) => e.depth))})`);
  console.log(`  median leaf ${kb(smallLeaf.bytes)} (${smallLeaf.type}); biggest control ${kb(biggest.bytes)} (${biggest.type}, ${biggest.kids} children)`);
  const stringifyBiggest = median(Array.from({ length: 5 }, () => time(() => JSON.stringify(biggest.control))));
  console.log(`  JSON.stringify of the biggest control (what a component-workspace compare does, twice): ${ms(stringifyBiggest)}`);
  const stringifyPanel = median(Array.from({ length: 3 }, () => time(() => JSON.stringify(live))));
  console.log(`  JSON.stringify of the whole panel (the pre-2026 snapshot, for scale): ${ms(stringifyPanel)}`);

  for (const result of [
    scenario(live.id, 'move one median control', [smallLeaf.id]),
    scenario(live.id, 'move 20 controls', twenty),
    scenario(live.id, `edit the biggest control (${biggest.type})`, [biggest.id]),
    scenario(live.id, 'select all top-level, nudge', topLevel),
    scenario(live.id, 'same, copying only Transform (comparison)', topLevel, moveBySharing),
    scenario(live.id, `biggest control, copying only Transform (comparison)`, [biggest.id], moveBySharing),
  ]) {
    rows.push({ panel: basename(file, '.cepanel'), ...result });
    console.log(`  ${result.label.padEnd(44)} edit ${ms(result.edit)} (p95 ${ms(result.editP95)})  commit ${ms(result.commit)} (p95 ${ms(result.commitP95)})  `
      + `undo ${ms(result.undo)}  redo ${ms(result.redo)}  retained/step ${kb(result.retainedPerStep)} → ${mb(result.retainedPerStep * STEPS)} at ${STEPS}`);
  }
}

if (process.env.BENCH_JSON) console.log(JSON.stringify(rows));
process.exit(0);
