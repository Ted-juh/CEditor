/**
 * animationPresetLibrary.js — where animation presets live, and the commands on them (the Animation
 * Designer's step 4; the model is utils/animationPresetModel.js).
 *
 * Three places, as the design has it:
 *
 *   - Built-in: the code presets in utils/animationPresets.js. Applied as they always were (a copy,
 *     with the state change they need); "Save as preset" on the result makes one of your own.
 *   - Mine: your library, in this machine's storage (localStorage, as control sets, card presets and
 *     saved scripts are — app settings drop keys they do not know). Survives every panel.
 *   - This panel: `panel.animationPresets`, written into the document as soon as a preset is used
 *     there, because a linked animation follows the panel's copy. That is how a panel carries the
 *     presets it uses to another machine and into the plug-in, and why deleting one from your library
 *     leaves every panel that uses it its own copy.
 *
 * A panel's copy wins over the library's of the same id, as card presets' does: it is what the
 * panel's animations were made from. Nothing here adds another person's presets to your library
 * behind your back; `adoptPanelPresets` is the "keep these" step, offered, not taken.
 *
 * Every command that changes the panel is one undo step. A library write is not in the document's
 * history, as a control set library write is not.
 */
import { derived, get, writable } from 'svelte/store';
import { activePanel, updatePanel } from './panels.js';
import { applyControlPatch } from './controls.js';
import { beginHistoryTransaction, commitHistoryTransaction } from './history.js';
import { flatControls } from '../utils/containment.js';
import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
import {
  LINK_KEY,
  applyPresetPatch,
  buildPreset,
  clearOverrides,
  cleanPreset,
  detachNode,
  followedAnimation,
  followersUpdate,
  presetLink,
  presetWithAnimation,
  presetsInUse,
  readPresetFile,
  revertOverride,
} from '../utils/animationPresetModel.js';

const STORAGE_KEY = 'ce.animationPresets.v1';

const cleanList = (list) => (Array.isArray(list) ? list.map(cleanPreset).filter(Boolean) : []);

/** Mine: your library. Persisted; survives every panel. */
export const animationPresetLibrary = writable(cleanList(readStoredJson(STORAGE_KEY, [])));
animationPresetLibrary.subscribe((list) => { writeStoredJson(STORAGE_KEY, list); });

/** This panel: the presets the open panel carries. Read through from the document. */
export const panelAnimationPresets = derived(activePanel, ($panel) => cleanList($panel?.animationPresets));

/** The ids the open panel's animations follow. */
export const panelPresetsInUse = derived(activePanel, ($panel) => presetsInUse(flatControls($panel?.controls ?? [])));

/** The panel's presets your library does not have: what opening a shared panel offers to add. */
export const presetsToAdopt = derived([panelAnimationPresets, animationPresetLibrary], ([$panel, $mine]) => {
  const known = new Set($mine.map((preset) => preset.id));
  return $panel.filter((preset) => !known.has(preset.id));
});

/** A preset by id: the panel's copy first, then yours. */
export function presetById(id) {
  return get(panelAnimationPresets).find((preset) => preset.id === id)
    ?? get(animationPresetLibrary).find((preset) => preset.id === id)
    ?? null;
}

function controlsOfPanel() {
  return flatControls(get(activePanel)?.controls ?? []);
}

function controlById(id) {
  return controlsOfPanel().find((control) => control?._children?.Core?.id === id) ?? null;
}

/** Put a preset in the open panel, replacing its copy of the same id. Inside a step. */
function carryInPanel(preset) {
  const panel = get(activePanel);
  if (!panel || !preset) return;
  const current = Array.isArray(panel.animationPresets) ? panel.animationPresets : [];
  const next = [...current.filter((entry) => entry?.id !== preset.id), preset];
  updatePanel(panel.id, { animationPresets: next });
}

/** Put a preset in your library, replacing your copy of the same id. */
function keepInLibrary(preset) {
  animationPresetLibrary.update((list) => [...list.filter((entry) => entry.id !== preset.id), preset]);
}

function step(label, fn) {
  const transaction = beginHistoryTransaction({ label });
  try {
    return fn();
  } finally {
    commitHistoryTransaction(transaction);
  }
}

