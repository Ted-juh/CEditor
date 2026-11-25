// songBookPanels.js — the Song Book: fifteen small panels named after songs, each acting out what
// its song is about. Like the Film Festival (filmFestivalPanels.js) they are a tour of the Animation
// Designer, not presets anyone needs; unlike it, two of them follow something other than the clock.
// Written to CE/panels/Song Book/ by export-song-book.mjs, and played for the demo recordings
// straight from here.
//
// No lyrics: a song's words are its own, so a panel carries its title, original drawings and
// motion, and nothing sung. The three traditional songs at the end keep to their shape (a round, a
// countdown, a ride), not their words either.
//
//   Paint It Black              a wall of coloured pads, each going black in turn
//   Purple Rain                 rain in two purple layers, puddles rippling under a street lamp
//   Here Comes the Sun          night lifts, the sun rises, and each knob wakes as the light reaches it
//   Every Breath You Take       two eyes that follow the pointer (a scene driven by the pointer)
//   Under Pressure              a meter forced into the red, the plate shaking harder, then the steam
//   Stairway to Heaven          the steps light one by one, and the top one opens into white
//   Another Brick in the Wall   bricks dropping into place row by row until the wall is closed
//   Ring of Fire                flames chasing round a knob whose arc sweeps with them
//   Video Killed the Radio Star a radio tuning, until a television switches on and takes over
//   99 Luftballons              ninety-nine balloons rising, then popping one at a time
//   Blue Monday                 a step sequencer that plays in time with the transport (a beat scene)
//   Bolero                      one figure repeated, a row joining each time, growing to the end
//   Row, Row, Row Your Boat     a round: four boats setting off one after another
//   Ten Green Bottles           a countdown: a bottle falls each verse, the number rolls down
//   Daisy Bell                  a bicycle made for two riding through a meadow of daisies

import {
  W, H, svg, frames, text, panelMaker, SONG_KIND, pattern, gradient, radial, picture, glow, seeded, RING, jitter, hiddenUntil,
} from './festivalKit.js';

/** One song's panel (festivalKit.js panelMaker). */
const song = (id, name, options = {}) => panelMaker(id, name, { ...options, kind: SONG_KIND });

/** Opacity held at 1 between two moments of a clip `length` long, 0 either side. */
const heldBetween = (from, to, length) => frames([
  { at: 0, opacity: 0 }, { at: from / length, opacity: 0 }, { at: Math.min(1, (from + 1) / length), opacity: 1 },
  { at: Math.min(1, to / length), opacity: 1 }, { at: Math.min(1, (to + 1) / length), opacity: 0 }, { at: 1, opacity: 0 },
]);

function paintItBlack() {
  const f = song('paintitblack', 'Paint It Black', { bg: 'FF0C0C0C' });
  const colours = ['FFE53935', 'FFFB8C00', 'FFFDD835', 'FF43A047', 'FF1E88E5', 'FF8E24AA', 'FFFF4081', 'FF00ACC1', 'FFC0CA33', 'FFFF7043', 'FF5E35B1', 'FF26A69A'];
  colours.forEach((colour, i) => f.label(`Pad${i + 1}`, '', 52 + (i % 4) * 157, 34 + Math.floor(i / 4) * 96, 141, 82, { fill: colour, radius: 12 }));
  f.label('Title', 'PAINT IT BLACK', 0, 330, W, 56, { size: 32, colour: 'FFF2F2F2', spacing: 10 });
  // In no order, each pad goes black, with a small press as it does; last of all the title.
  const order = [5, 0, 9, 3, 11, 7, 1, 10, 4, 8, 2, 6];
  const length = 6400;
  order.forEach((pad, k) => {
    const at = 300 + k * 360;
    f.clip(`Pad${pad + 1}`, 'Transform', at, frames([{ at: 0, fill: colours[pad], scale: 1 }, { at: 0.04, fill: 'FF000000', scale: 0.93 }, { at: 0.1, scale: 1 }, { at: 1, fill: 'FF000000', scale: 1 }]), length - at);
  });
  f.clip('Title', 'Transform', 4900, frames([{ at: 0, opacity: 1 }, { at: 0.6, opacity: 0.04 }, { at: 1, opacity: 0.04 }]), 1500);
  return f.done('Black', length);
}

const DROPS = (() => {
  const next = seeded(61);
  return svg(Array.from({ length: 14 }, () => {
    const x = next() * 110; const y = next() * 150;
    return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 3).toFixed(1)}" y2="${(y + 18).toFixed(1)}" stroke="#fff" stroke-width="1.4" stroke-opacity="${(0.4 + next() * 0.6).toFixed(2)}"/>`;
  }).join(''), 110, 150);
})();
const RIPPLE = svg('<ellipse cx="50" cy="15" rx="46" ry="12" fill="none" stroke="#fff" stroke-width="2"/>', 100, 30);
function purpleRain() {
  const f = song('purplerain', 'Purple Rain', { bg: 'FF12061F' });
  gradient(f.label('Sky', '', 0, 0, W, H), 180, [[0, '#14061f'], [55, '#3b1263'], [100, '#1d0833']]);
  radial(f.label('Lamp', '', 440, -40, 320, 320), [[0, '#AAF0D8FF'], [35, '#55B98CF0'], [100, '#00B98CF0']]);
  f.label('Post', '', 596, 40, 8, 300, { fill: 'FF0A0410' });
  gradient(f.label('Street', '', 0, 330, W, 75), 180, [[0, '#24103a'], [100, '#0b0414']]);
  const puddles = [[90, 352], [250, 372], [410, 348], [560, 366], [180, 388], [640, 386]];
  puddles.forEach(([x, y], i) => picture(f.label(`Ripple${i + 1}`, '', x - 40, y - 12, 80, 24), RIPPLE, 'contain'));
  pattern(f.label('RainFar', '', 0, 0, W, H), { src: DROPS, tint: 'FFB98CF0', opacity: 45, repeat: 'both', speed: 480, direction: 100 });
  pattern(f.label('RainNear', '', 0, 0, W, H), { src: DROPS, tint: 'FFE0C8FF', opacity: 70, repeat: 'both', speed: 760, direction: 103, scale: 1.7, offsetX: 50 });
  glow(f.label('Title', 'PURPLE RAIN', 40, 120, 640, 90, { size: 64, colour: 'FFE6C8FF', spacing: 6 }), 'FFB060FF', 22);
  puddles.forEach((_, i) => f.clip(`Ripple${i + 1}`, 'Transform', i * 230, frames([{ at: 0, scale: 0.1, opacity: 0.9 }, { at: 1, scale: 1.3, opacity: 0 }], { easing: 'outQuad', iterations: 5 }), 1100));
  f.clip('Title', 'Text', 600, text('shimmer', 'in', { colour: 'FFFFFFFF', stagger: 70, duration: 900 }), 1700);
  f.clip('Lamp', 'Transform', 0, frames([{ at: 0, opacity: 0.85 }, { at: 0.5, opacity: 1 }, { at: 0.55, opacity: 0.7 }, { at: 0.6, opacity: 1 }, { at: 1, opacity: 0.85 }]), 6000);
  return f.done('Downpour', 6000);
}

