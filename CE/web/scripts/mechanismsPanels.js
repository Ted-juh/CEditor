// mechanismsPanels.js — Mechanisms: five panels of things that turn, mesh and chain, each showing a
// way a scene can be moved that is not the clock alone. Written to CE/panels/Mechanisms/ by
// export-showcases.mjs, and played for the demo recordings straight from here.
//
//   Gear Train    five gears meshed at their teeth ratios; one knob's value turns them all (a scene
//                 driven by a value)
//   Tape Machine  the reels turn and the meters swing with the transport, a beat at a time
//   Music Box     a pinned drum turning, the comb's teeth plucked in a tune, the key unwinding
//   Domino Run    three scenes chained: each ends on a marker whose action starts the next
//   Clockwork     a clock that tells the real time: each hand a scene a script holds in place
//
// Every drawing here is made for these panels.

import {
  W, H, svg, frames, text, panelMaker, MECHANISM_KIND, pattern, gradient, radial, picture, glow, seeded, RING,
} from './festivalKit.js';

const mechanism = (id, name, options = {}) => panelMaker(id, name, { ...options, kind: MECHANISM_KIND });

// --- Gear Train ---------------------------------------------------------------------------------

const MODULE = 3.4;
const radiusOf = (teeth) => teeth * MODULE;
const wrap = (angle, step) => ((((angle + step / 2) % step) + step) % step) - step / 2;

/** A gear's drawing: `teeth` teeth on its pitch circle, turned `phase` degrees, in brass or steel. */
function gearSvg(teeth, phase, { metal = 'brass' } = {}) {
  const r = radiusOf(teeth);
  const outer = r + 6;
  const root = r - 6;
  const size = Math.ceil((outer + 3) * 2);
  const c = size / 2;
  const step = (2 * Math.PI) / teeth;
  const at = (angle, radius) => `${(c + radius * Math.cos(angle)).toFixed(1)},${(c + radius * Math.sin(angle)).toFixed(1)}`;
  const points = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    points.push(at(a - step * 0.27, root), at(a - step * 0.16, outer), at(a + step * 0.16, outer), at(a + step * 0.27, root));
  }
  const [light, dark] = metal === 'brass' ? ['#f1d27a', '#9a7426'] : ['#e3e8ee', '#6c757f'];
  const holes = teeth >= 14 ? Array.from({ length: 5 }, (_, k) => {
    const a = (k / 5) * 2 * Math.PI;
    return `<circle cx="${(c + r * 0.55 * Math.cos(a)).toFixed(1)}" cy="${(c + r * 0.55 * Math.sin(a)).toFixed(1)}" r="${(r * 0.18).toFixed(1)}" fill="#1b1d21"/>`;
  }).join('') : '';
  return svg(`<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`
    + `<g transform="rotate(${phase.toFixed(2)} ${c} ${c})"><polygon points="${points.join(' ')}" fill="url(#m)" stroke="${dark}" stroke-width="1.5"/>${holes}`
    + `<circle cx="${c}" cy="${c}" r="${(r * 0.2).toFixed(1)}" fill="${dark}"/><circle cx="${c}" cy="${c}" r="${(r * 0.08).toFixed(1)}" fill="#1b1d21"/></g>`, size, size);
}

