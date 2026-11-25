/**
 * sceneRuntime.js — panel scenes playing on their triggers, where the panel is live: the editor's
 * Preview and the exported plug-in (the Animation Designer, step 5b; docs/design/animation-designer.md).
 *
 * The Designer poses a scene under its playhead (step 5a). Here a scene plays by itself, when what
 * it waits for happens:
 *
 *   - `panelOpen`: the panel opens — the player loads it, Preview starts (`open`);
 *   - `state`:     a control enters a state: Hover, Pressed, a state of its own; `default` is its
 *                  return to Base, when no state holds (`fire({ type: 'state', controlId, to })`);
 *   - `event`:     a gesture on a control: click, double-click, long press, flick, a wheel turn
 *                  (`fire({ type: 'event', controlId, event })`);
 *   - `beat`:      every `every` beats while the transport runs (`beat(beats)`);
 *   - `script`:    ce.anim.play(scene), in step 5c (`start(sceneId)`).
 *
 * WHAT PLAYING IS. Each clip is the CSS animation its control already plays (sceneModel.js,
 * sceneControlOutput), so the runtime only says which scenes run and in which phase: starting a
 * scene flips its phase between 'a' and 'b', which restarts every one of its animations — a trigger
 * that comes again while it plays starts it again, from the top. A looping scene starts again each
 * time its length has passed. A scene that ends is held at its last frame (`at` = its length: every
 * clip posed there and paused, so nothing keeps running), until a trigger starts it again. With
 * reduced motion on, a started scene goes straight to that last frame. These are the defaults put to
 * the owner with step 5b's questions on 2026-11-24, to be changed here if the answers differ.
 *
 * `plays()` is `[{ scene, phase, at }]`, `at` null while it runs. The timers are injected, so it is
 * tested without a clock.
 */

const DEFAULT_TIMERS = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
};

/** Whether a trigger is the one a scene waits for. */
export function sceneWaitsFor(scene, trigger) {
  const wants = scene?.trigger;
  if (!wants || !trigger || wants.type !== trigger.type) return false;
  if (wants.type === 'state') {
    return wants.controlId === trigger.controlId && String(wants.to ?? '').toLowerCase() === String(trigger.to ?? '').toLowerCase();
  }
  if (wants.type === 'event') return wants.controlId === trigger.controlId && wants.event === trigger.event;
  return wants.type === 'panelOpen';
}

/** The controls whose states or gestures some scene waits for, by kind: `{ state: Set, event: Set }`. */
export function sceneListeners(scenes) {
  const out = { state: new Set(), event: new Set() };
  for (const scene of scenes ?? []) {
    const { type, controlId } = scene?.trigger ?? {};
    if ((type === 'state' || type === 'event') && controlId) out[type].add(controlId);
  }
  return out;
}