function hereComesTheSun() {
  const f = song('herecomesthesun', 'Here Comes the Sun', { bg: 'FF0B1026' });
  gradient(f.label('Dawn', '', 0, 0, W, H), 180, [[0, '#7ec8ff'], [55, '#ffd6a0'], [100, '#ff9a5a']]);
  gradient(f.label('Night', '', 0, 0, W, H), 180, [[0, '#060a1c'], [100, '#141b3c']]);
  const sun = radial(f.label('Sun', '', 280, 230, 160, 160, { radius: 80 }), [[0, '#ffffff'], [30, '#fff3c4'], [60, '#ffc04a'], [100, '#00FF8A1A']]);
  glow(sun, 'FFFFD27A', 40);
  gradient(f.label('Ground', '', 0, 300, W, 105), 180, [[0, '#2c2a40'], [100, '#121020']]);
  const knobs = 5;
  for (let i = 0; i < knobs; i += 1) f.add('Knob', `Knob${i + 1}`, 70 + i * 124, 296, 90, 90, { Behavior: { defaultValue: 0.2 + i * 0.15 } });
  gradient(f.label('Light', '', 0, 0, 260, H), 90, [[0, '#00FFF2C4'], [50, '#66FFF2C4'], [100, '#00FFF2C4']]);
  f.label('Title', 'HERE COMES THE SUN', 0, 40, W, 60, { size: 40, colour: 'FF3A2410', spacing: 4 });
  // The night lifts as the sun climbs, and a band of light crosses the panel, waking each knob in turn.
  f.clip('Night', 'Transform', 300, frames([{ at: 0, opacity: 1 }, { at: 1, opacity: 0 }], { easing: 'inOutQuad' }), 2600);
  f.clip('Sun', 'Transform', 0, frames([{ at: 0, y: 140, scale: 0.7 }, { at: 1, y: -118, scale: 1.1 }], { easing: 'outCubic' }), 3600);
  f.clip('Light', 'Transform', 1200, frames([{ at: 0, x: -260 }, { at: 1, x: 720 }], { easing: 'inOutQuad' }), 2400);
  for (let i = 0; i < knobs; i += 1) {
    const at = 1200 + Math.round(((70 + i * 124 + 45 + 130) / 980) * 2400);
    f.clip(`Knob${i + 1}`, 'Transform', 0, frames([{ at: 0, opacity: 0.18 }, { at: 1, opacity: 0.18 }]), at);
    f.clip(`Knob${i + 1}`, 'Transform', at, frames([{ at: 0, opacity: 0.18, scale: 1 }, { at: 0.5, opacity: 1, scale: 1.12 }, { at: 1, opacity: 1, scale: 1 }], { easing: 'outQuad' }), 500);
    f.clip(`Knob${i + 1}`, 'Value', at, { kind: 'value', easing: 'outCubic', frames: [{ at: 0, value: 0 }, { at: 1 }] }, 700);
  }
  f.clip('Title', 'Text', 3600, text('typewriter', 'in', { stagger: 55, duration: 200 }), 1200);
  return f.done('Sunrise', 6600);
}

const EYE = svg('<ellipse cx="80" cy="50" rx="76" ry="44" fill="#f4f1ea"/><ellipse cx="80" cy="50" rx="76" ry="44" fill="none" stroke="#c9c2b4" stroke-width="3"/>', 160, 100);
const IRIS = svg('<circle cx="30" cy="30" r="28" fill="#2f7d6d"/><circle cx="30" cy="30" r="28" fill="none" stroke="#1b4a40" stroke-width="3"/><circle cx="30" cy="30" r="12" fill="#0b0d0e"/><circle cx="38" cy="21" r="5" fill="#fff" fill-opacity=".85"/>', 60, 60);
const LID = svg('<path d="M0 0 H160 V52 Q80 112 0 52 Z" fill="#15181c"/>', 160, 100);
function everyBreathYouTake() {
  const f = song('everybreath', 'Every Breath You Take', { bg: 'FF15181C' });
  const eyes = [[150, 110], [410, 110]];
  eyes.forEach(([x, y], i) => picture(f.label(`Eye${i + 1}`, '', x, y, 160, 100), EYE, 'contain'));
  eyes.forEach(([x, y], i) => picture(f.label(`Iris${i + 1}`, '', x + 50, y + 20, 60, 60), IRIS, 'contain'));
  eyes.forEach(([x, y], i) => picture(f.label(`Lid${i + 1}`, '', x, y - 100, 160, 100), LID, 'contain'));
  f.label('Title', 'EVERY BREATH YOU TAKE', 0, 300, W, 40, { size: 22, colour: 'FFB8C2CC', spacing: 8 });
  f.label('Hint', 'move the pointer', 0, 344, W, 24, { size: 13, colour: 'FF6B7682', family: 'JetBrains Mono', weight: 400 });
  // The whole panel is where the pointer is heard: last, so it is on top of everything.
  f.label('Watch', '', 0, 0, W, H);
  // Scene one: a blink now and then, by the clock.
  for (const i of [1, 2]) f.clip(`Lid${i}`, 'Transform', 2800, frames([{ at: 0, y: 0 }, { at: 0.5, y: 96 }, { at: 1, y: 0 }], { easing: 'inOutQuad' }), 260);
  // Scene two: where the pointer is across the panel is where the eyes look.
  for (const i of [1, 2]) f.clip(`Iris${i}`, 'Transform', 0, frames([{ at: 0, x: -44 }, { at: 1, x: 44 }]), 1000, 1);
  return f.scenes([
    { name: 'Blink', length: 3400 },
    { name: 'Watching', length: 1000, trigger: { type: 'script' }, loop: false, clock: { source: 'pointerX', control: 'Watch', follow: 'spring', release: 'stay' } },
  ]);
}

