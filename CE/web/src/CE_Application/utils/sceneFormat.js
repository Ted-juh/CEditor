/**
 * sceneFormat.js — a panel scene as data: what `panel.scenes` holds, checked as it is read (the
 * Animation Designer, step 5; docs/design/animation-designer.md). What a scene does with that data —
 * tracks, the controls' own animations as scenes, playing — is sceneModel.js.
 *
 * IT IMPORTS NOTHING, for the reason animationPresetFormat.js does not: the saved document
 * (stores/panelModel.js) reads every scene a panel has, and the export tools run that under plain
 * Node, where the animation model's imports do not resolve.
 *
 *   scene: { id, name,
 *            trigger: { type: 'panelOpen' }               // when the panel is shown
 *                   | { type: 'state', controlId, to }     // a control enters a state
 *                   | { type: 'event', controlId, event }  // a click, a long press… on a control
 *                   | { type: 'beat', every }              // every N beats while the transport runs
 *                   | { type: 'midi', message, channel,    // MIDI in (utils/sceneMidi.js): a note-on,
 *                       note | cc, above | program }       //   a controller past a point, a program
 *                   | { type: 'script' },                  // only when ce.anim.play asks
 *            length,                                      // ms: where the timeline ends
 *            loop,                                        // plays again from the start
 *            clips: [{ id, controlId, target, start, length, effect, label? }] }
 *
 * A CLIP is an effect on one place of one control for a stretch of the scene's time. `target` is
 * where on the control, as a keyframe animation's target is: 'Transform' (the control), 'Text' (its
 * words) or 'Parts.<name>'. `effect` is an animation as the control stores one, of kind keyframes or
 * text, minus what the clip says itself (when, how long, where): what the keyframe and text players
 * already read, so a scene plays through the engines every control's animations play through.
 *
 * One more place and kind (step 6, "value-drawn"): target 'Value' is what a knob's or a slider's
 * value draws — its pointer, its arc, its fill — and an effect of kind 'value' moves it for the
 * length of the clip, then hands back to the value (utils/valueDrawn.js):
 *
 *   effect: { kind: 'value', easing, frames: [{ at,          // 0 to 1 of the clip
 *                                              value?,       // where, 0 to 1 of the range
 *                                              by? }] }      // or this far from the live value
 *
 * A frame with neither is the live value, wherever it is at that moment. The two go together: a
 * 'value' effect plays only on 'Value', and nothing else does.
 *
 * And 'Patterns.<name>': one of the control's own background patterns (utils/patternLayers.js), which
 * a keyframe effect moves and fades as a whole while its scroll goes on underneath. Only keyframes
 * play there.
 */

export const SCENE_TRIGGER_TYPES = Object.freeze(['panelOpen', 'state', 'event', 'beat', 'midi', 'script']);
/** What a MIDI trigger hears: a note played, a controller pushed past a point, a program change. */
export const MIDI_TRIGGER_MESSAGES = Object.freeze(['note', 'cc', 'program']);
export const CLIP_KINDS = Object.freeze(['keyframes', 'text', 'value']);
/** The clip target that is what a control's value draws (step 6). */
export const VALUE_TARGET = 'Value';
const VALUE_FRAMES_MAX = 16;

/** The longest a scene or a clip may be, ms: past this, a typo. */
export const SCENE_MAX_LENGTH = 600000;
const LIMITS = { name: 60, clips: 400, scenes: 200 };

const deepCopy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const id = (value) => (/^[A-Za-z0-9_:-]{1,64}$/.test(String(value ?? '')) ? String(value) : '');
const ms = (value, fallback, lo = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(SCENE_MAX_LENGTH, Math.max(lo, Math.round(n))) : fallback;
};

/** A new id: random, so two scenes, or two clips, never share one. */
export function newSceneId(prefix = 'sc', random = Math.random) {
  let out = '';
  for (let i = 0; i < 10; i += 1) out += Math.floor(random() * 36).toString(36);
  return `${prefix}_${out}`;
}

/**
 * A MIDI trigger read: `channel` 1 to 16, or 0 for any; a note-on of `note` (0 to 127, or -1 for any);
 * a controller `cc` going past `above` on its way up; or a program change to `program` (or -1, any).
 */