export function createSceneRuntime({ onChange = () => {}, timers = DEFAULT_TIMERS } = {}) {
  let scenes = [];
  let reducedMotion = false;
  const extras = new Map();     // key -> scene: one-off effects (ce.anim.effect, swap), one per place
  const plays = new Map();      // sceneId -> { phase, at }
  const timers_ = new Map();    // sceneId -> handle
  const beatSlots = new Map();  // sceneId -> floor(beats / every), or null while stopped
  const dones = new Map();      // sceneId -> done(completed), from a script

  const all = () => [...scenes, ...extras.values()];
  const sceneById = (id) => all().find((scene) => scene.id === id) ?? null;
  const sceneNamed = (idOrName) => {
    const wanted = String(idOrName ?? '');
    return sceneById(wanted) ?? scenes.find((scene) => String(scene.name).toLowerCase() === wanted.toLowerCase()) ?? null;
  };
  const stopTimer = (id) => {
    if (timers_.has(id)) { timers.clear(timers_.get(id)); timers_.delete(id); }
  };
  /** A script's done(completed), once: true at the end, false when cut short (restarted, sought, gone). */
  const finish = (id, completed) => {
    const done = dones.get(id);
    if (!done) return;
    dones.delete(id);
    done(completed === true);
  };

  function begin(scene) {
    const before = plays.get(scene.id);
    const phase = before?.phase === 'a' ? 'b' : 'a';
    stopTimer(scene.id);
    if (reducedMotion) {
      plays.set(scene.id, { phase, at: scene.length });
      // At its end at once; a script waiting on it hears so after this call has returned.
      if (dones.has(scene.id)) timers_.set(scene.id, timers.set(() => { timers_.delete(scene.id); finish(scene.id, true); }, 0));
      return;
    }
    plays.set(scene.id, { phase, at: null });
    timers_.set(scene.id, timers.set(() => {
      timers_.delete(scene.id);
      const current = sceneById(scene.id);
      if (!current) return;
      if (current.loop) begin(current);
      else {
        plays.set(current.id, { ...(plays.get(current.id) ?? { phase }), at: current.length });
        finish(current.id, true);
      }
      onChange();
    }, scene.length));
  }

  /** Start (or start again) a scene; a script's `done` hears how this run ends. */
  function run(scene, done = null) {
    finish(scene.id, false);
    if (typeof done === 'function') dones.set(scene.id, done);
    begin(scene);
  }

  function drop(id) {
    plays.delete(id); stopTimer(id); beatSlots.delete(id); finish(id, false);
  }

  return {
    /** The panel's scenes, as they are now. A scene that is gone stops; one that changed keeps playing. */
    setScenes(list) {
      scenes = Array.isArray(list) ? list.filter((scene) => scene?.id) : [];
      const ids = new Set(all().map((scene) => scene.id));
      let changed = false;
      for (const id of [...plays.keys()]) {
        if (!ids.has(id)) { drop(id); changed = true; }
      }
      if (changed) onChange();
    },
    setReducedMotion(flag) { reducedMotion = !!flag; },
    /** The panel opened: every scene that waits for it starts. */
    open() { return this.fire({ type: 'panelOpen' }); },
    /** Start every scene waiting for this trigger. Returns their ids. */
    fire(trigger) {
      const started = [];
      for (const scene of scenes) {
        if (!sceneWaitsFor(scene, trigger)) continue;
        run(scene);
        started.push(scene.id);
      }
      if (started.length) onChange();
      return started;
    },
    /** The panel's scene of this id or name (any case), or null. */
    find: (idOrName) => sceneNamed(idOrName),
    /** Start one scene by its id or name, whatever its trigger: ce.anim.play(scene). */
    start(idOrName, { done = null } = {}) {
      const scene = sceneNamed(idOrName);
      if (!scene) return false;
      run(scene, done);
      onChange();
      return true;
    },
    /**
     * Hold a scene at a point of its length, 0 to 1, paused: ce.anim.seek, a script that is its own
     * clock. A run it interrupts reports done(false); it stays there until started or sought again.
     */
    seek(idOrName, position) {
      const scene = sceneNamed(idOrName);
      const where = Number(position);
      if (!scene || !Number.isFinite(where)) return false;
      stopTimer(scene.id);
      finish(scene.id, false);
      const before = plays.get(scene.id);
      plays.set(scene.id, { phase: before?.phase ?? 'a', at: Math.max(0, Math.min(1, where)) * scene.length });
      onChange();
      return true;
    },
    /**
     * Play a one-off scene, not the panel's: an effect on one place (ce.anim.effect) or one half of a
     * text swap. `key` is the place — a control's text, its box, a part — and a new one there replaces
     * the last, which reports done(false) if it was still going; it holds its last frame until then.
     */
    effect(key, scene, { done = null } = {}) {
      if (!key || !scene?.id) return false;
      const before = extras.get(key);
      if (before && before.id !== scene.id) drop(before.id);
      // Last in, drawn last: on a control's words only the newest text effect shows.
      extras.delete(key);
      extras.set(key, scene);
      run(scene, done);
      onChange();
      return true;
    },
    /** The transport's position in beats while it runs, null while it does not. */
    beat(beats) {
      const started = [];
      for (const scene of scenes) {
        if (scene.trigger?.type !== 'beat') continue;
        const every = Math.max(1, Number(scene.trigger.every) || 1);
        const slot = Number.isFinite(beats) ? Math.floor(beats / every) : null;
        const before = beatSlots.get(scene.id);
        beatSlots.set(scene.id, slot);
        // On a change of slot, never on the first look: a transport already running when the panel
        // opens does not set off every beat scene at once.
        if (slot !== null && before !== undefined && before !== null && slot !== before) {
          run(scene);
          started.push(scene.id);
        }
      }
      if (started.length) onChange();
      return started;
    },
    plays() {
      const out = [];
      for (const scene of all()) {
        const play = plays.get(scene.id);
        if (play) out.push({ scene, phase: play.phase, at: play.at });
      }
      return out;
    },
    destroy() {
      for (const id of [...timers_.keys()]) stopTimer(id);
      plays.clear();
      beatSlots.clear();
      dones.clear();
      extras.clear();
    },
  };
}