const PUFF = svg('<defs><radialGradient id="p"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#p)"/>', 100, 100);
function underPressure() {
  const f = song('underpressure', 'Under Pressure', { bg: 'FF1A1D22' });
  gradient(f.label('Plate', '', 30, 40, 660, 260, { radius: 14 }), 160, [[0, '#59606a'], [50, '#3c424a'], [100, '#2a2e34']]);
  pattern(f.label('Rivets', '', 30, 40, 660, 260, { radius: 14 }), { src: 'builtin:dots', tint: 'FF8A929C', opacity: 60, repeat: 'both', scale: 3.2, speed: 0 });
  f.label('Face', '', 120, 130, 480, 80, { fill: 'FF0E1014', radius: 10 });
  const gauge = f.add('Meter', 'Gauge', 140, 150, 440, 40);
  gauge._children.Core.controlSetId = 'graphite';
  Object.assign(gauge._children.Meter, { segments: 24, segmentGap: 3, gradient: true, fillColour: 'FFFFB020', trackColour: 'FF1E2228', rounded: 2 });
  f.label('Red', '', 500, 136, 92, 6, { fill: 'FFFF3B30' });
  f.label('Psi', '99', 270, 226, 120, 50, { size: 40, colour: 'FFFFB020', family: 'JetBrains Mono', fill: 'FF0E1014', radius: 6 });
  f.label('Unit', 'PSI', 396, 246, 60, 24, { size: 16, colour: 'FF9AA3AE', family: 'JetBrains Mono', weight: 500, align: 'left' });
  for (const [i, [x, y]] of [[60, 40], [600, 40], [60, 240], [600, 240]].entries()) picture(f.label(`Steam${i + 1}`, '', x, y, 80, 80), PUFF, 'contain');
  f.label('Title', 'UNDER PRESSURE', 0, 320, W, 70, { size: 46, colour: 'FFFF5A3C', spacing: 6 });
  // The needle forced up in surges, each settling back a little less; the plate shaking harder.
  f.clip('Gauge', 'Value', 200, { kind: 'value', easing: 'inOutQuad', frames: [{ at: 0, value: 0 }, { at: 0.2, value: 0.4 }, { at: 0.28, value: 0.33 }, { at: 0.48, value: 0.66 }, { at: 0.55, value: 0.6 }, { at: 0.75, value: 0.9 }, { at: 0.8, value: 0.86 }, { at: 0.94, value: 1 }, { at: 1, value: 0 }] }, 4800);
  f.clip('Psi', 'Text', 200, text('reel', 'in', { spins: 28, glyphs: '0123456789', stagger: 300, duration: 4200, easing: 'outQuad' }), 4500);
  [[1200, 1], [2300, 2], [3400, 4], [4300, 7]].forEach(([at, amp]) => {
    for (const cname of ['Plate', 'Rivets', 'Face', 'Gauge', 'Red', 'Psi', 'Unit']) f.clip(cname, 'Transform', at, jitter(amp, { iterations: 3 }), 240);
  });
  // And it gives: steam from the corners, the title blown in.
  for (let i = 1; i <= 4; i += 1) f.clip(`Steam${i}`, 'Transform', 0, frames([{ at: 0, opacity: 0, scale: 0.2 }, { at: 0.8, opacity: 0, scale: 0.2 }, { at: 0.85, opacity: 1, scale: 0.6 }, { at: 1, opacity: 0, scale: 2.4 }], { easing: 'outQuad' }), 6000);
  f.clip('Title', 'Text', 5000, text('explode', 'in', { scatter: 160, scale: 3, order: 'random', stagger: 20, duration: 520 }), 900);
  hiddenUntil(f, 'Title', 5000);
  return f.done('Rising', 6800);
}