function cleanMidiTrigger(raw) {
  const whole = (value, lo, hi, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  };
  const message = MIDI_TRIGGER_MESSAGES.includes(raw?.message) ? raw.message : 'note';
  const channelRead = whole(raw?.channel, 0, 99, 0);
  const channel = channelRead > 16 ? 0 : channelRead;
  if (message === 'cc') return { type: 'midi', message, channel, cc: whole(raw?.cc, 0, 119, 64), above: whole(raw?.above, 0, 126, 63) };
  if (message === 'program') return { type: 'midi', message, channel, program: whole(raw?.program, -1, 127, -1) };
  return { type: 'midi', message, channel, note: whole(raw?.note, -1, 127, -1) };
}

/** A trigger read with what it needs, or the script trigger when it makes no sense. */
export function cleanTrigger(raw) {
  const type = SCENE_TRIGGER_TYPES.includes(raw?.type) ? raw.type : 'script';
  if (type === 'state') return { type, controlId: id(raw.controlId), to: text(raw.to, 40).toLowerCase() || 'hover' };
  if (type === 'event') return { type, controlId: id(raw.controlId), event: text(raw.event, 24) || 'click' };
  if (type === 'beat') return { type, every: Math.max(1, Math.min(64, Math.round(Number(raw.every) || 1))) };
  if (type === 'midi') return cleanMidiTrigger(raw);
  return { type };
}

/**
 * What drives a scene's playhead, when it is not time (step 5c, "Gestures that drive a scene"):
 *   source     'value' (the control's value, 0 to 1), 'drag' (a drag on it), 'wheel' (its wheel),
 *              'pointerX' / 'pointerY' (where the pointer is across it);
 *   controlId  the control it listens to;
 *   span       how far moves the whole scene: pixels for a drag, notches for the wheel;
 *   direction  the way a drag moves it forward: up, down, left, right;
 *   follow     'exact', 'smooth', or on a 'spring';
 *   part       the part a drag, the wheel or the pointer is heard on; absent: the whole control;
 *   release    when the hand lets go (a drag, the pointer leaving): 'stay', spring 'back' to the start,
 *              or 'carry' on with the drag's speed.
 * Time is the default and is stored as no clock at all.
 */
export const CLOCK_SOURCES = Object.freeze(['time', 'value', 'drag', 'wheel', 'pointerX', 'pointerY']);
export const CLOCK_FOLLOWS = Object.freeze(['exact', 'smooth', 'spring']);
export const CLOCK_RELEASES = Object.freeze(['stay', 'back', 'carry']);
export const DRAG_DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);

export function cleanClock(raw) {
  const source = CLOCK_SOURCES.includes(raw?.source) ? raw.source : 'time';
  if (source === 'time') return null;
  const span = Number(raw?.span);
  const fallbackSpan = source === 'wheel' ? 10 : 130;
  return {
    source,
    controlId: id(raw?.controlId),
    span: Number.isFinite(span) && span > 0 ? Math.min(4000, Math.round(span)) : fallbackSpan,
    direction: DRAG_DIRECTIONS.includes(raw?.direction) ? raw.direction : 'up',
    follow: CLOCK_FOLLOWS.includes(raw?.follow) ? raw.follow : 'smooth',
    release: CLOCK_RELEASES.includes(raw?.release) ? raw.release : 'stay',
    // A gesture heard on one part of the control only (sceneClock.js partRectOf): its name, or
    // nothing for the whole control. A value is the control's, so a value clock has no part.
    ...(source !== 'value' && id(raw?.part) ? { part: id(raw.part) } : {}),
  };
}

/**
 * A value effect's frames read and checked: sorted by `at`, each with `value` (0 to 1), `by` (-1 to 1)
 * or neither (the live value). Null when fewer than two read.
 */