function gearTrain() {
  const f = mechanism('geartrain', 'Gear Train', { bg: 'FF16181C' });
  gradient(f.label('Plate', '', 0, 0, W, H), 160, [[0, '#2a2e35'], [100, '#121418']]);
  pattern(f.label('Screws', '', 0, 0, W, H), { src: 'builtin:dots', tint: 'FF3A3F47', opacity: 60, repeat: 'both', scale: 2.4, speed: 0 });
  // Each gear meshes with the one before it, at the angle given, touching at their pitch circles; its
  // starting turn puts one of its gaps where the other's tooth is.
  const plan = [[24, null, 'steel'], [12, -20, 'brass'], [18, 30, 'brass'], [10, -40, 'steel'], [14, 20, 'brass']];
  const gears = [];
  plan.forEach(([teeth, angle, metal], i) => {
    if (i === 0) { gears.push({ teeth, x: 200, y: 212, phase: 0, metal }); return; }
    const parent = gears[i - 1];
    const a = (angle * Math.PI) / 180;
    const distance = radiusOf(parent.teeth) + radiusOf(teeth);
    const x = parent.x + distance * Math.cos(a);
    const y = parent.y + distance * Math.sin(a);
    const stepP = (2 * Math.PI) / parent.teeth;
    const stepG = (2 * Math.PI) / teeth;
    const d = wrap(a - (parent.phase * Math.PI) / 180, stepP);
    const e = (-d * radiusOf(parent.teeth)) / radiusOf(teeth) + stepG / 2;
    gears.push({ teeth, x, y, phase: ((a + Math.PI - e) * 180) / Math.PI, metal });
  });
  gears.forEach(({ teeth, x, y, phase, metal }, i) => {
    const size = Math.ceil((radiusOf(teeth) + 9) * 2);
    picture(f.label(`Gear${i + 1}`, '', Math.round(x - size / 2), Math.round(y - size / 2), size, size), gearSvg(teeth, phase, { metal }), 'contain');
  });
  gears.forEach(({ teeth, x, y }, i) => f.label(`Teeth${i + 1}`, String(teeth), Math.round(x - 14), Math.round(y - 9), 28, 18, { size: 11, colour: 'FFE8ECF0', family: 'JetBrains Mono', fill: 'CC1B1D21', radius: 9 }));
  // Dragged up and down, a knob's height for its whole range, so a hand turns the train at once.
  f.add('Knob', 'Drive', 46, 300, 84, 84, { Behavior: { defaultValue: 0 }, Mouse: { dragMode: 'vertical' } });
  f.label('DriveName', 'DRIVE', 136, 330, 80, 20, { size: 13, colour: 'FFB8C2CC', family: 'JetBrains Mono', weight: 500, align: 'left' });
  f.label('Title', 'GEAR TRAIN', 0, 22, W, 44, { size: 30, colour: 'FFF1D27A', spacing: 10 });
  f.label('Hint', 'turn the knob: one value drives every gear', 300, 350, 400, 24, { size: 13, colour: 'FF8A96A3', family: 'JetBrains Mono', weight: 400, align: 'right' });
  // Scene one, by the clock: the title typed in.
  f.clip('Title', 'Text', 200, text('typewriter', 'in', { stagger: 60, duration: 160 }), 900);
  // Scene two, on the knob's value: the driver turns twice over the knob's range, and each gear after
  // it the other way, as many times more as it has fewer teeth.
  const turns = 720;
  let angle = turns;
  gears.forEach(({ teeth }, i) => {
    if (i > 0) angle = -angle * (gears[i - 1].teeth / teeth);
    f.clip(`Gear${i + 1}`, 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: Math.round(angle * 100) / 100 }]), 1000, 1);
  });
  return f.scenes([
    { name: 'Title', length: 1400, loop: false },
    { name: 'Train', length: 1000, trigger: { type: 'script' }, loop: false, clock: { source: 'value', control: 'Drive', follow: 'smooth' } },
  ]);
}

// --- Tape Machine -------------------------------------------------------------------------------

const REEL = svg('<circle cx="100" cy="100" r="92" fill="none" stroke="#2a2d31" stroke-width="10"/>'
  + [0, 120, 240].map((a) => `<rect x="94" y="14" width="12" height="76" rx="4" fill="#2a2d31" transform="rotate(${a} 100 100)"/>`).join('')
  + '<circle cx="100" cy="100" r="26" fill="#c0c4c8"/><circle cx="100" cy="100" r="9" fill="#2a2d31"/>'
  + [0, 120, 240].map((a) => `<rect x="97" y="74" width="6" height="12" fill="#2a2d31" transform="rotate(${a} 100 100)"/>`).join(''), 200, 200);
