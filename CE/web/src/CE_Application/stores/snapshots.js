// snapshots.js — capture, recall and morph the live panel.
//
// `utils/snapshotModel.js` is the maths and is pure. This is the half that reads the running
// panel's sessions, writes them back, and — the part with a real constraint in it — keeps a morph
// from flooding the MIDI cable.
//
// THE THROTTLE, with the number said out loud, because the design doc asked for exactly that.
// DIN MIDI runs at 31,250 baud: ten bits per byte, so about 3,125 bytes a second, so about 1,000
// three-byte CCs a second with nothing else on the wire. A morph across a 200-parameter panel at
// 60 fps would want 12,000. So a morph tick coalesces (only the latest value per parameter
// survives), sends at most `SEND_BUDGET` parameters, and sends the ones that MOVED MOST first —
// which is what makes a rate-limited sweep still look like a sweep. What it could not send is
// counted, so a caller can tell "the morph is lagging" from "the morph is done".
//
// Snapshots live on the panel document, so they travel with it — and so a panel package carries the
// scenes somebody built rather than just the controls.

import { get, writable } from 'svelte/store';

import { collectExportParameters } from '../utils/exportParameters.js';
import { controlIdForParameter, readParameterValue, writeParameterPatch } from '../utils/panelValueAccess.js';
import {
  captureValues, diffSnapshots, makeSnapshot, morphSendPlan, morphSnapshots, morphWeighted,
} from '../utils/snapshotModel.js';
import { activePanel, updatePanel } from './panels.js';
import { panelPreviewSessions, updatePanelPreviewSession } from './interactionPreview.js';
import { cinfo, cwarn } from './console.js';

/**
 * How many parameters a single morph tick may send.
 *
 * 32 at 60 fps is 1,920 messages a second, which is already past a DIN cable — but a morph is
 * rarely running at 60 fps for long and the coalescing above collapses a held sweep. It is set to
 * be generous enough that a normal panel never hits it and low enough that a 500-parameter morph
 * degrades into a slower sweep rather than a stalled one.
 */
export const SEND_BUDGET = 32;

/** The last value map a morph sent, per panel, so the next tick can send only what moved. */
const lastMorphSent = new Map();

/** Convenience: the export parameter list for a panel, which is the snapshot's vocabulary. */
export function snapshotParameters(panel) {
  return collectExportParameters(panel);
}

/** Every snapshot stored on a panel. */
export function panelSnapshots(panel) {
  return Array.isArray(panel?.snapshots) ? panel.snapshots : [];
}

/** Read every parameter's live value out of the preview sessions. */
export function readPanelValues(panel, parameters = null) {
  const sessions = get(panelPreviewSessions) ?? {};
  const list = parameters ?? snapshotParameters(panel);
  return captureValues(list, (parameter) => {
    const controlId = controlIdForParameter(parameter, panel);
    return readParameterValue(sessions[controlId], parameter);
  });
}

/**
 * Capture the current panel into a named snapshot and store it on the panel.
 *
 * `scope` is a predicate, so "the whole panel", "this group" and "these controls" are one mechanism.
 * Returns the snapshot, or null when there was nothing to capture — a panel whose controls have all
 * been left untouched captures nothing, and saying so beats storing an empty scene that recalls to
 * no effect.
 */
export function captureSnapshot({ name = 'Snapshot', scope = null, scopeName = 'panel', now = null } = {}) {
  const panel = get(activePanel);
  if (!panel) { cwarn('[snapshot] No active panel to capture.'); return null; }

  const parameters = snapshotParameters(panel);
  const sessions = get(panelPreviewSessions) ?? {};
  const values = captureValues(parameters, (parameter) => {
    const controlId = controlIdForParameter(parameter, panel);
    return readParameterValue(sessions[controlId], parameter);
  }, scope);

  if (Object.keys(values).length === 0) {
    cwarn('[snapshot] Nothing to capture — no control on this panel has a value yet.');
    return null;
  }

  const snapshot = makeSnapshot({ name, values, scope: scopeName, now });
  updatePanel(panel.id, { snapshots: [...panelSnapshots(panel), snapshot] });
  cinfo(`[snapshot] Captured "${snapshot.name}" — ${Object.keys(values).length} parameter(s).`);
  return snapshot;
}

export function removeSnapshot(snapshotId) {
  const panel = get(activePanel);
  if (!panel) return;
  updatePanel(panel.id, { snapshots: panelSnapshots(panel).filter((s) => s.id !== snapshotId) });
}

export function renameSnapshot(snapshotId, name) {
  const panel = get(activePanel);
  if (!panel) return;
  updatePanel(panel.id, {
    snapshots: panelSnapshots(panel).map((s) => (s.id === snapshotId ? { ...s, name: String(name) } : s)),
  });
}

/**
 * Write a value map into the panel's sessions.
 *
 * The shared write for recall, morph and randomise — one place that knows a value has to reach the
 * right door and be clamped on the way. Returns how many landed.
 */