/**
 * Save some of a control's animations as a preset. It is carried by this panel, and kept in your
 * library too unless `where` is 'panel'; the animations it was made from follow it from now on.
 * `{ preset }` or `{ reason }`.
 */
export function saveAnimationPreset(controlId, names, { name, category = '', tags = [], colours = 'keep', where = 'mine' } = {}) {
  const control = controlById(controlId);
  const { preset, reason } = buildPreset(control, names, { name, category, tags, colours });
  if (!preset) return { reason };
  step(`Save animation preset ${preset.name}`, () => {
    carryInPanel(preset);
    const patch = {};
    for (const from of Object.keys(preset.animations)) {
      const node = control._children.Animations._children[from];
      patch[`Animations.${from}`] = { ...node, [LINK_KEY]: { id: preset.id, revision: preset.revision, from } };
    }
    applyControlPatch(controlId, patch);
  });
  if (where !== 'panel') keepInLibrary(preset);
  return { preset };
}

/**
 * Put a preset on controls, linked unless `link` is false; it is carried by the panel when linked.
 * `{ applied: [{ controlId, names }], refused: [{ controlId, reason }] }`.
 */
export function applyAnimationPreset(controlIds, presetId, { link = true } = {}) {
  const preset = presetById(presetId);
  const applied = [];
  const refused = [];
  if (!preset) return { applied, refused: controlIds.map((controlId) => ({ controlId, reason: 'That preset is gone.' })) };
  step(`Apply animation preset ${preset.name}`, () => {
    for (const controlId of controlIds) {
      const result = applyPresetPatch(controlById(controlId), preset, { link });
      if (!result.patch) { refused.push({ controlId, reason: result.reason }); continue; }
      applyControlPatch(controlId, result.patch);
      applied.push({ controlId, names: result.names });
    }
    if (link && applied.length) carryInPanel(preset);
  });
  return { applied, refused };
}

/** The preset a control's animation follows, and the animation in it, or nulls. */
export function followedBy(controlId, name) {
  const node = controlById(controlId)?._children?.Animations?._children?.[name];
  const link = presetLink(node);
  const preset = link ? presetById(link.id) : null;
  return { node, link, preset, followed: followedAnimation(node, preset) };
}

function writeAnimation(controlId, name, node, label) {
  step(label, () => applyControlPatch(controlId, { [`Animations.${name}`]: node }));
}

/** Put one overridden setting back to the preset's. */
export function revertAnimationOverride(controlId, name, key) {
  const { node, followed } = followedBy(controlId, name);
  if (!node || !followed) return;
  writeAnimation(controlId, name, revertOverride(node, followed, key), `Revert ${key}`);
}

/** Every setting back to the preset's; still linked. */
export function clearAnimationOverrides(controlId, name) {
  const { node, followed } = followedBy(controlId, name);
  if (!node || !followed) return;
  writeAnimation(controlId, name, clearOverrides(node, followed), 'Clear overrides');
}

/** The animation on its own, following nothing. */
export function detachAnimation(controlId, name) {
  const { node } = followedBy(controlId, name);
  if (!node) return;
  writeAnimation(controlId, name, detachNode(node), 'Detach from preset');
}

/**
 * Apply to preset: this animation's settings become the preset's, and every animation in the panel
 * that follows it takes them, except what each has overridden itself — one undo step. Your library's
 * copy changes too, where you have one. `{ preset, followers }` or `{ reason }`.
 */
export function applyToPreset(controlId, name) {
  const { node, link, preset } = followedBy(controlId, name);
  if (!node || !preset) return { reason: 'This animation follows no preset.' };
  const next = presetWithAnimation(preset, link.from, node);
  if (!next) return { reason: 'The preset could not be written.' };
  let followers = 0;
  step(`Apply to animation preset ${next.name}`, () => {
    carryInPanel(next);
    // This animation is now the preset's version, with nothing of its own.
    const writes = followersUpdate(controlsOfPanel(), preset, next)
      .map((write) => (write.controlId === controlId && write.name === name ? { ...write, node: clearOverrides(node, next.animations[link.from]) } : write));
    for (const write of writes) {
      write.node[LINK_KEY] = { ...write.node[LINK_KEY], revision: next.revision };
      applyControlPatch(write.controlId, { [`Animations.${write.name}`]: write.node });
    }
    followers = writes.length;
  });
  if (get(animationPresetLibrary).some((entry) => entry.id === next.id)) keepInLibrary(next);
  return { preset: next, followers };
}