function stairwayToHeaven() {
  const f = song('stairway', 'Stairway to Heaven', { bg: 'FF07080C' });
  gradient(f.label('Dark', '', 0, 0, W, H), 180, [[0, '#0b0d18'], [100, '#050507']]);
  const steps = 8;
  for (let i = 0; i < steps; i += 1) f.label(`Step${i + 1}`, '', 40 + i * 78, 338 - i * 40, 120, 16, { fill: 'FF262833', radius: 3 });
  for (let i = 0; i < steps; i += 1) glow(f.label(`Lit${i + 1}`, '', 40 + i * 78, 338 - i * 40, 120, 16, { fill: 'FFF6D27A', radius: 3 }), 'FFFFD27A', 16);
  radial(f.label('Heaven', '', 646 - 750, 58 - 750, 1500, 1500), [[0, '#ffffff'], [40, '#fffaf0'], [72, '#fff6e4'], [100, '#00FFF6E4']]);
  f.label('Title', 'STAIRWAY TO HEAVEN', 0, 170, W, 60, { size: 36, colour: 'FF8A7448', weight: 300, spacing: 10 });
  // One step at a time, upwards; the top one opens into white, and the name is written there.
  for (let i = 0; i < steps; i += 1) f.clip(`Lit${i + 1}`, 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: (300 + i * 420) / 4400, opacity: 0 }, { at: (300 + i * 420 + 180) / 4400, opacity: 1 }, { at: 1, opacity: 1 }]), 4400);
  f.clip('Heaven', 'Transform', 0, frames([{ at: 0, opacity: 0, scale: 0.2 }, { at: 0.58, opacity: 0, scale: 0.2 }, { at: 0.8, opacity: 1, scale: 1 }, { at: 1, opacity: 1, scale: 1 }], { easing: 'inQuad' }), 6200);
  f.clip('Title', 'Text', 4900, text('crossfade', 'in', { split: 'letter', order: 'centre', stagger: 45, duration: 700 }), 1400);
  return f.done('Climb', 7000);
}

function anotherBrick() {
  const f = song('anotherbrick', 'Another Brick in the Wall', { bg: 'FF5B6470' });
  gradient(f.label('Sky', '', 0, 0, W, H), 180, [[0, '#9aa4b0'], [100, '#5b6470']]);
  f.label('Mortar', '', 0, 105, W, 300, { fill: 'FFB9B0A2' });
  const tones = ['FF8D4A32', 'FF9E5539', 'FF7A3F2B', 'FFA65F42', 'FF84452F', 'FF94503A'];
  const next = seeded(77);
  const bricks = [];
  for (let row = 0; row < 6; row += 1) {
    const offset = row % 2 ? -40 : 0;
    for (let col = 0; col < (row % 2 ? 10 : 9); col += 1) {
      const cname = `Brick${row + 1}_${col + 1}`;
      f.label(cname, '', offset + col * 80 + 2, 405 - (row + 1) * 50 + 2, 76, 46, { fill: tones[Math.floor(next() * tones.length)], radius: 2 });
      bricks.push({ cname, row, col });
    }
  }
  f.label('Title', 'ANOTHER BRICK IN THE WALL', 0, 220, W, 70, { size: 34, colour: 'FFF4EEE2', spacing: 4 });
  // Row by row from the ground up, each brick dropped into its place.
  for (const { cname, row, col } of bricks) {
    const at = 150 + row * 640 + col * 52;
    f.clip(cname, 'Transform', at, frames([{ at: 0, y: -460 }, { at: 0.8, y: 4 }, { at: 1, y: 0 }], { easing: 'inQuad' }), 420);
  }
  f.clip('Title', 'Text', 4700, text('explode', 'in', { scatter: 60, scale: 2.2, stagger: 18, duration: 420 }), 900);
  hiddenUntil(f, 'Title', 4700);
  return f.done('Built', 6800);
}

const FLAME = svg('<defs><linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d00"/><stop offset=".55" stop-color="#ff9800"/><stop offset="1" stop-color="#ffe082"/></linearGradient></defs><path d="M20 58 C 4 50 2 34 12 22 C 14 30 18 32 20 30 C 16 18 22 8 28 2 C 28 14 38 22 38 36 C 38 50 30 58 20 58 Z" fill="url(#f)"/>', 40, 60);
function ringOfFire() {
  const f = song('ringoffire', 'Ring of Fire', { bg: 'FF0A0503' });
  radial(f.label('Embers', '', 110, -50, 500, 500), [[0, '#55FF5A1A'], [60, '#22FF3D00'], [100, '#00FF3D00']]);
  const flames = 22;
  const [cx, cy, r] = [360, 180, 140];
  for (let i = 0; i < flames; i += 1) {
    const a = (i / flames) * Math.PI * 2 - Math.PI / 2;
    picture(f.label(`Flame${i + 1}`, '', Math.round(cx + Math.cos(a) * r - 16), Math.round(cy + Math.sin(a) * r - 24), 32, 48), FLAME, 'contain');
  }
  f.add('Knob', 'Heart', cx - 60, cy - 60, 120, 120, { Behavior: { defaultValue: 0 } });
  glow(f.label('Title', 'RING OF FIRE', 0, 340, W, 50, { size: 32, colour: 'FFFFB347', spacing: 10 }), 'FFFF5A1A', 14);
  // The flames chase round the ring, a wave of them leaping; the knob's arc sweeps round with it.
  for (let i = 0; i < flames; i += 1) f.clip(`Flame${i + 1}`, 'Transform', i * 60, frames([{ at: 0, scale: 1.45, opacity: 1 }, { at: 0.35, scale: 0.85, opacity: 0.75 }, { at: 1, scale: 0.85, opacity: 0.75 }], { easing: 'outQuad', iterations: 4 }), flames * 60);
  for (const at of [0, 2640]) f.clip('Heart', 'Value', at, { kind: 'value', easing: 'inOutCubic', frames: [{ at: 0, value: 0 }, { at: 0.5, value: 1 }, { at: 1, value: 0 }] }, 2640);
  f.clip('Title', 'Text', 400, text('shimmer', 'in', { colour: 'FFFFFFFF', stagger: 60, duration: 600 }), 1300);
  return f.done('Burning', 5600);
}