export function applyValues(values, { panel = null, parameters = null } = {}) {
  const target = panel ?? get(activePanel);
  if (!target) return 0;

  const list = parameters ?? snapshotParameters(target);
  const byId = new Map(list.map((p) => [p.id, p]));
  const sessions = get(panelPreviewSessions) ?? {};

  let written = 0;
  for (const [id, value] of Object.entries(values ?? {})) {
    const parameter = byId.get(id);
    if (!parameter) continue;
    const controlId = controlIdForParameter(parameter, target);
    if (!controlId) continue;
    updatePanelPreviewSession(controlId, writeParameterPatch(parameter, value, sessions[controlId]));
    written += 1;
  }
  return written;
}

/** Recall a snapshot: write every value it holds, instantly. */
export function recallSnapshot(snapshotId) {
  const panel = get(activePanel);
  const snapshot = panelSnapshots(panel).find((s) => s.id === snapshotId);
  if (!snapshot) { cwarn(`[snapshot] No snapshot "${snapshotId}" on this panel.`); return 0; }

  const written = applyValues(snapshot.values, { panel });
  lastMorphSent.delete(panel?.id);
  cinfo(`[snapshot] Recalled "${snapshot.name}" — ${written} parameter(s).`);
  return written;
}

/**
 * Blend two snapshots at position t and write the result.
 *
 * The budget is what keeps a continuous morph off the floor of a MIDI cable. `deferred` comes back
 * so a caller driving this from a knob can tell that it is behind, rather than wondering why the
 * sweep looks steppy.
 */
export function morphTo(fromId, toId, t, { budget = SEND_BUDGET } = {}) {
  const panel = get(activePanel);
  if (!panel) return { written: 0, deferred: 0 };

  const snapshots = panelSnapshots(panel);
  const from = snapshots.find((s) => s.id === fromId);
  const to = snapshots.find((s) => s.id === toId);
  if (!from || !to) { cwarn('[snapshot] Morph needs two snapshots that exist.'); return { written: 0, deferred: 0 }; }

  const parameters = snapshotParameters(panel);
  const blended = morphSnapshots(from, to, t, parameters);
  const plan = morphSendPlan(lastMorphSent.get(panel.id), blended, { budget });

  const toWrite = Object.fromEntries(plan.send.map((entry) => [entry.id, entry.value]));
  const written = applyValues(toWrite, { panel, parameters });

  // Only what was actually sent is remembered, so a parameter deferred this tick is still "moved"
  // next tick and gets its turn rather than being forgotten.
  lastMorphSent.set(panel.id, { ...(lastMorphSent.get(panel.id) ?? {}), ...toWrite });
  return { written, deferred: plan.deferred };
}

/** Blend N snapshots by weight — a Vector Joystick's corners, a Macro's targets. */
export function morphWeightedTo(entries, { budget = SEND_BUDGET } = {}) {
  const panel = get(activePanel);
  if (!panel) return { written: 0, deferred: 0 };

  const snapshots = panelSnapshots(panel);
  const resolved = (entries ?? [])
    .map((e) => ({ snapshot: snapshots.find((s) => s.id === e.id), weight: Number(e.weight) }))
    .filter((e) => e.snapshot);

  const parameters = snapshotParameters(panel);
  const blended = morphWeighted(resolved, parameters);
  const plan = morphSendPlan(lastMorphSent.get(panel.id), blended, { budget });

  const toWrite = Object.fromEntries(plan.send.map((entry) => [entry.id, entry.value]));
  const written = applyValues(toWrite, { panel, parameters });
  lastMorphSent.set(panel.id, { ...(lastMorphSent.get(panel.id) ?? {}), ...toWrite });
  return { written, deferred: plan.deferred };
}

/** Two snapshots, compared — the engine behind Patch Diff. */
export function compareSnapshots(aId, bId) {
  const panel = get(activePanel);
  const snapshots = panelSnapshots(panel);
  const a = snapshots.find((s) => s.id === aId);
  const b = snapshots.find((s) => s.id === bId);
  if (!a || !b) return null;
  return { a, b, ...diffSnapshots(a, b, snapshotParameters(panel)) };
}

/** Compare a snapshot against what is on screen right now — the "Compare" button. */
export function compareWithLive(snapshotId) {
  const panel = get(activePanel);
  const snapshot = panelSnapshots(panel).find((s) => s.id === snapshotId);
  if (!snapshot) return null;

  const parameters = snapshotParameters(panel);
  const live = makeSnapshot({ name: 'Live', values: readPanelValues(panel, parameters), now: 'live' });
  return { a: snapshot, b: live, ...diffSnapshots(snapshot, live, parameters) };
}

/** For a surface that wants to react to the panel's snapshot list without re-deriving it. */
export const snapshotList = writable([]);

activePanel.subscribe((panel) => snapshotList.set(panelSnapshots(panel)));
