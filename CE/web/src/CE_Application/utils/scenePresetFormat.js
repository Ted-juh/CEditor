/**
 * scenePresetFormat.js — a scene preset as data (utils/scenePreset.js says what one is): read and
 * checked from anywhere, and written to and read from its own file, `.cescene`.
 *
 * It imports nothing beyond the scene format, which imports nothing, so a panel can read the scene
 * presets it carries where only plain Node runs: the export tools load panelModel.js there
 * (test/exportToolsPlainNode.test.js), as animationPresetFormat.js is kept for the same reason.
 */
import { cleanClip, cleanTrigger, cleanClock } from './sceneFormat.js';

export const SCENE_PRESET_FORMAT = 'ceditor.scenePreset';
export const SCENE_PRESET_VERSION = 1;
const LIMITS = { name: 60, slots: 64, clips: 400, bytes: 2 * 1024 * 1024 };

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const slotIndex = (value) => (Number.isInteger(value) && value >= 0 && value < LIMITS.slots ? value : -1);

/** A scene preset read as data from anywhere, checked, or null. */
export function cleanScenePreset(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== SCENE_PRESET_FORMAT) return null;
  if (!(Number(raw.version) >= 1)) return null;
  const id = text(raw.id, 64);
  if (!/^[A-Za-z0-9_:-]+$/.test(id)) return null;
  const slots = (Array.isArray(raw.slots) ? raw.slots : []).slice(0, LIMITS.slots).map((slot) => ({
    type: text(slot?.type, 40),
    label: text(slot?.label, LIMITS.name),
    needs: {
      text: slot?.needs?.text === true,
      value: slot?.needs?.value === true,
      parts: (Array.isArray(slot?.needs?.parts) ? slot.needs.parts : []).map((part) => text(part, 64)).filter((part) => /^[A-Za-z0-9_-]+$/.test(part)),
      patterns: (Array.isArray(slot?.needs?.patterns) ? slot.needs.patterns : []).map((name) => text(name, 129)).filter((name) => /^(?:[A-Za-z0-9_-]+\.)?[A-Za-z0-9_-]+$/.test(name)),
    },
  }));
  if (!slots.length) return null;
  // Each clip read as a scene clip would be, on a stand-in control, then given back its slot.
  const clips = [];
  for (const clip of (Array.isArray(raw.clips) ? raw.clips : []).slice(0, LIMITS.clips)) {
    const slot = slotIndex(clip?.slot);
    if (slot < 0 || slot >= slots.length) continue;
    const read = cleanClip({ ...clip, id: 'c', controlId: 'slot' });
    if (!read) continue;
    clips.push({ slot, target: read.target, start: read.start, length: read.length, effect: read.effect, ...(read.label ? { label: read.label } : {}) });
  }
  if (!clips.length) return null;
  const trigger = cleanTrigger({ ...(raw.trigger ?? {}), controlId: 'slot' });
  const triggerSlot = slotIndex(raw.trigger?.slot);
  if (trigger.controlId !== undefined) {
    delete trigger.controlId;
    if (triggerSlot < 0 || triggerSlot >= slots.length) return null;
    trigger.slot = triggerSlot;
  }
  const clockRead = cleanClock({ ...(raw.clock ?? {}), controlId: 'slot' });
  let clock = null;
  if (clockRead) {
    const clockSlot = slotIndex(raw.clock?.slot);
    if (clockSlot < 0 || clockSlot >= slots.length) return null;
    clock = { ...clockRead, slot: clockSlot };
    delete clock.controlId;
  }
  const span = clips.reduce((end, clip) => Math.max(end, clip.start + clip.length), 0);
  return {
    format: SCENE_PRESET_FORMAT,
    version: SCENE_PRESET_VERSION,
    id,
    name: text(raw.name, LIMITS.name) || 'Scene preset',
    length: Math.max(Math.round(Number(raw.length) || 0), span, 100),
    loop: raw.loop === true,
    trigger,
    ...(clock ? { clock } : {}),
    slots,
    clips,
  };
}

/** A .cescene file's text: the preset, checked, as JSON. */
export function scenePresetFileText(preset) {
  return `${JSON.stringify(cleanScenePreset(preset), null, 2)}\n`;
}

/** A .cescene file's text, read: `{ preset }` or `{ error }` saying what is wrong with it. */
export function readScenePresetFile(textValue) {
  const source = String(textValue ?? '');
  if (source.length > LIMITS.bytes) return { error: 'This file is too large to be a scene preset.' };
  let raw;
  try { raw = JSON.parse(source); } catch { return { error: 'This file is not a scene preset: it is not JSON.' }; }
  if (raw?.format !== SCENE_PRESET_FORMAT) return { error: 'This file is not a scene preset.' };
  if (Number(raw.version) > SCENE_PRESET_VERSION) return { error: 'This scene preset was saved by a newer CEditor.' };
  const preset = cleanScenePreset(raw);
  if (!preset) return { error: 'This scene preset has nothing in it this CEditor can play.' };
  return { preset };
}
