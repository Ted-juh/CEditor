// Kinetic Modulator — a physics "bouncing ball" modulation source. Where the
// Orbit is geometric motion, the Looper human, and the Turing generative, this is
// PHYSICAL motion: a ball with gravity, wall-bounce (restitution) and air-drag
// (friction) moving in a box; you fling it and it bounces, emitting x / y / speed
// (and a bounce pulse) as modulation — the fan-out. The physics STEP is a pure,
// deterministic function (dt + config in, new state out), so it's unit-tested;
// only the integration loop (which lives in the preview surface) is stateful.
// Normalized box: x,y ∈ [0,1] (y up: 1 = top); velocity in units/sec.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

export const KINETIC_MAX_SPEED = 2.5;   // units/sec that maps to speed = 1

export function kineticConfig(control) {
  return control?._children?.Kinetic ?? {};
}

// A normalized config: the physics knobs, clamped to sane ranges.
export function kineticParams(control) {
  const cfg = kineticConfig(control);
  return {
    gravity: clamp(num(cfg.gravity, 0), 0, 4),          // downward pull (units/sec²)
    restitution: clamp(num(cfg.restitution, 0.9), 0, 1), // bounce energy kept 0..1
    friction: clamp(num(cfg.friction, 0.02), 0, 4),      // air drag per second
    keepAlive: clamp(num(cfg.keepAlive, 0.25), 0, 1),    // re-kick strength when it stalls
    maxSpeed: Math.max(0.1, num(cfg.maxSpeed, KINETIC_MAX_SPEED)),
  };
}

// The seed state (a live __state override wins; else the config's initial).
export function kineticInitial(control) {
  const cfg = kineticConfig(control);
  const s = cfg.__state && typeof cfg.__state === 'object' ? cfg.__state : cfg.initial;
  return {
    x: clamp01(num(s?.x, 0.5)),
    y: clamp01(num(s?.y, 0.7)),
    vx: num(s?.vx, 0.6),
    vy: num(s?.vy, 0),
  };
}

// One physics step. Pure: integrate velocity, apply gravity + drag, reflect off
// the four walls with restitution, clamp speed. Returns the new state plus a
// `bounced` flag (true on the frame a wall was hit).
export function stepKinetic(state, dt, params) {
  const p = params || {};
  const g = num(p.gravity, 0);
  const rest = clamp(num(p.restitution, 0.9), 0, 1);
  const fr = num(p.friction, 0);
  const maxSpeed = Math.max(0.1, num(p.maxSpeed, KINETIC_MAX_SPEED));
  const h = clamp(num(dt, 0), 0, 0.05);   // clamp big frame gaps

  let x = clamp01(num(state?.x, 0.5));
  let y = clamp01(num(state?.y, 0.5));
  let vx = num(state?.vx, 0);
  let vy = num(state?.vy, 0);

  // Gravity (pulls toward the floor, y = 0) + air drag.
  vy -= g * h;
  const drag = Math.max(0, 1 - fr * h);
  vx *= drag; vy *= drag;

  // Integrate.
  x += vx * h; y += vy * h;

  // Wall reflections with restitution.
  let bounced = false;
  if (x < 0) { x = -x; vx = Math.abs(vx) * rest; bounced = true; }
  else if (x > 1) { x = 2 - x; vx = -Math.abs(vx) * rest; bounced = true; }
  if (y < 0) { y = -y; vy = Math.abs(vy) * rest; bounced = true; }
  else if (y > 1) { y = 2 - y; vy = -Math.abs(vy) * rest; bounced = true; }

  // Speed clamp keeps the normalized output bounded.
  const sp = Math.hypot(vx, vy);
  if (sp > maxSpeed) { const k = maxSpeed / sp; vx *= k; vy *= k; }

  return { x: clamp01(x), y: clamp01(y), vx, vy, bounced };
}

// Give a stalled ball a fresh random kick (keeps a lively perpetual motion).
// Pure: caller supplies two 0..1 randoms for direction/strength.
export function kineticKick(state, strength, randDir, randMag) {
  const angle = clamp01(num(randDir, 0)) * Math.PI * 2;
  const mag = num(strength, 0.25) * (0.5 + clamp01(num(randMag, 0.5)));
  return { ...state, vx: num(state?.vx, 0) + Math.cos(angle) * mag, vy: num(state?.vy, 0) + Math.sin(angle) * mag };
}

// Normalized speed 0..1 for the `speed` port.
export function kineticSpeed(state, maxSpeed = KINETIC_MAX_SPEED) {
  return clamp01(Math.hypot(num(state?.vx, 0), num(state?.vy, 0)) / Math.max(0.1, num(maxSpeed, KINETIC_MAX_SPEED)));
}

// --- Geometry ----------------------------------------------------------------
export function kineticGeometry(width, height, pad = 8) {
  const p = Math.max(0, num(pad, 8));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2);
  return { x0: p, y0: p, w, h };
}
// Normalized (x,y) → px (y flipped: y=1 is the top).
export function kineticToPx(pt, geom) {
  return { px: geom.x0 + clamp01(num(pt?.x, 0.5)) * geom.w, py: geom.y0 + (1 - clamp01(num(pt?.y, 0.5))) * geom.h };
}
// px → normalized (x,y).
export function kineticFromPx(px, py, geom) {
  return { x: clamp01((num(px, 0) - geom.x0) / Math.max(1, geom.w)), y: clamp01(1 - (num(py, 0) - geom.y0) / Math.max(1, geom.h)) };
}

// --- Static ports (fan-out) --------------------------------------------------
export function kineticPorts(parameterTypes = null) {
  const cont = parameterTypes
    ? [parameterTypes.FLOAT, parameterTypes.NORMALIZED, parameterTypes.BIPOLAR].filter(Boolean)
    : ['float', 'normalized', 'bipolar'];
  const gate = parameterTypes
    ? [parameterTypes.BOOLEAN, parameterTypes.NORMALIZED].filter(Boolean)
    : ['boolean', 'normalized'];
  return [
    { id: 'x', label: 'X position', accepts: cont, defaultBindingMode: 'continuous' },
    { id: 'y', label: 'Y position', accepts: cont, defaultBindingMode: 'continuous' },
    { id: 'speed', label: 'Speed', accepts: cont, defaultBindingMode: 'continuous' },
    { id: 'bounce', label: 'Bounce gate', accepts: gate, defaultBindingMode: 'continuous' },
  ];
}
// Fan-out values from the current (injected) state: { x, y, speed, bounce }.
export function kineticPortValues(control) {
  const st = kineticInitial(control);
  const maxSpeed = kineticParams(control).maxSpeed;
  const cfg = kineticConfig(control);
  return {
    x: clamp01(num(st.x, 0.5)),
    y: clamp01(num(st.y, 0.5)),
    speed: kineticSpeed(st, maxSpeed),
    bounce: cfg.__bounce === true || cfg.__bounce === 1 ? 1 : 0,
  };
}
