/**
 * animationPresetFormat.js — an animation preset as data: what a .ceanim file and a panel's
 * `animationPresets` hold, checked as it is read, and written back (the Animation Designer's step 4;
 * the model that makes and applies presets is animationPresetModel.js).
 *
 * IT IMPORTS NOTHING, and that is the point of it being a file of its own. The saved document
 * (stores/panelModel.js) reads every preset a panel carries, and the export tools run that code
 * under plain Node on the Windows job (tools/scripts/prepare-export-panel.mjs). The animation model
 * brings the whole interaction runtime with it, which has an import plain Node cannot resolve; when
 * panelModel imported the model, preparing an export failed (exportToolsPlainNode.test.js). So the
 * two things it needed from there are written here, and animationPresetFormat.test.js holds them
 * equal to the model's: the animation kinds, and the rule for an animation's name.
 */

/**
 * The animation kinds a preset may hold: animationModel.js ANIMATION_KINDS, and VALUE_KIND (what a
 * knob's value draws, step 6). A CEditor from before step 6 refuses a value preset, as it should.
 */
export const PRESET_KINDS = Object.freeze(['transition', 'keyframes', 'sequence', 'text', 'value']);

/** An animation's name as a path segment: animationModel.js cleanAnimationName. */
export function cleanPresetAnimationName(wanted) {
  return String(wanted ?? '').trim().replace(/[^A-Za-z0-9_]+/g, '');
}

const deepCopy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export const PRESET_FORMAT = 'ceditor-animation-preset';
export const PRESET_FORMAT_VERSION = 1;
export const PRESET_FILE_EXTENSION = '.ceanim';
// 'scene' — several controls on one time axis — arrives with panel scenes (step 5).
export const PRESET_SIZES = ['effect', 'recipe'];
export const PRESET_COLOURS = ['keep', 'control'];
export const LINK_KEY = 'preset';

/** The most a preset file may hold: past this, a mistake or not a preset. */
const LIMITS = { animations: 64, bytes: 1024 * 1024, name: 80, category: 40, tags: 12, tag: 24 };

const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/**
 * A preset read as data from anywhere — a file, a panel, the library — checked and tidied, or null.
 * What it keeps of an animation is what the editor writes; a kind it does not know is refused, so a
 * newer CEditor's preset says so rather than half-applying.
 */
export function cleanPreset(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== PRESET_FORMAT) return null;
  if (!(Number(raw.version) >= 1)) return null;
  const id = text(raw.id, 64);
  if (!/^[A-Za-z0-9_:-]+$/.test(id)) return null;
  const animations = {};
  for (const [key, node] of Object.entries(raw.animations ?? {}).slice(0, LIMITS.animations)) {
    const name = cleanPresetAnimationName(key);
    if (!name || !node || typeof node !== 'object') continue;
    if (!PRESET_KINDS.includes(String(node.kind ?? 'transition'))) return null;
    const { [LINK_KEY]: _link, ...rest } = deepCopy(node);
    animations[name] = { ...rest, _type: 'Animation', name };
  }
  if (!Object.keys(animations).length) return null;
  const states = {};
  for (const [key, state] of Object.entries(raw.states ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_ -]{0,39}$/.test(key) || !state || typeof state !== 'object') continue;
    states[key] = {
      when: state.when && typeof state.when === 'object' ? deepCopy(state.when) : {},
      patches: {
        component: state.patches?.component && typeof state.patches.component === 'object' ? deepCopy(state.patches.component) : {},
        parts: state.patches?.parts && typeof state.patches.parts === 'object' ? deepCopy(state.patches.parts) : {},
      },
    };
  }
  const fields = {};
  for (const [path, value] of Object.entries(raw.fields ?? {})) {
    // Only what a recipe is known to need: a path into Text, set to a word.
    if (path === 'Text.shows' && /^[a-zA-Z]{1,24}$/.test(String(value))) fields[path] = String(value);
  }
  return {
    format: PRESET_FORMAT,
    version: PRESET_FORMAT_VERSION,
    id,
    name: text(raw.name, LIMITS.name) || 'Animation preset',
    category: text(raw.category, LIMITS.category),
    tags: (Array.isArray(raw.tags) ? raw.tags : []).map((tag) => text(tag, LIMITS.tag)).filter(Boolean).slice(0, LIMITS.tags),
    size: Object.keys(animations).length > 1 ? 'recipe' : 'effect',
    colours: PRESET_COLOURS.includes(raw.colours) ? raw.colours : 'keep',
    revision: Math.max(1, Math.round(Number(raw.revision) || 1)),
    animations,
    states,
    fields,
  };
}

// --- As a file ----------------------------------------------------------------------------------

/** A preset as the text of a .ceanim file. */
export function presetFileText(preset) {
  return `${JSON.stringify(cleanPreset(preset), null, 2)}\n`;
}

/** A .ceanim file's text, read: `{ preset }` or `{ error }` saying what is wrong with it. */
export function readPresetFile(textValue) {
  const source = String(textValue ?? '');
  if (source.length > LIMITS.bytes) return { error: 'This file is too large to be an animation preset.' };
  let raw;
  try { raw = JSON.parse(source); } catch { return { error: 'This file is not an animation preset: it is not JSON.' }; }
  if (raw?.format !== PRESET_FORMAT) return { error: 'This file is not an animation preset.' };
  if (Number(raw.version) > PRESET_FORMAT_VERSION) return { error: 'This animation preset was saved by a newer CEditor.' };
  const preset = cleanPreset(raw);
  if (!preset) return { error: 'This animation preset has nothing in it this CEditor can play.' };
  return { preset };
}

/** A file name for a preset: its name, with what a file system refuses taken out. */
export function presetFileName(preset) {
  const base = String(preset?.name ?? 'Animation preset').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Animation preset';
  return `${base}${PRESET_FILE_EXTENSION}`;
}