const STATIC = (() => {
  const next = seeded(91);
  return svg(Array.from({ length: 260 }, () => `<rect x="${Math.floor(next() * 60)}" y="${Math.floor(next() * 40)}" width="2" height="2" fill="#fff" fill-opacity="${(0.2 + next() * 0.8).toFixed(2)}"/>`).join(''), 60, 40);
})();
function videoKilledTheRadioStar() {
  const f = song('videoradio', 'Video Killed the Radio Star', { bg: 'FF1C1714' });
  gradient(f.label('Wall', '', 0, 0, W, H), 180, [[0, '#2a221c'], [100, '#14100d']]);
  const radio = ['Radio', 'Dial', 'Scale', 'Needle', 'Grille', 'Tuner'];
  gradient(f.label('Radio', '', 40, 120, 330, 200, { radius: 22 }), 180, [[0, '#9a6a3c'], [100, '#5a3a1e']]);
  f.label('Dial', '', 62, 140, 286, 54, { fill: 'FFF2E2B8', radius: 6 });
  f.label('Scale', '88   92   96   100   104   108', 62, 140, 286, 30, { size: 13, colour: 'FF5A3A1E', family: 'JetBrains Mono', weight: 500 });
  f.label('Needle', '', 82, 146, 4, 42, { fill: 'FFD62828' });
  pattern(f.label('Grille', '', 62, 210, 170, 92, { fill: 'FF3A2614', radius: 8 }), { src: 'builtin:dots', tint: 'FF1E130A', opacity: 100, repeat: 'both', speed: 0, scale: 0.8 });
  f.add('Knob', 'Tuner', 256, 214, 84, 84, { Behavior: { defaultValue: 0.5 } });
  f.label('TV', '', 410, 70, 280, 230, { fill: 'FF1E2126', radius: 26 });
  f.label('Screen', '', 432, 90, 236, 170, { fill: 'FF050607', radius: 16 });
  const noise = f.label('Static', '', 432, 90, 236, 170, { fill: 'FF2A2E34', radius: 16 });
  pattern(noise, { src: STATIC, tint: 'FFFFFFFF', opacity: 80, repeat: 'both', speed: 900, direction: 30 });
  pattern(noise, { src: STATIC, tint: 'FFFFFFFF', opacity: 60, repeat: 'both', speed: 1300, direction: 200, scale: 1.4, offsetX: 17 });
  f.label('Line', '', 432, 172, 236, 6, { fill: 'FFFFFFFF' });
  f.label('Title', 'VIDEO KILLED THE RADIO STAR', 442, 120, 216, 110, { size: 24, colour: 'FFFFFFFF', family: 'Rubik', weight: 700, lineHeight: 1.1 });
  // The radio tunes back and forth, the needle and the knob together.
  f.clip('Needle', 'Transform', 0, frames([{ at: 0, x: 0 }, { at: 0.3, x: 180 }, { at: 0.55, x: 90 }, { at: 0.8, x: 240 }, { at: 1, x: 150 }], { easing: 'inOutQuad' }), 2600);
  f.clip('Tuner', 'Value', 0, { kind: 'value', easing: 'inOutQuad', frames: [{ at: 0, value: 0 }, { at: 0.3, value: 0.72 }, { at: 0.55, value: 0.36 }, { at: 0.8, value: 0.96 }, { at: 1, value: 0.6 }] }, 2600);
  // The set clicks on: a line, then snow; the television grows over the radio, which fades away.
  f.clip('Line', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.86, opacity: 0, scale: 0.05 }, { at: 0.92, opacity: 1, scale: 1 }, { at: 1, opacity: 0, scale: 1 }]), 3000);
  hiddenUntil(f, 'Static', 2950);
  for (const cname of ['TV', 'Screen', 'Static', 'Title']) f.clip(cname, 'Transform', 3300, frames([{ at: 0, x: 0, y: 0, scale: 1 }, { at: 1, x: -190, y: 18, scale: 1.45 }], { easing: 'inOutCubic' }), 1100);
  for (const cname of radio) f.clip(cname, 'Transform', 3300, frames([{ at: 0, opacity: 1, scale: 1 }, { at: 1, opacity: 0.08, scale: 0.86 }], { easing: 'inOutCubic' }), 1100);
  f.clip('Title', 'Text', 4400, text('typewriter', 'in', { stagger: 45, duration: 120 }), 1400);
  hiddenUntil(f, 'Title', 4400);
  return f.done('Switch on', 6800);
}

const BALLOON = (colour) => svg(`<path d="M15 2 C 26 2 30 12 28 20 C 26 28 19 33 15 34 C 11 33 4 28 2 20 C 0 12 4 2 15 2 Z" fill="${colour}"/><path d="M15 34 L 13 37 L 17 37 Z" fill="${colour}"/><path d="M15 37 C 18 42 12 46 15 52" stroke="#e8e8e8" stroke-width="1" fill="none"/><ellipse cx="10" cy="11" rx="3" ry="5" fill="#fff" fill-opacity=".45"/>`, 30, 54);
function luftballons() {
  const f = song('luftballons', '99 Luftballons', { bg: 'FF6EB4E8' });
  gradient(f.label('Sky', '', 0, 0, W, H), 180, [[0, '#4a9ae0'], [100, '#cfe9ff']]);
  const next = seeded(99);
  const reds = ['#e53935', '#d32f2f', '#f44336', '#c62828', '#ff5252'];
  const length = 7600;
  const pops = Array.from({ length: 99 }, (_, i) => i).sort(() => next() - 0.5);
  for (let i = 0; i < 99; i += 1) {
    const x = Math.round(8 + next() * 680);
    picture(f.label(`Balloon${i + 1}`, '', x, 420, 30, 54), BALLOON(reds[Math.floor(next() * reds.length)]), 'contain');
    const start = Math.round(next() * 2600);
    const rise = 2200 + Math.round(next() * 1400);
    const height = 120 + Math.round(next() * 360);
    const sway = 6 + next() * 12;
    const pop = 4300 + pops.indexOf(i) * 22;
    const len = length - start;
    const t = (ms) => Math.min(1, (ms - start) / len);
    f.clip(`Balloon${i + 1}`, 'Transform', start, frames([
      { at: 0, x: 0, y: 0, opacity: 1, scale: 1 },
      { at: t(start + rise * 0.33), x: sway, y: -height * 0.33 },
      { at: t(start + rise * 0.66), x: -sway, y: -height * 0.66 },
      { at: t(start + rise), x: 0, y: -height },
      { at: t(Math.max(start + rise + 1, pop)), y: -height, scale: 1, opacity: 1 },
      { at: t(Math.max(start + rise + 2, pop + 110)), y: -height, scale: 1.8, opacity: 0 },
      { at: 1, y: -height, scale: 1.8, opacity: 0 },
    ]), len);
  }
  glow(f.label('Title', '99 LUFTBALLONS', 0, 160, W, 80, { size: 58, colour: 'FFFFFFFF', spacing: 4 }), '66103A6A', 12);
  f.clip('Title', 'Text', 900, text('typewriter', 'in', { stagger: 70, duration: 200 }), 1100);
  return f.done('Released', length);
}

