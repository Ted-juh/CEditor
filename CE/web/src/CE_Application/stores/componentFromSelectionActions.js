// componentFromSelectionActions.js — Edit › Create Component from Selection.
//
// utils/customComponentFromControls.js decides what converts and builds the component. This file does
// the three things around it, in an order that loses nothing if a step refuses:
//
//   1. plan (pure) — refused controls stop the command here, before anything is written;
//   2. save the component to the library, under a name no existing package has, so a save can never
//      overwrite somebody's package;
//   3. in ONE panel write — so one undo step — take the selected controls out and put a linked copy of
//      the component where they were, in their paint position, and select it.
//
// Undo puts the controls back; it does not take the package out of the library, which is a separate
// store with no undo of its own. The package is what the user asked for, so that is the right way
// round, and the notification says where it went.

import { get } from 'svelte/store';

import { panels, resolvedActivePanelId, selectedComponentIds } from './panels.js';
import { activeControlSet } from './controlSets.js';
import { customComponentLibrary } from './customComponentLibrary.js';
import { cinfo, cwarn } from './console.js';
import { notify } from './scriptUi.js';
import { updatePanelInList } from './panelDocumentHelpers.js';
import { describeRefusals, planComponentFromSelection } from '../utils/customComponentFromControls.js';
import { instantiateCustomComponentPackageControl } from '../utils/customComponentPackage.js';

let measuringSpan = null;

/**
 * Text width as the page will actually draw it, for the overflow refusal in
 * customComponentFromControls.js. A hidden element styled like the part text, not a canvas: when a
 * family is not installed the DOM and a canvas fall back to DIFFERENT fonts, and a measurement that
 * disagrees with the render is worse than none. Null where there is no document.
 */
export function measureLabelText(text, font) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (!measuringSpan) {
    measuringSpan = document.createElement('span');
    measuringSpan.setAttribute('aria-hidden', 'true');
    measuringSpan.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;padding:0;border:0;line-height:1';
    document.body.appendChild(measuringSpan);
  }
  measuringSpan.style.fontFamily = String(font?.family ?? 'Arial');
  measuringSpan.style.fontSize = `${Number(font?.size) || 12}px`;
  measuringSpan.style.fontWeight = String(Number(font?.weightValue) || 400);
  measuringSpan.style.fontStyle = String(font?.style ?? 'Normal').toLowerCase() === 'italic' ? 'italic' : 'normal';
  measuringSpan.style.letterSpacing = '0px';
  measuringSpan.textContent = String(text ?? '');
  return measuringSpan.getBoundingClientRect().width;
}

/** A package name no library entry has yet: "Plate", else "Plate 2", "Plate 3"… */
export function unusedPackageName(wanted, entries = []) {
  const base = String(wanted ?? '').trim() || 'Artwork';
  const taken = new Set(entries.map((entry) => String(entry?.name ?? '').trim().toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} ${n}`;
  return name;
}

/**
 * Convert the selection. Returns `{ ok, refused }` or `{ ok, entry, instance }`, and reports either
 * way — the refusals name every control and setting, because "could not create component" is not
 * something anyone can act on.
 */
export function createComponentFromSelection(wantedName = 'Artwork') {
  const panelId = get(resolvedActivePanelId);
  const panel = get(panels).find((entry) => entry.id === panelId);
  const ids = [...(get(selectedComponentIds) ?? [])];
  if (!panel || !ids.length) {
    notify('Select the artwork to turn into a component first.', { kind: 'warn' });
    return { ok: false, refused: [] };
  }

  const name = unusedPackageName(wantedName, customComponentLibrary.snapshot());
  const plan = planComponentFromSelection(panel, ids, {
    set: get(activeControlSet),
    name,
    measure: typeof document === 'undefined' ? null : measureLabelText,
  });
  if (!plan.ok) {
    const lines = describeRefusals(plan.refused);
    for (const line of lines) cwarn(`[component] ${line}`);
    notify(
      lines.length === 1
        ? `Cannot make a component: ${lines[0]}.`
        : `Cannot make a component — ${lines.length} controls can't convert without changing how they look. The Console lists them.`,
      { kind: 'warn', duration: 0 },
    );
    return plan;
  }

  const entry = customComponentLibrary.saveControl(plan.component, {
    name,
    version: '1.0.0',
    category: 'artwork',
    tags: ['artwork'],
  });
  const instance = instantiateCustomComponentPackageControl(entry.envelope, {
    id: `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    Transform: { x: plan.bounds.x, y: plan.bounds.y },
  });
  instance._children.Core.layer = plan.layer;
  instance._children.Core.zIndex = plan.zIndex;

  const removed = new Set(plan.rootIds);
  panels.update((list) => updatePanelInList(list, panelId, (current) => {
    const kept = (current.controls ?? []).filter((control) => !removed.has(String(control?._children?.Core?.id ?? '')));
    return { ...current, controls: [...kept.slice(0, plan.insertIndex), instance, ...kept.slice(plan.insertIndex)], modified: true };
  }));
  selectedComponentIds.set(new Set([instance._children.Core.id]));

  cinfo(`[component] ✓ ${plan.rootIds.length} control(s) → "${name}" in the library, placed as a linked copy.`);
  notify(`Made "${name}" from ${plan.rootIds.length} control(s) and saved it to the library. The panel now holds a linked copy.`, { duration: 6000 });
  return { ok: true, entry, instance, plan };
}

/**
 * The menu command: ask for a name, then convert. The suggestion is the first label's text, which is
 * usually what the artwork says it is ("FILTER"); Cancel does nothing.
 */
export function createComponentFromSelectionWithPrompt() {
  const panelId = get(resolvedActivePanelId);
  const panel = get(panels).find((entry) => entry.id === panelId);
  const ids = new Set([...(get(selectedComponentIds) ?? [])].map(String));
  const firstLabel = (panel?.controls ?? []).find((control) => ids.has(String(control?._children?.Core?.id))
    && control._children.Core.controlType === 'Label' && String(control._children.Text?.content ?? '').trim());
  const suggestion = String(firstLabel?._children?.Text?.content ?? '').trim().slice(0, 40) || 'Artwork';
  const answer = typeof window !== 'undefined' && typeof window.prompt === 'function'
    ? window.prompt('Name the new component:', suggestion)
    : suggestion;
  if (answer == null) return null;
  return createComponentFromSelection(answer);
}
