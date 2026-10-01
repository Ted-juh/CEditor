/**
 * keyframePlayer.js — plays a control's keyframe animations, in the editor's preview and in the
 * exported player alike.
 *
 * One player per mounted control (`CanvasControl.svelte` syncs it from an effect and disposes it
 * on unmount). Each sync hands over the control, its active states and its normalised value; the
 * player compares them with the last sync and acts on the difference:
 *
 *   - a `stateChange` trigger that fires (keyframeModel.triggerFires) restarts its timeline;
 *   - while the state that fired it is still active, the last frame holds (`hold`, the default);
 *     when that state leaves, the overlay clears and the control is its static self again;
 *   - a trigger on `*` plays through and clears at the end, unless `loop` keeps it going;
 *   - a `valueChange` trigger does not play at all: the timeline's position FOLLOWS the value, so
 *     a knob at 0.3 shows the pose at 30% of the axis. A sequence scrubbed by a value.
 *
 * Every frame anime.js updates the tweened object, the overlays of all running animations on the
 * control are merged (later-defined wins), and the merge is written to `stores/keyframeOverlays.js`,
 * from which the resolver applies it. Nothing here touches the document.
 *
 * anime.js is loaded the first time any control needs it, through `animeTimeline.js` so only its
 * timeline is bundled. The import is dynamic so the player chunk every exported plug-in carries
 * does not grow for panels with no keyframe animation.
 */
import { setKeyframeOverlay } from '../stores/keyframeOverlays.js';
import { buildKeyframeTimeline, keyframeAnimations, keyframesDuration, triggerFires, triggerHeld } from './keyframeModel.js';

let animeModule = null;
let animePromise = null;

/** The anime.js module, loaded once. Tests can pass their own through `useAnime`. */
export function loadAnime() {
  if (animeModule) return Promise.resolve(animeModule);
  animePromise ??= import('./animeTimeline.js').then((mod) => { animeModule = mod; return mod; });
  return animePromise;
}

/** Hand the player an already-loaded anime (tests, or a host that bundled it). */
export function useAnime(mod) {
  animeModule = mod;
  animePromise = mod ? Promise.resolve(mod) : null;
}

const players = new Map(); // controlId → player
const scrubs = new Map();  // controlId → { name, key, built, overlay }

const sameList = (a = [], b = []) => a.length === b.length && a.every((v, i) => v === b[i]);
const defKey = (animation) => JSON.stringify(animation);

function publish(player) {
  const merged = {};
  let any = false;
  for (const run of player.runs.values()) {
    if (!run.overlay) continue;
    Object.assign(merged, run.overlay);
    any = true;
  }
  const scrub = scrubs.get(player.controlId);
  if (scrub?.overlay) { Object.assign(merged, scrub.overlay); any = true; }
  setKeyframeOverlay(player.controlId, any ? merged : null);
}

function stopRun(player, name) {
  const run = player.runs.get(name);
  if (!run) return;
  run.built?.timeline?.pause();
  player.runs.delete(name);
}

function startRun(player, name, animation) {
  stopRun(player, name);
  const run = { name, key: defKey(animation), built: null, overlay: null, pending: true };
  player.runs.set(name, run);
  loadAnime().then((anime) => {
    if (player.disposed || player.runs.get(name) !== run) return;
    run.built = buildKeyframeTimeline(anime, animation, {
      loop: animation.loop === true,
      onUpdate: () => { run.overlay = run.built.overlay(); publish(player); },
      onComplete: () => {
        // Through, and either held on its last frame or gone.
        if (animation.hold !== false && triggerHeld(animation, player.states)) return;
        run.overlay = null;
        player.runs.delete(name);
        publish(player);
      },
    });
    run.pending = false;
    run.built.timeline.restart();
  });
}

function followValue(player, name, animation, value) {
  let run = player.runs.get(name);
  const key = defKey(animation);
  if (!run || run.key !== key) {
    stopRun(player, name);
    run = { name, key, built: null, overlay: null, pending: true, follow: true };
    player.runs.set(name, run);
    loadAnime().then((anime) => {
      if (player.disposed || player.runs.get(name) !== run) return;
      run.built = buildKeyframeTimeline(anime, animation);
      run.pending = false;
      seekRun(player, run, player.value);
    });
    return;
  }
  if (run.built) seekRun(player, run, value);
}

function seekRun(player, run, value) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  run.built.timeline.seek(v * run.built.duration);
  run.overlay = run.built.overlay();
  publish(player);
}

/**
 * Bring a control's player up to date. Called whenever the control, its active states or its
 * value change; cheap when nothing relevant did.
 */