function blueMonday() {
  const f = song('bluemonday', 'Blue Monday', { bg: 'FF070B14' });
  const rows = [['KICK', [0, 4, 8, 10, 12]], ['SNARE', [4, 12]], ['HAT', [2, 6, 10, 14]], ['CLAP', [4, 12, 15]]];
  const [x0, step, size] = [100, 37, 29];
  rows.forEach(([name], r) => f.label(`Name${r + 1}`, name, 12, 92 + r * 52, 80, size, { size: 13, colour: 'FF6F8FB8', family: 'JetBrains Mono', weight: 500, align: 'right' }));
  rows.forEach((_, r) => { for (let s = 0; s < 16; s += 1) f.label(`Lamp${r + 1}_${s + 1}`, '', x0 + s * step, 92 + r * 52, size, size, { fill: s % 4 === 0 ? 'FF1C2C48' : 'FF14203A', radius: 6 }); });
  f.label('Head', '', x0 - 4, 84, size + 8, 4 * 52 - 6, { fill: '22A8D4FF', radius: 8 });
  glow(f.label('Title', 'BLUE MONDAY', 0, 20, W, 50, { size: 34, colour: 'FF4FA8FF', spacing: 12 }), 'FF1E6FFF', 16);
  f.label('Hint', 'press Play: the sequencer follows the transport, a bar at a time', 0, 330, W, 22, { size: 13, colour: 'FF6F8FB8', family: 'JetBrains Mono', weight: 400 });
  f.label('Tempo', '120 BPM', 0, 358, W, 24, { size: 15, colour: 'FFA8D4FF', family: 'JetBrains Mono', weight: 700 });
  // Scene one, by the clock: the title glowing on, the hint breathing.
  f.clip('Title', 'Text', 200, text('shimmer', 'in', { colour: 'FFFFFFFF', stagger: 60, duration: 600 }), 1300);
  f.clip('Hint', 'Transform', 0, frames([{ at: 0, opacity: 0.35 }, { at: 0.5, opacity: 1 }, { at: 1, opacity: 0.35 }], { easing: 'inOutQuad' }), 2400);
  // Scene two, on the transport: a bar of sixteen steps, started again on every fourth beat.
  const bar = 2000;
  const sixteenth = bar / 16;
  rows.forEach(([, hits], r) => hits.forEach((s) => f.clip(`Lamp${r + 1}_${s + 1}`, 'Transform', s * sixteenth, frames([{ at: 0, fill: s % 4 === 0 ? 'FF1C2C48' : 'FF14203A', scale: 1 }, { at: 0.05, fill: 'FFBFE0FF', scale: 1.18 }, { at: 1, fill: s % 4 === 0 ? 'FF1C2C48' : 'FF14203A', scale: 1 }], { easing: 'outQuad' }), 230, 1)));
  const head = [];
  for (let s = 0; s < 16; s += 1) head.push({ at: s / 16, x: s * step }, { at: (s + 1) / 16 - 0.0005, x: s * step });
  f.clip('Head', 'Transform', 0, frames(head), bar, 1);
  return f.scenes([
    { name: 'Idle', length: 2400 },
    { name: 'Bar', length: bar, trigger: { type: 'beat', every: 4 }, loop: false },
  ]);
}

function bolero() {
  const f = song('bolero', 'Bolero', { bg: 'FF0C0608' });
  radial(f.label('Swell', '', -40, -160, 800, 720), [[0, '#FFFF6A3D'], [45, '#88B0302A'], [100, '#00200808']]);
  const rows = 6;
  const cols = 8;
  const figure = [0, 3, 4, 5, 6, 7];
  const rep = 1200;
  const tones = [['FF3A1A10', 'FFFFB27A'], ['FF3A1A14', 'FFFF9A6A'], ['FF3A1418', 'FFFF7A6A'], ['FF38121C', 'FFFF5A6A'], ['FF34101E', 'FFFF4A7A'], ['FF300E22', 'FFFFFFFF']];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) f.label(`Lamp${r + 1}_${c + 1}`, '', 170 + c * 50, 300 - r * 46, 34, 34, { fill: tones[r][0], radius: 17 });
  f.label('Title', 'BOLÉRO', 0, 345, W, 50, { size: 30, colour: 'FFFFD2B0', weight: 300, spacing: 18 });
  f.label('Flash', '', 0, 0, W, H, { fill: 'FFFFF6EE' });
  // One figure, over and over; each time round another row joins it, and the whole grows. A clip
  // plays once, so each row's figure is written out once a time round.
  const beat = (r, c) => {
    const at = c / cols;
    return frames([{ at: 0, fill: tones[r][0] }, { at, fill: tones[r][0], scale: 1 }, { at: at + 0.02, fill: tones[r][1], scale: 1.25 }, { at: at + 0.11, fill: tones[r][0], scale: 1 }, { at: 1, fill: tones[r][0] }]);
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) if (r > 0) hiddenUntil(f, `Lamp${r + 1}_${c + 1}`, r * rep);
    for (let k = r; k < rows; k += 1) for (const c of figure) f.clip(`Lamp${r + 1}_${c + 1}`, 'Transform', k * rep, beat(r, c), rep);
  }
  f.clip('Swell', 'Transform', 0, frames([{ at: 0, opacity: 0.05, scale: 0.6 }, { at: 1, opacity: 1, scale: 1.15 }], { easing: 'inQuad' }), rows * rep);
  f.clip('Title', 'Transform', 0, frames([{ at: 0, scale: 0.8, opacity: 0.4 }, { at: 1, scale: 1.4, opacity: 1 }], { easing: 'inQuad' }), rows * rep);
  // And the end, all at once.
  f.clip('Flash', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: (rows * rep) / 7800, opacity: 0 }, { at: (rows * rep + 60) / 7800, opacity: 1 }, { at: 1, opacity: 0 }], { easing: 'outQuad' }), 7800);
  return f.done('Crescendo', 7800);
}

