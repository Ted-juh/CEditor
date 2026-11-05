// customButtonFiring.js — when a component's button fires, and what it does afterwards.
//
// A button behaviour (type 'button' or 'toggle': a momentary value or a switch) acts on its value
// channel. By default a momentary button is on while it is held and a toggle flips when it is let go
// inside, as they always have; those take the plain path in the surfaces and never reach this file.
// A behaviour may say otherwise (Interact card › Fires, Afterwards):
//
//   fires        'held'     only while held: on at the press, off at the release (a momentary
//                           button's way, and press-to-talk's)
//                'press'    when pressed: it fires once, as the press lands
//                'release'  when released: once, on letting go inside (a toggle's way)
//                'hold'     after a hold of `holdMs`, still held (hold to confirm); `pending`
//                           is set while the hold runs
//                'double'   on `clicks` clicks, each within `clickWindow` ms of the last
//                'repeat'   at the press, then after `repeatDelay` and every `repeatInterval` ms
//                           while held
//   afterwards   ''         ready again
//                'disabled' it fires once; then presses do nothing
//                'locked'   presses do nothing for `lockMs` after it fires
//
// To fire is what the behaviour does: a toggle flips its value; a momentary button turns it on for
// a moment (`FIRE_PULSE_MS`) and off again, so a host or a device sees the press as a value that
// went on and came back. `executed` is set for that moment too, as the panel's timed and one-shot
// buttons set it, so a state can show it.
//
// The timers live here, the values in the surface: `act(context, 'on' | 'off' | 'flip')` and
// `flags(context, { pending, executed, disabled })` are the surface's, and `context` is whatever
// it passed to `press` (its control and grab area). The clock is injectable, as in
// timedButtonPreview.js and momentaryButtonPreview.js, which this mirrors for components.

export const FIRE_PULSE_MS = 150;

export const FIRES = Object.freeze(['held', 'press', 'release', 'hold', 'double', 'repeat']);
export const AFTERWARDS = Object.freeze(['', 'disabled', 'locked']);

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Whether `behavior` is a button's (a momentary value or a toggle), the kind Fires applies to. */
export function isButtonBehavior(behavior) {
  const type = String(behavior?.type ?? '').trim().toLowerCase();
  return type === 'button' || type === 'toggle' || type === 'momentary';
}

/** When a button behaviour fires if it says nothing: a toggle on release, a momentary while held. */
export function defaultFires(behavior) {
  return String(behavior?.type ?? '').trim().toLowerCase() === 'toggle' ? 'release' : 'held';
}

/**
 * A button behaviour's firing, its defaults filled in, or null when it fires as a button always
 * has (its type's default and ready again), which the surfaces handle as before.
 */
export function buttonFiring(behavior) {
  if (!isButtonBehavior(behavior)) return null;
  const toggle = String(behavior?.type ?? '').trim().toLowerCase() === 'toggle';
  const fires = FIRES.includes(String(behavior?.fires ?? '')) ? String(behavior.fires) : defaultFires(behavior);
  const afterwards = AFTERWARDS.includes(String(behavior?.afterwards ?? '')) ? String(behavior.afterwards ?? '') : '';
  if (fires === defaultFires(behavior) && !afterwards) return null;
  return {
    toggle,
    fires,
    holdMs: Math.max(0, Math.round(num(behavior?.holdMs, 1200))),
    clicks: Math.max(1, Math.round(num(behavior?.clicks, 2))),
    clickWindow: Math.max(50, Math.round(num(behavior?.clickWindow, 350))),
    repeatDelay: Math.max(0, Math.round(num(behavior?.repeatDelay, 300))),
    repeatInterval: Math.max(10, Math.round(num(behavior?.repeatInterval, 120))),
    afterwards,
    lockMs: Math.max(0, Math.round(num(behavior?.lockMs, 1000))),
  };
}