function tapeMachine() {
  const f = mechanism('tapemachine', 'Tape Machine', { bg: 'FF121417' });
  gradient(f.label('Body', '', 30, 20, 660, 330, { radius: 18 }), 180, [[0, '#a3a9b0'], [100, '#5d6269']]);
  pattern(f.label('Brushed', '', 30, 20, 660, 330, { radius: 18 }), { src: 'builtin:scanlines', tint: 'FFFFFFFF', opacity: 8, repeat: 'both', speed: 0 });
  for (const [cname, x, size] of [['PackL', 210, 150], ['PackR', 510, 100]]) radial(f.label(cname, '', x - size / 2, 140 - size / 2, size, size, { radius: size / 2 }), [[0, '#2a1c12'], [70, '#4a3322'], [100, '#2a1c12']]);
  for (const [cname, x] of [['ReelL', 210], ['ReelR', 510]]) picture(f.label(cname, '', x - 100, 40, 200, 200), REEL, 'contain');
  f.label('Tape', '', 190, 296, 340, 3, { fill: 'FF3A2A1E' });
  f.label('TapeL', '', 160, 252, 70, 3, { fill: 'FF3A2A1E', rotation: 52 });
  f.label('TapeR', '', 492, 254, 70, 3, { fill: 'FF3A2A1E', rotation: -52 });
  for (const [cname, x] of [['GuideL', 182], ['GuideR', 524]]) f.label(cname, '', x - 9, 289, 18, 18, { fill: 'FFD8DCE0', radius: 9 });
  gradient(f.label('Head', '', 330, 284, 60, 30, { radius: 4 }), 180, [[0, '#e3e7eb'], [100, '#7d848c']]);
  for (const [cname, x] of [['VuL', 60], ['VuR', 500]]) {
    const vu = f.add('Meter', cname, x, 316, 160, 20);
    vu._children.Core.controlSetId = 'graphite';
    Object.assign(vu._children.Meter, { segments: 14, segmentGap: 2, gradient: true, fillColour: 'FF39D98A', trackColour: 'FF1E2228', rounded: 2 });
  }
  f.label('Rec', '', 636, 40, 18, 18, { fill: 'FF5A1A1A', radius: 9 });
  f.label('RecName', 'REC', 590, 40, 40, 18, { size: 11, colour: 'FF2A2D31', family: 'JetBrains Mono', weight: 700, align: 'right' });
  f.label('Title', 'TAPE MACHINE', 0, 354, W, 26, { size: 18, colour: 'FFD8DCE0', spacing: 10 });
  f.label('Hint', 'press Play: the reels turn with the transport', 0, 380, W, 20, { size: 12, colour: 'FF6B7682', family: 'JetBrains Mono', weight: 400 });
  // Scene one, by the clock: the hint breathing.
  f.clip('Hint', 'Transform', 0, frames([{ at: 0, opacity: 0.35 }, { at: 0.5, opacity: 1 }, { at: 1, opacity: 0.35 }], { easing: 'inOutQuad' }), 2400);
  // Scene two, on every beat: a third of a turn of each reel (a reel has three spokes, so it joins up),
  // the meters swinging, the record lamp on the beat. At 120 BPM a beat is half a second.
  const beat = 500;
  for (const cname of ['ReelL', 'ReelR']) f.clip(cname, 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: -120 }]), beat, 1);
  f.clip('VuL', 'Value', 0, { kind: 'value', easing: 'outQuad', frames: [{ at: 0, value: 0.42 }, { at: 0.12, value: 0.86 }, { at: 0.6, value: 0.58 }, { at: 1, value: 0.46 }] }, beat, 1);
  f.clip('VuR', 'Value', 0, { kind: 'value', easing: 'outQuad', frames: [{ at: 0, value: 0.38 }, { at: 0.16, value: 0.78 }, { at: 0.6, value: 0.62 }, { at: 1, value: 0.4 }] }, beat, 1);
  f.clip('Rec', 'Transform', 0, frames([{ at: 0, fill: 'FF5A1A1A' }, { at: 0.04, fill: 'FFFF3B30', scale: 1.15 }, { at: 0.5, fill: 'FF5A1A1A', scale: 1 }, { at: 1, fill: 'FF5A1A1A' }]), beat, 1);
  return f.scenes([
    { name: 'Idle', length: 2400 },
    { name: 'Beat', length: beat, trigger: { type: 'beat', every: 1 }, loop: false },
  ]);
}

// --- Music Box ----------------------------------------------------------------------------------