const BOAT = svg('<path d="M4 22 L 72 22 L 62 34 L 14 34 Z" fill="#8d5a2b"/><path d="M4 22 L 72 22" stroke="#5a3714" stroke-width="2"/><circle cx="38" cy="10" r="5" fill="#2b2b2b"/><path d="M33 22 L 35 14 L 41 14 L 43 22 Z" fill="#d84315"/><path d="M14 30 L 58 8" stroke="#5a3714" stroke-width="2.5"/><path d="M8 34 L 18 26" stroke="#5a3714" stroke-width="5" stroke-linecap="round"/>', 76, 38);
function rowYourBoat() {
  const f = song('rowyourboat', 'Row, Row, Row Your Boat', { bg: 'FF2D7FB5' });
  f.label('BankTop', '', 0, 0, W, 70, { fill: 'FF5A9E3C' });
  gradient(f.label('River', '', 0, 70, W, 275), 180, [[0, '#3d93c9'], [100, '#1f6a9c']]);
  f.label('BankFoot', '', 0, 345, W, 60, { fill: 'FF4C8A30' });
  for (let lane = 0; lane < 4; lane += 1) pattern(f.label(`Waves${lane + 1}`, '', 0, 88 + lane * 64, W, 40), { src: 'builtin:sine', tint: 'FFCDE8F8', opacity: 45, repeat: 'x', speed: 30 + lane * 8, direction: 180, offsetY: 8 });
  for (let lane = 0; lane < 4; lane += 1) picture(f.label(`Boat${lane + 1}`, '', -90, 80 + lane * 64, 76, 38), BOAT, 'contain');
  for (let lane = 0; lane < 4; lane += 1) f.label(`Part${lane + 1}`, `${lane + 1}`, 10, 88 + lane * 64, 24, 24, { size: 13, colour: 'FFFFFFFF', family: 'JetBrains Mono', fill: '66000000', radius: 12 });
  f.label('Title', 'ROW, ROW, ROW YOUR BOAT', 0, 14, W, 44, { size: 26, colour: 'FFFFFFFF', spacing: 4 });
  f.label('Caption', 'a round for four voices, each one entering after the one before', 0, 360, W, 30, { size: 14, colour: 'FFE8F5DC', family: 'Barlow', weight: 500 });
  // A round: the same crossing four times over, each boat setting off after the one before, rowing
  // as it goes.
  const crossing = 4400;
  const after = 1100;
  for (let lane = 0; lane < 4; lane += 1) {
    const list = [];
    for (let k = 0; k <= 8; k += 1) list.push({ at: k / 8, x: (k / 8) * 820, y: k % 2 ? -3 : 0, rotate: k % 2 ? -3 : 2 });
    f.clip(`Boat${lane + 1}`, 'Transform', lane * after, frames(list), crossing);
    f.clip(`Part${lane + 1}`, 'Transform', lane * after, frames([{ at: 0, scale: 1.6, fill: 'FFFFB300' }, { at: 1, scale: 1, fill: '66000000' }], { easing: 'outQuad' }), 500);
  }
  return f.done('Round', 3 * after + crossing + 300);
}

const MORTAR = svg('<path d="M0 0.5 H 40 M0 12.5 H 40 M0.5 0 V 12 M20.5 12 V 24" stroke="#fff" stroke-width="1.5" fill="none"/>', 40, 24);
const BOTTLE = svg('<rect x="11" y="0" width="10" height="5" rx="1" fill="#2e5d2e"/><path d="M12 5 H20 V18 C 20 22 28 24 28 32 V70 C 28 74 26 76 22 76 H10 C 6 76 4 74 4 70 V32 C 4 24 12 22 12 18 Z" fill="#2f8f3a" fill-opacity=".9"/><rect x="8" y="34" width="4" height="34" rx="2" fill="#fff" fill-opacity=".35"/>', 32, 76);
function tenGreenBottles() {
  const f = song('tengreenbottles', 'Ten Green Bottles', { bg: 'FF1E2A36' });
  gradient(f.label('Night', '', 0, 0, W, H), 180, [[0, '#24364a'], [100, '#131c26']]);
  pattern(f.label('Wall', '', 0, 250, W, 155, { fill: 'FF7D4A34' }), { src: MORTAR, tint: 'FFB9A08A', opacity: 70, repeat: 'both', speed: 0 });
  f.label('Ledge', '', 0, 244, W, 10, { fill: 'FF9A8C7A' });
  for (let i = 0; i < 10; i += 1) picture(f.label(`Bottle${i + 1}`, '', 40 + i * 50, 168, 32, 76), BOTTLE, 'contain');
  for (let k = 10; k >= 0; k -= 1) f.label(`Count${k}`, String(k), 560, 120, 140, 110, { size: 96, colour: 'FFB9F0B0', family: 'JetBrains Mono' });
  f.label('Title', 'TEN GREEN BOTTLES', 0, 20, W, 50, { size: 30, colour: 'FFDDF5D8', spacing: 6 });
  f.label('Caption', 'a traditional counting song', 0, 66, W, 24, { size: 14, colour: 'FF9FB4C8', family: 'Barlow', weight: 500 });
  // A verse each, a bottle falls: from the right-hand end, tipping as it goes; the count rolls down.
  const verse = 600;
  const first = 500;
  const length = first + 10 * verse + 900;
  for (let k = 0; k < 10; k += 1) {
    const i = 9 - k;
    const at = first + k * verse;
    f.clip(`Bottle${i + 1}`, 'Transform', at, frames([{ at: 0, y: 0, rotate: 0, opacity: 1 }, { at: 0.3, y: 6, rotate: 30 }, { at: 1, y: 230, rotate: 150, opacity: 0 }], { easing: 'inQuad' }), 900);
  }
  for (let k = 10; k >= 0; k -= 1) {
    const from = k === 10 ? 0 : first + (9 - k) * verse + 300;
    const to = k === 0 ? length - 1 : first + (10 - k) * verse + 299;
    f.clip(`Count${k}`, 'Transform', 0, heldBetween(from, to, length), length);
    if (k < 10) f.clip(`Count${k}`, 'Text', from, text('roll', 'in', { direction: 'down', duration: 220 }), 260);
  }
  return f.done('Countdown', length);
}

