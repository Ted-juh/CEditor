/**
 * sceneStage.js — how a surface tells the controls on it which scenes to draw, and where. It is a
 * Svelte context, not a global store, so only the controls inside that surface draw them: the panel's
 * design canvas never does (the owner: it moves only under a playhead).
 *
 * Two surfaces provide one:
 *
 *   - the Animation Designer's stage (step 5a): a store of `{ scene, at, playing, phase }` — `at`
 *     (ms) poses every clip at the playhead, paused; `playing` lets them run from the moment it
 *     turned true; `phase` flips to start a played scene again (keyframeAnimation.js);
 *   - a live surface, Preview and the plug-in (step 5b): `createSceneRunStore`, a store of
 *     `{ plays: [{ scene, phase, at }], listeners }` with the runtime's `fire`, `open` and `beat`
 *     beside it (utils/sceneRuntime.js). A control that some scene waits on (`listeners.state`)
 *     reports its states as it enters them.
 *
 * A surface inside another's stage provides none of its own: the Designer's stage is a live surface
 * too, and there nothing plays by itself.
 */
import { writable } from 'svelte/store';
import { createSceneRuntime, sceneListeners } from '../utils/sceneRuntime.js';

export const SCENE_STAGE = 'ce.sceneStage';

export function createSceneRunStore({ timers } = {}) {
  let listeners = sceneListeners([]);
  let runtime = null;
  const store = writable({ plays: [], listeners });
  const publish = () => store.set({ plays: runtime.plays(), listeners });
  runtime = createSceneRuntime({ onChange: publish, ...(timers ? { timers } : {}) });
  let scenesKey = '';
  let beatWanted = false;
  return {
    subscribe: store.subscribe,
    /** The panel's scenes. Unchanged ones are not published again, so the controls do not redraw. */
    setScenes(list) {
      const scenes = Array.isArray(list) ? list : [];
      const key = JSON.stringify(scenes);
      if (key === scenesKey) return;
      scenesKey = key;
      runtime.setScenes(scenes);
      listeners = sceneListeners(scenes);
      beatWanted = scenes.some((scene) => scene?.trigger?.type === 'beat');
      publish();
    },
    setReducedMotion: (flag) => runtime.setReducedMotion(flag),
    open: () => runtime.open(),
    fire: (trigger) => runtime.fire(trigger),
    beat: (beats) => runtime.beat(beats),
    start: (idOrName, options) => runtime.start(idOrName, options),
    seek: (idOrName, position) => runtime.seek(idOrName, position),
    effect: (key, scene, options) => runtime.effect(key, scene, options),
    find: (idOrName) => runtime.find(idOrName),
    /** Whether any scene waits on the beat: only then is the transport listened to. */
    wantsBeat: () => beatWanted,
    destroy: () => runtime.destroy(),
  };
}

/**
 * The live surfaces' runtimes by the panel they draw, for the scripts (scripting/panelRuntime.js:
 * ce.anim.play(scene), seek, effect, swap): a script knows its panel, not the surface showing it.
 * Preview and the plug-in each register theirs; the last one registered for a panel is the one
 * that answers, and it leaves when its surface does.
 */
const runsByPanel = new Map();

export function registerSceneRun(panelId, run) {
  if (panelId == null || !run) return () => {};
  const key = String(panelId);
  runsByPanel.set(key, run);
  return () => { if (runsByPanel.get(key) === run) runsByPanel.delete(key); };
}

export function sceneRunFor(panelId) {
  return panelId == null ? null : runsByPanel.get(String(panelId)) ?? null;
}