const PINS = (() => {
  const next = seeded(7);
  return svg(Array.from({ length: 18 }, () => `<circle cx="${(3 + next() * 34).toFixed(1)}" cy="${(3 + next() * 34).toFixed(1)}" r="1.8" fill="#fff"/>`).join(''), 40, 40);
})();
const KEY = svg('<rect x="26" y="20" width="8" height="30" fill="#c9a24a"/><path d="M30 22 C 10 22 4 10 10 4 C 16 -2 26 8 30 14 C 34 8 44 -2 50 4 C 56 10 50 22 30 22 Z" fill="#e0bb5a" stroke="#8a6a24" stroke-width="2"/>', 60, 52);
const STAR = svg('<path d="M30 2 L 37 22 L 58 22 L 41 35 L 47 56 L 30 43 L 13 56 L 19 35 L 2 22 L 23 22 Z" fill="#ffe28a" stroke="#c9a24a" stroke-width="2"/>', 60, 60);
function musicBox() {
  const f = mechanism('musicbox', 'Music Box', { bg: 'FF1A100C' });
  radial(f.label('Glow', '', 60, -40, 600, 420), [[0, '#553A2414'], [100, '#001A100C']]);
  gradient(f.label('Box', '', 70, 120, 580, 240, { radius: 14 }), 180, [[0, '#8a5a32'], [100, '#4a2e18']]);
  f.label('Well', '', 100, 146, 520, 186, { fill: 'FF2A1A10', radius: 8 });
  const drum = gradient(f.label('Drum', '', 120, 166, 250, 146, { radius: 10 }), 0, [[0, '#7a5a1e'], [50, '#f0d080'], [100, '#7a5a1e']]);
  pattern(drum, { src: PINS, tint: 'FF4A3410', opacity: 90, repeat: 'both', speed: 40, direction: 270 });
  const tines = 10;
  const base = (i) => (i % 2 ? 'FF9AA3AE' : 'FFB5BDC6');
  for (let i = 0; i < tines; i += 1) f.label(`Tine${i + 1}`, '', 380, 172 + i * 13, 200 - i * 9, 7, { fill: base(i), radius: 3 });
  gradient(f.label('Comb', '', 560, 160, 34, 156, { radius: 4 }), 90, [[0, '#d8dde2'], [100, '#7d848c']]);
  picture(f.label('Key', '', 650, 210, 60, 52), KEY, 'contain');
  picture(f.label('Star', '', 330, 52, 60, 60), STAR, 'contain');
  for (let i = 0; i < 4; i += 1) f.label(`Note${i + 1}`, '♪', 420 + i * 36, 150, 30, 30, { size: 22, colour: 'FFFFE28A' });
  f.label('Title', 'MUSIC BOX', 0, 368, W, 30, { size: 20, colour: 'FFE8D2A8', spacing: 12 });
  // A tune of sixteen steps on ten teeth, round and round: each pluck sets a tooth shaking and lights it.
  const tune = [0, 4, 7, 9, 7, 4, 2, 5, 0, 4, 7, 9, 8, 6, 4, 2];
  const stepMs = 300;
  const length = tune.length * stepMs;
  tune.forEach((tooth, k) => {
    const at = k * stepMs;
    f.clip(`Tine${tooth + 1}`, 'Transform', at, frames([{ at: 0, x: 0, fill: base(tooth) }, { at: 0.08, x: -6, fill: 'FFFFF4D0' }, { at: 0.3, x: 3 }, { at: 0.5, x: -1.5 }, { at: 0.75, x: 0.6, fill: base(tooth) }, { at: 1, x: 0, fill: base(tooth) }], { easing: 'outQuad' }), 500);
    if (k % 4 === 0) f.clip(`Note${k / 4 + 1}`, 'Transform', at, frames([{ at: 0, y: 20, opacity: 0 }, { at: 0.15, opacity: 1 }, { at: 1, y: -90, opacity: 0, rotate: k % 8 ? 18 : -18 }], { easing: 'outQuad' }), 1400);
  });
  f.clip('Key', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: -360 }]), length);
  f.clip('Star', 'Transform', 0, frames([{ at: 0, rotate: 0, y: 0 }, { at: 0.25, y: -6 }, { at: 0.5, y: 0 }, { at: 0.75, y: -6 }, { at: 1, rotate: 360, y: 0 }]), length);
  return f.done('Tune', length);
}