const TANDEM = svg('<g fill="none" stroke="#1b1b1b" stroke-width="3"><circle cx="16" cy="48" r="13"/><circle cx="104" cy="48" r="13"/><path d="M16 48 L 36 30 L 82 30 L 104 48 M36 30 L 46 48 L 60 30 L 70 48 L 82 30 M30 22 L 40 22 M64 22 L 74 22 M86 20 L 92 18"/></g>'
  + '<path d="M34 22 C 34 12 40 6 44 6 C 48 2 52 6 50 10 C 48 16 44 20 42 26 Z" fill="#1b1b1b"/><path d="M68 22 C 68 12 74 6 78 6 C 82 2 86 6 84 10 C 82 16 78 20 76 26 Z" fill="#1b1b1b"/>', 120, 64);
const DAISY = svg('<g fill="#fff">' + Array.from({ length: 10 }, (_, i) => `<ellipse cx="20" cy="8" rx="3.5" ry="8" transform="rotate(${i * 36} 20 20)"/>`).join('') + '</g><circle cx="20" cy="20" r="5" fill="#f9c80e"/>', 40, 40);
function daisyBell() {
  const f = song('daisybell', 'Daisy Bell', { bg: 'FF9ED8F5' });
  gradient(f.label('Sky', '', 0, 0, W, H), 180, [[0, '#8fd0f2'], [100, '#e6f6ff']]);
  radial(f.label('Hill', '', -200, 250, 1120, 420, { radius: 560 }), [[0, '#8bd16a'], [70, '#5aa83c'], [100, '#3f8a2a']], { centerX: 50, centerY: 0 });
  const next = seeded(1892);
  const flowers = 16;
  for (let i = 0; i < flowers; i += 1) picture(f.label(`Daisy${i + 1}`, '', Math.round(20 + (i / flowers) * 680 + next() * 20), Math.round(318 + next() * 60), 26, 26), DAISY, 'contain');
  picture(f.label('Tandem', '', -190, 236, 168, 90), TANDEM, 'contain');
  f.label('Title', 'DAISY BELL', 0, 40, W, 60, { size: 44, colour: 'FFFFFFFF', spacing: 8 });
  f.label('Caption', '1892', 0, 96, W, 26, { size: 16, colour: 'FF3B6E8F', family: 'JetBrains Mono', weight: 500 });
  // Across the meadow, two riding as one; the daisies opening as they pass.
  const ride = 5200;
  const list = [];
  for (let k = 0; k <= 10; k += 1) list.push({ at: k / 10, x: (k / 10) * 1000, y: (k % 2 ? -3 : 0) + Math.sin((k / 10) * Math.PI) * -18 });
  f.clip('Tandem', 'Transform', 200, frames(list), ride);
  for (let i = 0; i < flowers; i += 1) {
    const x = 20 + (i / flowers) * 680;
    const at = 200 + Math.round(((x + 140) / 1000) * ride);
    f.clip(`Daisy${i + 1}`, 'Transform', 0, frames([{ at: 0, scale: 0, opacity: 0 }, { at: 0.999, scale: 0, opacity: 0 }, { at: 1, scale: 1, opacity: 1 }]), at);
    f.clip(`Daisy${i + 1}`, 'Transform', at, frames([{ at: 0, scale: 0, rotate: -40, opacity: 1 }, { at: 1, scale: 1, rotate: 0, opacity: 1 }], { easing: 'outQuad' }), 420);
  }
  f.clip('Title', 'Text', 300, text('roll', 'in', { split: 'letter', stagger: 60, duration: 360, direction: 'up' }), 1100);
  return f.done('Ride', ride + 900);
}

/** Every song, in the book's order, each as the panel the editor opens. */
export const SONGS = Object.freeze([
  ['paintitblack', paintItBlack], ['purplerain', purpleRain], ['herecomesthesun', hereComesTheSun],
  ['everybreath', everyBreathYouTake], ['underpressure', underPressure], ['stairway', stairwayToHeaven],
  ['anotherbrick', anotherBrick], ['ringoffire', ringOfFire], ['videoradio', videoKilledTheRadioStar],
  ['luftballons', luftballons], ['bluemonday', blueMonday], ['bolero', bolero],
  ['rowyourboat', rowYourBoat], ['tengreenbottles', tenGreenBottles], ['daisybell', daisyBell],
]);

/** One song's panel by its id, or null. */
export function songPanel(id) {
  const entry = SONGS.find(([key]) => key === id);
  return entry ? entry[1]() : null;
}