export function syncKeyframePlayer(controlId, control, { activeStates = [], valueNormalized = null, enabled = true } = {}) {
  const id = String(controlId ?? '');
  if (!id) return;
  const defs = keyframeAnimations(control);
  let player = players.get(id);
  if (!defs.length) {
    if (player) disposeKeyframePlayer(id);
    return;
  }
  if (!player) {
    // First sight of the control: remember where it is, fire nothing. A control that mounts in
    // the hover state is not being hovered INTO.
    player = { controlId: id, states: [...activeStates], value: valueNormalized, runs: new Map(), disposed: false };
    players.set(id, player);
    if (enabled) {
      for (const [name, animation] of defs) {
        if (String(animation?.trigger?.type) === 'valueChange') followValue(player, name, animation, valueNormalized);
      }
    }
    return;
  }

  const prevStates = player.states;
  const prevValue = player.value;
  player.states = [...activeStates];
  player.value = valueNormalized;

  if (!enabled) {
    for (const name of [...player.runs.keys()]) stopRun(player, name);
    publish(player);
    return;
  }

  const live = new Set(defs.map(([name]) => name));
  for (const name of [...player.runs.keys()]) {
    if (!live.has(name)) { stopRun(player, name); publish(player); }
  }

  for (const [name, animation] of defs) {
    const trigger = String(animation?.trigger?.type ?? 'stateChange');
    const run = player.runs.get(name);
    if (trigger === 'valueChange') {
      if (!run || run.key !== defKey(animation) || prevValue !== valueNormalized) followValue(player, name, animation, valueNormalized);
      continue;
    }
    if (run && run.key !== defKey(animation)) {
      // Edited while running: stop, and let the next trigger play the new definition.
      stopRun(player, name);
      publish(player);
    }
    if (!sameList(prevStates, activeStates) && triggerFires(animation, prevStates, activeStates)) {
      startRun(player, name, animation);
      continue;
    }
    const held = player.runs.get(name);
    if (held && !held.follow && triggerHeld(animation, prevStates) && !triggerHeld(animation, activeStates)) {
      // The state that fired it has left: the pose goes with it.
      stopRun(player, name);
      publish(player);
    }
  }
}

/** Forget a control: stop everything and clear its overlay. */
export function disposeKeyframePlayer(controlId) {
  const id = String(controlId ?? '');
  const player = players.get(id);
  if (player) {
    player.disposed = true;
    for (const name of [...player.runs.keys()]) stopRun(player, name);
    players.delete(id);
  }
  scrubs.delete(id);
  setKeyframeOverlay(id, null);
}

// --- The Animation tab's playhead -----------------------------------------------------------------

/**
 * Pose a control at one time of one animation, on the canvas, in any view. The tab calls this as
 * the playhead moves; `clearKeyframeScrub` when it leaves the animation.
 */
export function scrubKeyframes(controlId, name, animation, time) {
  const id = String(controlId ?? '');
  if (!id || !animation) return;
  let scrub = scrubs.get(id);
  const key = `${name}:${defKey(animation)}`;
  if (!scrub || scrub.key !== key) {
    scrub = { name, key, built: null, overlay: null, time };
    scrubs.set(id, scrub);
    loadAnime().then((anime) => {
      if (scrubs.get(id) !== scrub) return;
      scrub.built = buildKeyframeTimeline(anime, animation);
      seekScrub(id, scrub, scrub.time);
    });
    return;
  }
  scrub.time = time;
  if (scrub.built) seekScrub(id, scrub, time);
}

function seekScrub(id, scrub, time) {
  scrub.built.timeline.seek(Math.max(0, Math.min(scrub.built.duration, Number(time) || 0)));
  scrub.overlay = scrub.built.overlay();
  const player = players.get(id);
  if (player) publish(player);
  else setKeyframeOverlay(id, scrub.overlay);
}

export function clearKeyframeScrub(controlId) {
  const id = String(controlId ?? '');
  if (!scrubs.has(id)) return;
  scrubs.delete(id);
  const player = players.get(id);
  if (player) publish(player);
  else setKeyframeOverlay(id, null);
}

/**
 * Play one animation on the canvas from the tab, through its full length, reporting the time so
 * the playhead can follow. Returns a stop function. Looping animations play until stopped.
 */
export function playKeyframesPreview(controlId, name, animation, { ontime = null, ondone = null } = {}) {
  const id = String(controlId ?? '');
  let stopped = false;
  let built = null;
  loadAnime().then((anime) => {
    if (stopped) return;
    built = buildKeyframeTimeline(anime, animation, {
      loop: animation.loop === true,
      onUpdate: (values) => {
        if (stopped) return;
        const scrub = { name, key: 'preview', built, overlay: built.overlay(), time: values._t };
        scrubs.set(id, scrub);
        const player = players.get(id);
        if (player) publish(player); else setKeyframeOverlay(id, scrub.overlay);
        ontime?.(values._t);
      },
      onComplete: () => { if (!stopped) { stopped = true; ondone?.(); } },
    });
    built.timeline.restart();
  });
  return () => {
    if (stopped && !built) return;
    stopped = true;
    built?.timeline?.pause();
  };
}

/** How long one animation runs, for the tab's readout. */
export const keyframesLength = keyframesDuration;

/** Test hook: the live player for a control, or null. */
export function keyframePlayerFor(controlId) {
  return players.get(String(controlId ?? '')) ?? null;
}