// --- Domino Run ---------------------------------------------------------------------------------

const BELL = svg('<rect x="28" y="0" width="14" height="10" rx="3" fill="#8a6a24"/><path d="M35 8 C 18 8 16 26 14 40 C 12 50 6 54 4 58 H 66 C 64 54 58 50 56 40 C 54 26 52 8 35 8 Z" fill="#e0bb5a" stroke="#8a6a24" stroke-width="2"/><circle cx="35" cy="62" r="6" fill="#8a6a24"/>', 70, 70);
const CUP = svg('<path d="M2 2 L 8 38 H 52 L 58 2" fill="none" stroke="#c9ced4" stroke-width="4" stroke-linejoin="round"/>', 60, 40);
const BALL = svg('<circle cx="12" cy="12" r="11" fill="#e53935"/><path d="M2 12 H 22" stroke="#fff" stroke-width="3"/><circle cx="8" cy="7" r="3" fill="#fff" fill-opacity=".5"/>', 24, 24);
/** Where a domino `w` by `h` is, turned `deg` about the foot of its right side, as the move of its centre. */
function toppled(deg, w, h) {
  const t = (deg * Math.PI) / 180;
  const vx = -w / 2;
  const vy = -h / 2;
  return { rotate: deg, x: Math.round((vx * Math.cos(t) - vy * Math.sin(t) - vx) * 10) / 10, y: Math.round((vx * Math.sin(t) + vy * Math.cos(t) - vy) * 10) / 10 };
}
const DOMINO_SCRIPT = `// The domino run: each scene ends on a marker, and the marker's action starts the next scene.
defineAction('roll', function () { animatePlay('Ball'); });
defineAction('ring', function () { animatePlay('Bell'); });
defineAction('again', function () { animatePlay('Dominoes'); });
// And start a run when the script starts: a panel opened from a file runs no script until it is
// trusted, and by then the opening run has passed its marker with nothing to answer it.
animatePlay('Dominoes');
`;
function dominoRun() {
  const f = mechanism('dominorun', 'Domino Run', { bg: 'FF1D2229' });
  gradient(f.label('Wall', '', 0, 0, W, H), 180, [[0, '#2b323b'], [100, '#161a1f']]);
  gradient(f.label('Shelf', '', 30, 190, 486, 12, { radius: 3 }), 180, [[0, '#a87a4a'], [100, '#6a4a2a']]);
  gradient(f.label('Ramp', '', 486, 249, 190, 8, { radius: 3, rotation: 33 }), 180, [[0, '#a87a4a'], [100, '#6a4a2a']]);
  picture(f.label('Cup', '', 622, 312, 60, 40), CUP, 'contain');
  f.label('Bracket', '', 590, 30, 90, 6, { fill: 'FF8A929C' });
  picture(f.label('Bell', '', 600, 36, 70, 70), BELL, 'contain');
  for (let i = 0; i < 3; i += 1) picture(f.label(`Ring${i + 1}`, '', 585, 21, 100, 100), RING, 'contain');
  f.label('Ding', 'DING', 520, 112, 120, 40, { size: 26, colour: 'FFFFE28A' });
  const count = 12;
  const [w, h] = [12, 58];
  const tones = ['FFF4EEE2', 'FFE9E1D0'];
  for (let i = 0; i < count; i += 1) f.label(`Domino${i + 1}`, '', 48 + i * 36, 190 - h, w, h, { fill: tones[i % 2], radius: 2 });
  picture(f.label('Ball', '', 494, 166, 24, 24), BALL, 'contain');
  f.label('Title', 'DOMINO RUN', 30, 30, 400, 40, { size: 28, colour: 'FFF4EEE2', spacing: 8, align: 'left' });
  f.label('Caption', 'three scenes; each one’s last marker starts the next', 30, 72, 460, 20, { size: 13, colour: 'FF8A96A3', family: 'JetBrains Mono', weight: 400, align: 'left' });
  // Scene one: the dominoes stand back up, then each knocks over the next, and the last the ball.
  const length = 2400;
  const fallen = toppled(68, w, h);
  const half = toppled(34, w, h);
  const upright = { rotate: 0, x: 0, y: 0 };
  for (let i = 0; i < count; i += 1) {
    const at = 700 + i * 110;
    f.clip(`Domino${i + 1}`, 'Transform', 0, frames([
      { at: 0, ...fallen }, { at: (60 + i * 20) / length, ...fallen }, { at: (360 + i * 20) / length, ...upright },
      { at: at / length, ...upright }, { at: (at + 120) / length, ...half }, { at: (at + 240) / length, ...fallen }, { at: 1, ...fallen },
    ]), length);
  }
  const knock = 700 + (count - 1) * 110 + 240;
  // Scene two: the ball rolls off the shelf, down the ramp and into the cup, then comes back to its
  // place for the next run.
  f.clip('Ball', 'Transform', 0, frames([
    { at: 0, x: 0, y: 0, rotate: 0, opacity: 1 }, { at: 0.12, x: 24, y: 22, rotate: 120 }, { at: 0.55, x: 140, y: 102, rotate: 520 },
    { at: 0.64, x: 146, y: 140, rotate: 560 }, { at: 0.68, opacity: 0 }, { at: 0.9, x: 0, y: 0, rotate: 0, opacity: 0 }, { at: 1, x: 0, y: 0, rotate: 0, opacity: 1 },
  ]), 1700, 1);
  // Scene three: the bell swings and rings.
  f.clip('Bell', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 0.1, rotate: 24 }, { at: 0.25, rotate: -18 }, { at: 0.4, rotate: 12 }, { at: 0.55, rotate: -7 }, { at: 0.7, rotate: 3 }, { at: 1, rotate: 0 }], { easing: 'inOutQuad' }), 1600, 2);
  for (let i = 0; i < 3; i += 1) f.clip(`Ring${i + 1}`, 'Transform', i * 160, frames([{ at: 0, scale: 0.3, opacity: 0.9 }, { at: 1, scale: 1.6, opacity: 0 }], { easing: 'outQuad' }), 800, 2);
  f.clip('Ding', 'Transform', 0, frames([{ at: 0, scale: 0.3, opacity: 0 }, { at: 0.15, scale: 1.3, opacity: 1 }, { at: 0.3, scale: 1 }, { at: 0.8, opacity: 1 }, { at: 1, opacity: 0 }], { easing: 'outQuad' }), 1400, 2);
  for (const ring of [1, 2, 3]) f.clip(`Ring${ring}`, 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 0 }]), 1, 0);
  f.clip('Ding', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 0 }]), 1, 0);
  f.script('Domino run', DOMINO_SCRIPT);
  return f.scenes([
    { name: 'Dominoes', length, loop: false, markers: [{ at: knock, action: 'roll' }] },
    { name: 'Ball', length: 1700, trigger: { type: 'script' }, loop: false, markers: [{ at: 1100, action: 'ring' }] },
    { name: 'Bell', length: 1600, trigger: { type: 'script' }, loop: false, markers: [{ at: 1550, action: 'again' }] },
  ]);
}

