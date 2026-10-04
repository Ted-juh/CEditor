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
// A knob or slider in the selection becomes a channel of the component (utils/sliderControlPart.js).
// The placed copy is what carries, per knob: its device bindings, moved to its channel; the host
// parameter id it exported under, so a DAW's automation and saved state still find it; its entry in
// an explicit export list, pointed at the channel; and its live value, so nothing moves on screen.
// The copy's name is one no other control has, because a channel is addressed through it.
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
import { collectControlNames } from '../utils/containment.js';
import { readParameterValue } from '../utils/panelValueAccess.js';
import { panelPreviewSessions, updatePanelPreviewSession } from './interactionPreview.js';
import { uniqueControlName } from './controls.js';

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
  const otherNames = collectControlNames((panel.controls ?? []).filter((control) => !removed.has(String(control?._children?.Core?.id ?? ''))));
  instance._children.Core.name = uniqueControlName(otherNames, instance._children.Core.name ?? name, 'Component');
  const liveValues = placeValueControls(instance, plan.values ?? []);

  panels.update((list) => updatePanelInList(list, panelId, (current) => {
    const kept = (current.controls ?? []).filter((control) => !removed.has(String(control?._children?.Core?.id ?? '')));
    const next = { ...current, controls: [...kept.slice(0, plan.insertIndex), instance, ...kept.slice(plan.insertIndex)], modified: true };
    const exportParameters = repointExportParameters(current.exportParameters, instance, plan.values ?? []);
    if (exportParameters) next.exportParameters = exportParameters;
    return next;
  }));
  if (Object.keys(liveValues).length) updatePanelPreviewSession(instance._children.Core.id, { customValues: liveValues });
  selectedComponentIds.set(new Set([instance._children.Core.id]));

  cinfo(`[component] ✓ ${plan.rootIds.length} control(s) → "${name}" in the library, placed as a linked copy.`);
  notify(`Made "${name}" from ${plan.rootIds.length} control(s) and saved it to the library. The panel now holds a linked copy.`, { duration: 6000 });
  return { ok: true, entry, instance, plan };
}

/**
 * Give the placed copy what each converted knob carried, and return the knobs' live values by channel.
 *
 * Bindings keep everything but their port, which is now the knob's channel: a binding whose port is a
 * channel name drives that channel (utils/deviceBindingSync.js, exportParameters.deviceWireFor). The
 * host parameter record is read by exportParameters.keepHostParameterIds.
 */
export function placeValueControls(instance, values, sessions = get(panelPreviewSessions) ?? {}) {
  const children = instance._children;
  const live = {};
  if (!values.length) return live;
  const bindings = values.flatMap((value) => value.bindings ?? []);
  if (bindings.length) {
    children.DeviceBindings = { ...(children.DeviceBindings ?? { _type: 'DeviceBindings' }), enabled: true, bindings };
  }
  children.Core.hostParameters = Object.fromEntries(values.map((value) => [value.channel, { ...value.hostParameter }]));
  for (const value of values) {
    const current = readParameterValue(sessions[value.controlId], { path: `${value.name}.value` });
    if (current !== undefined) {
      live[value.channel] = current;
      const channel = children.ValueChannels?._children?.[value.channel];
      if (channel) channel.currentValue = current;
    }
  }
  return live;
}

/**
 * An explicit export list names a converted knob by path; point those entries at its channel. The id
 * stays — it is what the DAW knows — and so does the label. Null when there is nothing to change.
 */
export function repointExportParameters(list, instance, values) {
  if (!Array.isArray(list) || !list.length || !values.length) return null;
  const byName = new Map(values.map((value) => [value.name, value]));
  const instanceName = String(instance._children.Core.name);
  let changed = false;
  const next = list.map((entry) => {
    const value = byName.get(String(entry?.controlName ?? ''));
    if (!value) return entry;
    changed = true;
    return { ...entry, controlName: instanceName, path: `${instanceName}.${value.channel}` };
  });
  return changed ? next : null;
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