export function createButtonFiring({
  act,
  flags = () => {},
  scheduleTimeout = setTimeout,
  clearTimeoutFn = clearTimeout,
  pulseMs = FIRE_PULSE_MS,
} = {}) {
  if (typeof act !== 'function') throw new TypeError('createButtonFiring requires an act callback.');
  const states = new Map();

  function stateOf(key) {
    const k = String(key ?? '');
    if (!k) return null;
    if (!states.has(k)) states.set(k, { timers: new Set(), clicks: 0, clickTimer: null, holdTimer: null, repeatTimer: null, lockTimer: null, locked: false, held: false, context: null });
    return states.get(k);
  }
  function later(state, ms, fn) {
    const handle = scheduleTimeout(() => {
      state.timers.delete(handle);
      fn();
    }, ms);
    state.timers.add(handle);
    return handle;
  }
  function clear(state, handle) {
    if (handle == null) return null;
    clearTimeoutFn(handle);
    state.timers.delete(handle);
    return null;
  }

  /** What follows a fire: ready again, or no presses for a while or for good. */
  function after(state, config) {
    if (!config.afterwards) return;
    state.locked = true;
    flags(state.context, { disabled: true });
    if (config.afterwards === 'locked') {
      state.lockTimer = clear(state, state.lockTimer);
      state.lockTimer = later(state, config.lockMs, () => {
        state.lockTimer = null;
        state.locked = false;
        flags(state.context, { disabled: false, executed: false });
      });
    }
  }

  function fire(state, config, { settle = true } = {}) {
    // A repeat's moment is no longer than half its interval, so each fire is off before the next.
    const moment = config.fires === 'repeat' ? Math.min(pulseMs, Math.floor(config.repeatInterval / 2)) : pulseMs;
    if (config.toggle) {
      act(state.context, 'flip');
      flags(state.context, { executed: true });
      later(state, moment, () => flags(state.context, { executed: false }));
    } else {
      act(state.context, 'on');
      flags(state.context, { executed: true });
      later(state, moment, () => {
        // Still held by 'repeat' between fires, or by 'held': off all the same, as each fire is one.
        act(state.context, 'off');
        flags(state.context, { executed: false });
      });
    }
    if (settle) after(state, config);
  }

  function stopRepeat(state) {
    state.repeatTimer = clear(state, state.repeatTimer);
  }

  /** A press on the behaviour. Returns false while it is disabled or locked: nothing happens. */
  function press(key, config, context) {
    const state = stateOf(key);
    if (!state || !config) return false;
    state.context = context;
    if (state.locked) return false;
    state.held = true;
    switch (config.fires) {
      case 'held':
        act(context, 'on');
        break;
      case 'press':
        fire(state, config);
        break;
      case 'hold':
        state.holdTimer = clear(state, state.holdTimer);
        flags(context, { pending: true, executed: false });
        state.holdTimer = later(state, config.holdMs, () => {
          state.holdTimer = null;
          flags(state.context, { pending: false });
          fire(state, config);
        });
        break;
      case 'repeat': {
        fire(state, config, { settle: false });
        const again = (ms) => {
          state.repeatTimer = later(state, ms, () => {
            state.repeatTimer = null;
            if (!state.held) return;
            fire(state, config, { settle: false });
            again(config.repeatInterval);
          });
        };
        again(config.repeatDelay);
        break;
      }
      default:
        break;
    }
    return true;
  }

  /** The press let go, `inside` the grab area or not. */
  function release(key, config, { inside = true } = {}) {
    const state = stateOf(key);
    if (!state || !config) return false;
    const wasHeld = state.held;
    state.held = false;
    if (!wasHeld) return false;
    switch (config.fires) {
      case 'held':
        act(state.context, 'off');
        after(state, config);
        break;
      case 'release':
        if (inside) fire(state, config);
        break;
      case 'hold':
        if (state.holdTimer != null) {
          state.holdTimer = clear(state, state.holdTimer);
          flags(state.context, { pending: false });
        }
        break;
      case 'double':
        if (!inside) break;
        state.clickTimer = clear(state, state.clickTimer);
        state.clicks += 1;
        if (state.clicks >= config.clicks) {
          state.clicks = 0;
          flags(state.context, { pending: false });
          fire(state, config);
        } else {
          flags(state.context, { pending: true });
          state.clickTimer = later(state, config.clickWindow, () => {
            state.clickTimer = null;
            state.clicks = 0;
            flags(state.context, { pending: false });
          });
        }
        break;
      case 'repeat':
        stopRepeat(state);
        after(state, config);
        break;
      default:
        break;
    }
    return true;
  }

  /** Whether presses on `key` do nothing just now (disabled or locked after firing). */
  function locked(key) {
    return states.get(String(key ?? ''))?.locked === true;
  }

  /** Forget `key`'s press, hold, clicks and repeats; a lock stays unless `unlock`. */
  function cancel(key, { unlock = false } = {}) {
    const state = states.get(String(key ?? ''));
    if (!state) return;
    state.held = false;
    state.clicks = 0;
    for (const handle of [state.holdTimer, state.clickTimer, state.repeatTimer]) clear(state, handle);
    state.holdTimer = null;
    state.clickTimer = null;
    state.repeatTimer = null;
    if (unlock) {
      for (const handle of state.timers) clearTimeoutFn(handle);
      states.delete(String(key));
    }
  }

  /** Drop every key whose control is not among `liveKeys` (a predicate on the key). */
  function syncKeys(isLive) {
    for (const key of [...states.keys()]) if (!isLive(key)) cancel(key, { unlock: true });
  }

  function destroy() {
    for (const key of [...states.keys()]) cancel(key, { unlock: true });
  }

  return { press, release, locked, cancel, syncKeys, destroy };
}