// --- Clockwork ----------------------------------------------------------------------------------

const FACE = svg('<circle cx="150" cy="150" r="144" fill="#f4eee2" stroke="#3a2e22" stroke-width="8"/>'
  + Array.from({ length: 60 }, (_, i) => `<rect x="${i % 5 ? 149 : 147}" y="14" width="${i % 5 ? 2 : 6}" height="${i % 5 ? 8 : 18}" fill="#3a2e22" transform="rotate(${i * 6} 150 150)"/>`).join('')
  + Array.from({ length: 12 }, (_, i) => {
    const a = ((i + 1) / 12) * 2 * Math.PI - Math.PI / 2;
    return `<text x="${(150 + 104 * Math.cos(a)).toFixed(1)}" y="${(150 + 104 * Math.sin(a) + 8).toFixed(1)}" font-family="Georgia, serif" font-size="24" text-anchor="middle" fill="#3a2e22">${i + 1}</text>`;
  }).join(''), 300, 300);
const hand = (length, width, colour, tail = 18) => svg(`<rect x="${150 - width / 2}" y="${150 - length}" width="${width}" height="${length + tail}" rx="${width / 2}" fill="${colour}"/><circle cx="150" cy="150" r="${width}" fill="${colour}"/>`, 300, 300);
const PENDULUM = svg('<rect x="58" y="0" width="4" height="150" fill="#8a6a24"/><circle cx="60" cy="160" r="22" fill="#e0bb5a" stroke="#8a6a24" stroke-width="3"/>', 120, 190);
const CLOCK_SCRIPT = `// The clock tells the real time: each hand is a scene of one turn, held where the time puts it,
// once a second.
function setHands() {
  var now = new Date();
  var s = now.getSeconds();
  var m = now.getMinutes() + s / 60;
  var h = (now.getHours() % 12) + m / 60;
  animateSeek('Seconds', s / 60);
  animateSeek('Minutes', m / 60);
  animateSeek('Hours', h / 12);
  after(1000, setHands);
}
setHands();
`;
function clockwork() {
  const f = mechanism('clockwork', 'Clockwork', { bg: 'FF1A1512' });
  gradient(f.label('Wall', '', 0, 0, W, H), 180, [[0, '#2e241c'], [100, '#140f0c']]);
  gradient(f.label('Case', '', 250, 20, 220, 370, { radius: 24 }), 180, [[0, '#6a4426'], [100, '#3a2414']]);
  f.label('Window', '', 300, 250, 120, 124, { fill: 'FF1E140C', radius: 12 });
  picture(f.label('Pendulum', '', 300, 236, 120, 190), PENDULUM, 'contain');
  picture(f.label('Face', '', 270, 30, 180, 180), FACE, 'contain');
  picture(f.label('HourHand', '', 270, 30, 180, 180), hand(70, 10, '#2a1e14'), 'contain');
  picture(f.label('MinuteHand', '', 270, 30, 180, 180), hand(108, 7, '#2a1e14'), 'contain');
  picture(f.label('SecondHand', '', 270, 30, 180, 180), hand(118, 3, '#c62828', 30), 'contain');
  f.label('Title', 'CLOCKWORK', 10, 150, 226, 40, { size: 22, colour: 'FFE8D2A8', spacing: 4, align: 'right' });
  f.label('Caption', 'the real time: a script holds each hand’s scene in place', 480, 150, 220, 60, { size: 13, colour: 'FFA8957A', family: 'JetBrains Mono', weight: 400, align: 'left' });
  // Scene one, by the clock: the pendulum, a second each way.
  f.clip('Pendulum', 'Transform', 0, frames([{ at: 0, rotate: -9, y: 0 }, { at: 0.5, rotate: 9 }, { at: 1, rotate: -9 }], { easing: 'inOutQuad' }), 2000);
  // Scenes two to four: one turn of each hand, which nothing plays; the script holds each at the time.
  f.clip('SecondHand', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 1);
  f.clip('MinuteHand', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 2);
  f.clip('HourHand', 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 1, rotate: 360 }]), 1000, 3);
  f.script('Clock', CLOCK_SCRIPT);
  return f.scenes([
    { name: 'Pendulum', length: 2000 },
    { name: 'Seconds', length: 1000, trigger: { type: 'script' }, loop: false },
    { name: 'Minutes', length: 1000, trigger: { type: 'script' }, loop: false },
    { name: 'Hours', length: 1000, trigger: { type: 'script' }, loop: false },
  ]);
}

/** Every mechanism, in order, each as the panel the editor opens. */
export const MECHANISMS = Object.freeze([
  ['geartrain', gearTrain], ['tapemachine', tapeMachine], ['musicbox', musicBox], ['dominorun', dominoRun], ['clockwork', clockwork],
]);

/** One mechanism's panel by its id, or null. */
export function mechanismPanel(id) {
  const entry = MECHANISMS.find(([key]) => key === id);
  return entry ? entry[1]() : null;
}

export { DOMINO_SCRIPT, CLOCK_SCRIPT };