export function cleanValueFrames(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const frame of raw.slice(0, VALUE_FRAMES_MAX)) {
    const at = Number(frame?.at);
    if (!Number.isFinite(at)) continue;
    const entry = { at: Math.max(0, Math.min(1, at)) };
    const value = Number(frame?.value);
    const by = Number(frame?.by);
    if (frame?.value !== undefined && frame?.value !== null && Number.isFinite(value)) entry.value = Math.max(0, Math.min(1, value));
    else if (frame?.by !== undefined && frame?.by !== null && Number.isFinite(by) && by !== 0) entry.by = Math.max(-1, Math.min(1, by));
    out.push(entry);
  }
  out.sort((a, b) => a.at - b.at);
  return out.length >= 2 ? out : null;
}

/** A value effect read and checked, or null: its kind, easing (and a custom curve's points) and frames. */
function cleanValueEffect(raw) {
  const frames = cleanValueFrames(raw?.frames);
  if (!frames) return null;
  const out = { kind: 'value', easing: text(raw.easing, 24) || 'inOutCubic', frames };
  if (raw.bezier !== undefined) out.bezier = deepCopy(raw.bezier);
  if (raw.spring !== undefined) out.spring = deepCopy(raw.spring);
  return out;
}

/** A clip read and checked, or null. Its effect keeps what an animation node may hold. */
export function cleanClip(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clipId = id(raw.id);
  const controlId = id(raw.controlId);
  const target = String(raw.target ?? '');
  if (!clipId || !controlId) return null;
  if (!(target === 'Transform' || target === 'Text' || target === VALUE_TARGET || /^(Parts|Patterns)\.[A-Za-z0-9_-]+$/.test(target))) return null;
  let effect = raw.effect && typeof raw.effect === 'object' ? deepCopy(raw.effect) : null;
  if (!effect || !CLIP_KINDS.includes(String(effect.kind ?? ''))) return null;
  if ((effect.kind === 'value') !== (target === VALUE_TARGET)) return null;
  if (target.startsWith('Patterns.') && effect.kind !== 'keyframes') return null;
  if (effect.kind === 'value') effect = cleanValueEffect(effect);
  if (!effect) return null;
  // What the clip says itself is not the effect's to say. A keyframe effect lasts as long as its
  // clip; a text effect keeps its own `duration`, which is each piece's (its whole length depends on
  // how many letters the words have), and the clip's length is how much of the timeline it takes.
  delete effect.trigger; delete effect.targets; delete effect.delay; delete effect.preset;
  if (effect.kind === 'keyframes') delete effect.duration;
  // The name it came with ("Fade in", "Typewriter in", a preset's), shown on the timeline.
  const label = text(raw.label, 40);
  return { id: clipId, controlId, target, start: ms(raw.start, 0), length: ms(raw.length, 600, 10), effect, ...(label ? { label } : {}) };
}

/** A scene read and checked, or null. Clips that do not read are dropped; the scene stays. */
export function cleanScene(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sceneId = id(raw.id);
  if (!sceneId) return null;
  const clips = (Array.isArray(raw.clips) ? raw.clips : []).slice(0, LIMITS.clips).map(cleanClip).filter(Boolean);
  const span = clips.reduce((end, clip) => Math.max(end, clip.start + clip.length), 0);
  return {
    id: sceneId,
    name: text(raw.name, LIMITS.name) || 'Scene',
    trigger: cleanTrigger(raw.trigger),
    length: Math.max(ms(raw.length, 2000, 100), span),
    loop: raw.loop === true,
    clips,
    ...(cleanClock(raw.clock) ? { clock: cleanClock(raw.clock) } : {}),
  };
}

/** A panel's scenes, read; at most LIMITS.scenes, ids unique. */
export function cleanSceneList(list) {
  const seen = new Set();
  const out = [];
  for (const scene of (Array.isArray(list) ? list : []).slice(0, LIMITS.scenes)) {
    const clean = cleanScene(scene);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/**
 * The ids of every control a panel's scenes animate. Such a control is never folded into the still
 * ground a panel's printed matter is drawn as (sceneryModel.js): a Label a scene types in has to be
 * a Label that can be typed in, on the Designer's stage and in Preview and the plug-in alike.
 */
export function sceneControlIds(scenes) {
  const ids = new Set();
  for (const scene of Array.isArray(scenes) ? scenes : []) {
    for (const clip of Array.isArray(scene?.clips) ? scene.clips : []) if (clip?.controlId) ids.add(String(clip.controlId));
  }
  return ids;
}