/**
 * Bring the panel's copy of a preset up to your library's newer version, and every animation that
 * follows it with it. `{ followers }` or `{ reason }`.
 */
export function updatePanelPreset(id) {
  const mine = get(animationPresetLibrary).find((preset) => preset.id === id);
  const carried = get(panelAnimationPresets).find((preset) => preset.id === id);
  if (!mine || !carried) return { reason: 'There is nothing to bring up to date.' };
  if (mine.revision <= carried.revision) return { reason: 'This panel has the newest version already.' };
  let followers = 0;
  step(`Update animation preset ${mine.name}`, () => {
    carryInPanel(mine);
    const writes = followersUpdate(controlsOfPanel(), carried, mine);
    for (const write of writes) applyControlPatch(write.controlId, { [`Animations.${write.name}`]: write.node });
    followers = writes.length;
  });
  return { followers };
}

/** Rename, recategorise or retag a preset wherever it is; the animations that follow it are unchanged. */
export function describePreset(id, { name, category, tags }) {
  const change = (preset) => cleanPreset({ ...preset, name: name ?? preset.name, category: category ?? preset.category, tags: tags ?? preset.tags });
  const carried = get(panelAnimationPresets).find((preset) => preset.id === id);
  if (carried) step('Rename animation preset', () => carryInPanel(change(carried)));
  const mine = get(animationPresetLibrary).find((preset) => preset.id === id);
  if (mine) keepInLibrary(change(mine));
}

/** Take a preset out of your library. Every panel that carries it keeps its copy. */
export function removeFromLibrary(id) {
  animationPresetLibrary.update((list) => list.filter((preset) => preset.id !== id));
}

/**
 * Take a preset out of this panel. Not while anything follows it: detach those first, or the link
 * would name nothing. `{ removed }` or `{ reason }`.
 */
export function removeFromPanel(id) {
  const users = controlsOfPanel().reduce((count, control) => count
    + Object.values(control?._children?.Animations?._children ?? {}).filter((node) => presetLink(node)?.id === id).length, 0);
  if (users) return { reason: `${users} animation${users > 1 ? 's follow' : ' follows'} it here. Detach ${users > 1 ? 'them' : 'it'} first.` };
  const panel = get(activePanel);
  if (!panel) return { reason: 'No panel is open.' };
  step('Remove animation preset from panel', () => {
    updatePanel(panel.id, { animationPresets: (panel.animationPresets ?? []).filter((preset) => preset?.id !== id) });
  });
  return { removed: true };
}

/** Add the panel's presets you lack to your library: the "keep these" for a panel you were sent. */
export function adoptPanelPresets() {
  const added = get(presetsToAdopt);
  for (const preset of added) keepInLibrary(preset);
  return added;
}

/**
 * Bring in a .ceanim file's text: into your library, or only this panel. A preset you already have
 * in the same or a newer version is not replaced. `{ preset, replaced }` or `{ error }`.
 */
export function importPresetText(text, { where = 'mine' } = {}) {
  const { preset, error } = readPresetFile(text);
  if (!preset) return { error };
  const existing = where === 'panel'
    ? get(panelAnimationPresets).find((entry) => entry.id === preset.id)
    : get(animationPresetLibrary).find((entry) => entry.id === preset.id);
  if (existing && existing.revision >= preset.revision) {
    return { error: `You have “${existing.name}” already, in the same or a newer version.` };
  }
  if (where === 'panel') step(`Import animation preset ${preset.name}`, () => carryInPanel(preset));
  else keepInLibrary(preset);
  return { preset, replaced: !!existing };
}

/** For tests: start from an empty library. */
export function resetAnimationPresetLibraryForTesting(list = []) {
  animationPresetLibrary.set(cleanList(list));
}
