// filmFestivalPanels.js — the Film Festival: twenty-two small panels, each a homage to a film's title
// sequence, each showing off a different corner of the Animation Designer. Practical they are not;
// they are a tour. Written to CE/panels/Film Festival/ by export-film-festival.mjs, and played for
// the demo recordings straight from here.
//
//   Terminator          letters stamped in, a glint along the metal, a red eye, a HUD typing
//   Jaws                a fin crossing, the sea's pulse quickening, the letters surfacing one by one
//   The Shining         elevator doors part — the word with them (Part) — and the red pours in
//   Back to the Future  the speedometer climbs, the readout rolls to 88 (Reel), a flash, fire trails
//   The Matrix          glyph rain on three layers, the title decoding (Reel), a light along it
//   Vertigo             a spiral turns and zooms in while its frame pulls back: the dolly zoom
//   Psycho              bars slash in from both sides, the title wipes in, then splits (Part)
//   Mission: Impossible a spark runs the fuse and every knob lights as it passes
//
// The second reel:
//
//   Star Wars           an opening line, a title falling away into the stars, a crawl of eight lines
//   Blade Runner        rain on two layers, a skyline, a neon sign stuttering alight, a searchlight
//   Tron                light cycles typing their trails (box-drawing lines), a derez, the title wiped in
//   Jurassic Park       footsteps: ripples in a cup, each thump shaking harder, the title exploding in
//   Close Encounters    five lamps play five notes, twice, under a ship whose lights chase round it
//   Indiana Jones       a route typed along turned labels, a plane flying it, cities named as it lands
//   Groundhog Day       5:59 flips to 6:00 (a Reel of one spin), the alarm, AGAIN.
//   Alien               a motion tracker's sweep and pings, blips closing in, the title out of order
//   The Wizard of Oz    a sepia door opens, the colour comes in through it
//   Ocean's Eleven      a marquee chasing, three reels stopping on sevens one after another, JACKPOT
//   2001                the earth over the moon, the sun over the earth
//   Speed               a real knob's needle driven by a value clip, kept above fifty, nearly not
//   Inception           frames falling away inside frames, a top spinning, a cut to black
//   Top Gun             the horizon banking, brackets closing on a target, LOCK
//
// Each panel has one scene, played when the panel opens and looping. Everything is the library's
// effects or frames written out; nothing needs a script. The looks are homages in plain type and
// shapes, not any film's own lettering or artwork.

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { normalizeControlSet } from '../src/CE_Application/models/controlSets.js';
import { sceneEffect } from '../src/CE_Application/utils/sceneModel.js';
import { addPatternPatch } from '../src/CE_Application/utils/patternLayers.js';

const W = 720;
const H = 405;

const svg = (body, w, h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
const fx = (id, over = {}) => ({ ...sceneEffect(id).effect, ...over });
const frames = (list, over = {}) => ({ kind: 'keyframes', easing: 'linear', iterations: 1, direction: 'normal', frames: list, ...over });
const text = (effect, way, over = {}) => ({ kind: 'text', effect, way, iterations: 1, ...over });

/** One film's panel, its controls numbered from a hash of its id so the file only changes when the film does. */
function film(id, name, { set = 'carbon-pro', bg = 'FF000000' } = {}) {
  let hash = 5381;
  for (const ch of `ceditor-film:${id}`) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  let n = 1_700_000_000_000 + (hash % 90_000_000) * 1000;
  const controls = [];
  const clips = [];
  const ids = {};
  const add = (type, cname, x, y, w, h, over = {}) => {
    const control = createControl(type, { Transform: { x, y, width: w, height: h }, ...over });
    control._children.Core.id = `ctrl_${n++}`;
    control._children.Core.name = cname;
    ids[cname] = control._children.Core.id;
    controls.push(control);
    return control;
  };
  /** A Label: its words in a face, a size and a colour; no border; a fill only when given one. */
  const label = (cname, words, x, y, w, h, { size = 14, colour = 'FFFFFFFF', family = 'Space Grotesk', weight = 700, fill = null, radius = 0, align = null, spacing = null, lineHeight = null, rotation = null } = {}) => {
    const control = add('Label', cname, x, y, w, h, {
      Text: { content: words, _children: { Font: { family, size, weight: weight >= 700 ? 'Bold' : weight >= 500 ? 'Medium' : weight >= 400 ? 'Regular' : 'Light', weightValue: weight }, Fill: { colour } } },
    });
    const bgc = control._children.Background._children;
    bgc.Fill = { ...bgc.Fill, colour: fill ?? '00000000' };
    bgc.Border = { ...(bgc.Border ?? {}), enabled: false };
    bgc.Corners = { ...(bgc.Corners ?? {}), radius };
    const words_ = control._children.Text._children;
    if (align) words_.Position = { ...words_.Position, justification: align };
    if (spacing !== null) words_.Font = { ...words_.Font, letterSpacing: spacing };
    if (lineHeight !== null) words_.Multiline = { ...words_.Multiline, lineHeight };
    if (rotation !== null) control._children.Transform.rotation = rotation;
    return control;
  };
  const clip = (cname, target, start, effect, length) => {
    clips.push({ id: `cl_${id}_${clips.length + 1}`, controlId: ids[cname], target, start, length, effect });
  };
  const done = (sceneName, length) => {
    const panel = createPanel(name);
    const h = (hash >>> 0).toString(16).padStart(8, '0');
    Object.assign(panel, {
      name, width: W, height: H, bgColour: bg, controls,
      panelGuid: `${h}-f11d-4fe5-a5e5-${h}${h.slice(0, 4)}`,
      scriptId: `film_${id}`,
      filePath: null,
      controlSet: normalizeControlSet(set),
      animationScenes: [{ id: `sc_${id}`, name: sceneName, trigger: { type: 'panelOpen' }, length, loop: true, clips }],
    });
    return panel;
  };
  return { add, label, clip, done };
}

/** A pattern on a control's background (or a part's), with these settings. */
function pattern(control, fields) {
  const background = control._children.Background;
  const { patch } = addPatternPatch(background, 'Background', fields);
  const key = Object.keys(patch)[0];
  if (key.endsWith('.Patterns')) background._children.Patterns = patch[key];
  else background._children.Patterns._children[key.split('.').pop()] = patch[key];
  return control;
}
const gradient = (control, angle, stops) => {
  Object.assign(control._children.Background._children.Fill, { solidEnabled: false, gradientEnabled: true,
    gradient: { type: 'linear', angle, stops: stops.map(([position, color]) => ({ position, color })) } });
  return control;
};
const picture = (control, src, fit = 'cover') => {
  Object.assign(control._children.Background._children.Fill, { imageEnabled: true, imageSrc: src, imageFit: fit });
  return control;
};
const glow = (control, colour, blur = 14) => {
  control._children.Effects._children.Shadows = { _type: 'Shadows', items: [{ enabled: true, type: 'outer-glow', offsetX: 0, offsetY: 0, blur, spread: 1, colour }] };
  return control;
};

// --- The films --------------------------------------------------------------------------------

function terminator() {
  const f = film('terminator', 'Terminator', { bg: 'FF05070A' });
  pattern(f.label('Grid', '', 0, 0, W, H), { src: 'builtin:grid', tint: 'FF16324A', opacity: 45, repeat: 'both', scale: 2.5, speed: 0 });
  pattern(f.label('Scan', '', 0, 0, W, H), { src: 'builtin:scanlines', tint: 'FFFF2A1A', opacity: 22, repeat: 'both', speed: 14, direction: 90 });
  glow(f.label('Title', 'TERMINATOR', 40, 110, 640, 100, { size: 76, colour: 'FFB9C2CC' }), 'AA6FA8FF', 18);
  glow(f.label('Eye', '', 340, 236, 40, 40, { fill: 'FF3A0505', radius: 20 }), 'FFFF2A1A', 22);
  f.label('Hud', 'TARGET ACQUIRED  ·  SCAN 100%', 160, 300, 400, 24, { size: 14, colour: 'FFFF3B30', family: 'JetBrains Mono', weight: 500 });
  // Letters stamped in one by one, a little large, barely scattered: forged, not typed.
  f.clip('Title', 'Text', 0, text('explode', 'in', { split: 'letter', order: 'forward', stagger: 90, duration: 320, scatter: 10, scale: 1.8 }), 1300);
  // A glint runs along the metal.
  f.clip('Title', 'Text', 1500, text('shimmer', 'in', { colour: 'FFFFFFFF', stagger: 45, duration: 500 }), 1000);
  // The eye ignites, then breathes.
  f.clip('Eye', 'Transform', 2400, frames([{ at: 0, scale: 0.6, opacity: 0, fill: 'FF3A0505' }, { at: 0.3, scale: 1.3, opacity: 1, fill: 'FFFF3020' }, { at: 1, scale: 1, fill: 'FFE01010' }], { easing: 'outQuad' }), 600);
  f.clip('Eye', 'Transform', 3000, frames([{ at: 0, scale: 1 }, { at: 0.5, scale: 1.14 }, { at: 1, scale: 1 }], { easing: 'inOutQuad', iterations: 4 }), 650);
  f.clip('Scan', 'Patterns.pattern1', 2600, fx('pattern:fadeIn'), 600);
  f.clip('Hud', 'Text', 2900, text('typewriter', 'in', { colour: 'FFFFFFFF', stagger: 45, duration: 300 }), 1600);
  for (const cname of ['Title', 'Hud']) f.clip(cname, 'Transform', 5700, fx('move:fadeOut'), 600);
  f.clip('Eye', 'Transform', 5700, fx('move:fadeOut'), 600);
  f.clip('Scan', 'Patterns.pattern1', 5700, fx('pattern:fadeOut'), 600);
  return f.done('Judgement', 6600);
}

const FIN = svg('<path d="M4 60 C 22 44 34 18 38 2 C 44 22 52 44 60 60 Z" fill="#3b4652"/><path d="M38 2 C 44 22 52 44 60 60 L 49 60 C 45 40 41 22 38 2 Z" fill="#26303a"/>', 64, 60);
function jaws() {
  const f = film('jaws', 'Jaws', { bg: 'FF041019' });
  gradient(f.label('Sky', '', 0, 0, W, 250), 180, [[0, '#01060c'], [100, '#0a2235']]);
  const sea = gradient(f.label('Sea', '', 0, 250, W, 155), 180, [[0, '#0b3350'], [100, '#020b14']]);
  pattern(sea, { src: 'builtin:sine', tint: 'FF2C6E9A', opacity: 70, repeat: 'both', speed: 24, direction: 180 });
  pattern(sea, { src: 'builtin:sine', tint: 'FF1B4F73', opacity: 80, repeat: 'both', speed: 14, direction: 180, scale: 1.6, offsetY: 10 });
  picture(f.label('Fin', '', 0, 200, 64, 60), FIN, 'contain');
  const title = f.label('Title', 'JAWS', 160, 108, 400, 150, { size: 124, colour: 'FFE8EEF2' });
  // The water in front of the letters' feet: a wave along the bottom of the title's own box.
  pattern(title, { src: 'builtin:sine', tint: 'FF2C6E9A', opacity: 100, repeat: 'x', align: 'end', place: 'front', scale: 1.4, speed: 40, direction: 180 });
  pattern(f.label('Crest', '', 0, 238, W, 26), { src: 'builtin:sine', tint: 'FF3F86B5', opacity: 95, repeat: 'x', speed: 50, direction: 180 });
  // The fin crosses along the waterline, bobbing, and dives.
  f.clip('Fin', 'Transform', 0, frames([{ at: 0, x: -80, y: 0 }, { at: 0.25, x: 140, y: -4 }, { at: 0.5, x: 330, y: 3 }, { at: 0.75, x: 520, y: -3 }, { at: 0.92, x: 610, y: 2, opacity: 1 }, { at: 1, x: 640, y: 40, opacity: 0 }]), 3000);
  // Two notes, closer and closer: the sea swells on each.
  const beats = [0, 0.18, 0.33, 0.46, 0.57, 0.66, 0.74, 0.8, 0.85, 0.89, 0.93, 0.96, 0.98];
  f.clip('Sea', 'Patterns.pattern1', 0, frames(beats.flatMap((at, i) => [{ at, scale: i % 2 ? 1 : 1.22, opacity: i % 2 ? 0.7 : 1 }]).concat([{ at: 1, scale: 1, opacity: 0.7 }])), 3000);
  // The letters surface one at a time, through the water at the foot of their box.
  f.clip('Title', 'Text', 3000, text('roll', 'in', { split: 'letter', order: 'random', stagger: 260, duration: 520, direction: 'up' }), 1700);
  f.clip('Title', 'Transform', 4700, frames([{ at: 0, y: 0 }, { at: 0.5, y: -3 }, { at: 1, y: 0 }], { easing: 'inOutQuad', iterations: 2 }), 900);
  // And go under again.
  f.clip('Title', 'Text', 6600, text('roll', 'out', { split: 'letter', order: 'random', stagger: 120, duration: 420, direction: 'down' }), 900);
  return f.done('Approach', 7600);
}

function shining() {
  const f = film('shining', 'The Shining', { bg: 'FF0D0907' });
  gradient(f.label('Wall', '', 0, 0, W, H), 180, [[0, '#2a1a12'], [100, '#0d0907']]);
  // The car behind the doors, lit.
  gradient(f.label('Car', '', 206, 66, 308, 278), 180, [[0, '#f6dfb0'], [60, '#c48a48'], [100, '#5a3418']]);
  for (const [cname, x] of [['LeftDoor', 206], ['RightDoor', 360]]) {
    const door = gradient(f.label(cname, '', x, 66, 154, 278), 90, [[0, '#5a3b22'], [50, '#7a5232'], [100, '#5a3b22']]);
    door._children.Background._children.Border = { ...(door._children.Background._children.Border ?? {}), enabled: true, thickness: 2, colour: 'FF3A2414' };
  }
  f.label('Word', 'WELCOME', 206, 170, 308, 70, { size: 44, colour: 'FFF2E6D0' });
  // The wall either side, in front of the doors, so they slide in behind it.
  gradient(f.label('WallLeft', '', 0, 0, 206, H), 180, [[0, '#2a1a12'], [100, '#0d0907']]);
  gradient(f.label('WallRight', '', 514, 0, 206, H), 180, [[0, '#2a1a12'], [100, '#0d0907']]);
  // A brass frame round the doorway.
  for (const [cname, x, y, w, h] of [['FrameTop', 200, 60, 320, 6], ['FrameBottom', 200, 344, 320, 6], ['FrameLeft', 200, 60, 6, 290], ['FrameRight', 514, 60, 6, 290]]) {
    gradient(f.label(cname, '', x, y, w, h), 135, [[0, '#7a5a26'], [50, '#d8b064'], [100, '#7a5a26']]);
  }
  f.label('Lamp', '▲', 340, 28, 40, 26, { size: 18, colour: 'FF6B4A20' });
  f.label('Red', '', 0, 0, W, H, { fill: 'FFA0000C' });
  // A hum in the doors.
  for (const cname of ['LeftDoor', 'RightDoor']) f.clip(cname, 'Transform', 0, frames([{ at: 0, x: 0 }, { at: 0.25, x: -1 }, { at: 0.5, x: 1 }, { at: 0.75, x: -1 }, { at: 1, x: 0 }], { iterations: 4 }), 300);
  // Ding.
  f.clip('Lamp', 'Transform', 1100, frames([{ at: 0, text: 'FFFFD27A', scale: 1.35 }, { at: 1, text: 'FFFFB347', scale: 1 }], { easing: 'outQuad' }), 400);
  // The doors part, and the word with them: Part, each half into the edge of its box.
  f.clip('LeftDoor', 'Transform', 1500, frames([{ at: 0, x: 0 }, { at: 1, x: -154 }], { easing: 'inOutCubic' }), 1400);
  f.clip('RightDoor', 'Transform', 1500, frames([{ at: 0, x: 0 }, { at: 1, x: 154 }], { easing: 'inOutCubic' }), 1400);
  f.clip('Word', 'Text', 1500, text('part', 'out', { duration: 2800, easing: 'inOutCubic' }), 2800);
  // And the red pours in from below.
  f.clip('Red', 'Transform', 2500, frames([{ at: 0, y: H, opacity: 0.96 }, { at: 1, y: 0, opacity: 0.96 }], { easing: 'inOutCubic' }), 1900);
  return f.done('Going up', 7000);
}

const FLAMES = svg('<path d="M0 22 C 6 18 4 10 10 4 C 10 12 16 14 14 22 Z M14 22 C 20 16 18 8 26 2 C 26 10 32 14 30 22 Z M30 22 C 34 18 34 12 38 8 C 40 14 46 16 44 22 Z" fill="#fff"/>', 48, 22);
function backToTheFuture() {
  const f = film('bttf', 'Back to the Future', { set: 'arc-line', bg: 'FF07060C' });
  gradient(f.label('Road', '', 0, 250, W, 155), 180, [[0, '#14121c'], [100, '#050409']]);
  f.add('Knob', 'Speed', 70, 55, 170, 170, { Behavior: { defaultCurrentValue: 0.95 } });
  f.label('Readout', '88', 290, 88, 250, 104, { size: 84, colour: 'FFFF6A1A', family: 'JetBrains Mono', fill: 'FF140804', radius: 6 });
  f.label('Mph', 'MPH', 552, 130, 90, 30, { size: 24, colour: 'FFFF6A1A', family: 'Barlow Semi Condensed' });
  for (const [cname, y] of [['TrailTop', 300], ['TrailBottom', 342]]) {
    const trail = f.label(cname, '', 0, y, W, 22);
    pattern(trail, { src: FLAMES, tint: 'FFFF7A1A', opacity: 100, repeat: 'x', speed: 260, direction: 180 });
    pattern(trail, { src: FLAMES, tint: 'FFFFD24A', opacity: 90, repeat: 'x', speed: 380, direction: 180, scale: 0.7, offsetX: 17 });
  }
  f.label('Flash', '', 0, 0, W, H, { fill: 'FFFFFFFF' });
  // The needle climbs, and the readout rolls up to 88 like an odometer.
  f.clip('Speed', 'Value', 0, fx('value:rise', { easing: 'inCubic' }), 2400);
  f.clip('Readout', 'Text', 0, text('reel', 'in', { spins: 14, stagger: 260, duration: 2100, glyphs: '0123456789', easing: 'outCubic' }), 2400);
  // A flash, and the car is gone: only its fire trails are left.
  f.clip('Flash', 'Transform', 2500, frames([{ at: 0, opacity: 0 }, { at: 0.15, opacity: 1 }, { at: 1, opacity: 0 }], { easing: 'outQuad' }), 800);
  for (const cname of ['Speed', 'Readout', 'Mph']) f.clip(cname, 'Transform', 2560, fx('move:fadeOut'), 200);
  for (const cname of ['TrailTop', 'TrailBottom']) {
    f.clip(cname, 'Transform', 2560, fx('move:fadeIn'), 300);
    f.clip(cname, 'Patterns.pattern1', 2900, fx('pattern:flicker', { iterations: 5 }), 500);
    f.clip(cname, 'Transform', 5600, fx('move:fadeOut'), 900);
  }
  return f.done('88', 7000);
}

/**
 * A tile of rain: ten columns of glyphs, each a trail of its own length at its own height, brightest
 * at its head and fading up behind it. White on nothing: a pattern's tile is its alpha, tinted.
 */
function rainTile(seed, glyphs) {
  let s = seed;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const cols = 10;
  const rows = 15;
  const cells = [];
  for (let c = 0; c < cols; c += 1) {
    const length = 5 + Math.floor(next() * 9);
    const head = Math.floor(next() * rows);
    for (let k = 0; k < length; k += 1) {
      const row = (head - k + rows) % rows;
      const opacity = (1 - (k / length) * 0.88).toFixed(2);
      const glyph = glyphs[Math.floor(next() * glyphs.length)].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      cells.push(`<text x="${c * 22 + 11}" y="${row * 22 + 17}" font-family="monospace" font-size="17" text-anchor="middle" fill="#fff" fill-opacity="${opacity}">${glyph}</text>`);
    }
  }
  return svg(cells.join(''), cols * 22, rows * 22);
}
function matrix() {
  const f = film('matrix', 'The Matrix', { bg: 'FF000000' });
  const layers = [['RainFar', 7, 'FF0F5F2A', 55, 0.8, 38], ['RainMid', 11, 'FF1FA84A', 75, 1, 70], ['RainNear', 13, 'FF7CFF9A', 85, 1.25, 120]];
  for (const [cname, seed, tint, opacity, scale, speed] of layers) {
    pattern(f.label(cname, '', 0, 0, W, H), { src: rainTile(seed, '01ABCDEFZ7#*+<>'), tint, opacity, repeat: 'both', scale, speed, direction: 90, offsetX: seed * 3 });
  }
  glow(f.label('Title', 'THE MATRIX', 80, 150, 560, 90, { size: 60, colour: 'FF9DFFB4', family: 'JetBrains Mono' }), 'CC1FA84A', 16);
  f.label('Caption', 'SYSTEM ONLINE', 80, 238, 560, 28, { size: 15, colour: 'FF4FD176', family: 'JetBrains Mono', weight: 500 });
  ['RainFar', 'RainMid', 'RainNear'].forEach((cname, i) => f.clip(cname, 'Patterns.pattern1', i * 200, fx('pattern:fadeIn'), 800));
  // The title decodes: each letter rolls through glyphs onto itself, in no particular order.
  f.clip('Title', 'Text', 600, text('reel', 'in', { spins: 10, stagger: 110, duration: 1100, order: 'random', glyphs: '01ABCDEFXZ#$%&*+=<>' }), 2300);
  f.clip('Title', 'Text', 3100, text('shimmer', 'in', { colour: 'FFFFFFFF', stagger: 50, duration: 500 }), 1000);
  f.clip('Caption', 'Text', 3400, text('typewriter', 'in', { stagger: 55, duration: 200 }), 1000);
  f.clip('RainNear', 'Patterns.pattern1', 3100, fx('pattern:pulse'), 600);
  // And scrambles away again.
  f.clip('Title', 'Text', 5400, text('reel', 'out', { spins: 6, stagger: 60, duration: 500, order: 'random', glyphs: '01ABCDEFXZ#$%&*+=<>' }), 1000);
  f.clip('Caption', 'Transform', 5400, fx('move:fadeOut'), 500);
  return f.done('Decode', 6600);
}

const SPIRAL = (() => {
  const points = [];
  for (let t = 0; t <= 18 * Math.PI; t += 0.12) points.push(`${(150 + Math.cos(t) * t * 2.6).toFixed(1)},${(150 + Math.sin(t) * t * 2.6).toFixed(1)}`);
  return svg(`<rect width="300" height="300" fill="#140a16"/><polyline points="${points.join(' ')}" fill="none" stroke="#e8323c" stroke-width="7"/><polyline points="${points.join(' ')}" fill="none" stroke="#f2e6d0" stroke-width="2"/>`, 300, 300);
})();
const RINGS = svg(Array.from({ length: 18 }, (_, i) => `<circle cx="200" cy="200" r="${12 + i * 11}" fill="none" stroke="#f2e6d0" stroke-opacity="${(0.05 + (i % 3) * 0.04).toFixed(2)}" stroke-width="3"/>`).join(''), 400, 400);
function vertigo() {
  const f = film('vertigo', 'Vertigo', { bg: 'FF0B0710' });
  picture(f.label('Rings', '', 160, 2, 400, 400, { radius: 200 }), RINGS);
  picture(f.label('Spiral', '', 210, 52, 300, 300, { radius: 150 }), SPIRAL);
  f.label('Title', 'VERTIGO', 0, 336, W, 56, { size: 44, colour: 'FFF2E6D0' });
  // The dolly zoom: the picture turns and pushes in while its frame pulls back.
  f.clip('Spiral', 'Transform', 0, frames([{ at: 0, spin: 0, zoom: 1, scale: 1.15 }, { at: 1, spin: 540, zoom: 2.4, scale: 0.8 }], { easing: 'inOutQuad' }), 5200);
  f.clip('Rings', 'Transform', 0, frames([{ at: 0, spin: 0, zoom: 1 }, { at: 1, spin: -360, zoom: 1.6 }]), 5200);
  f.clip('Title', 'Text', 1800, text('wipe', 'in', { duration: 900, direction: 'right' }), 900);
  f.clip('Title', 'Text', 4900, text('wipe', 'out', { duration: 700, direction: 'right' }), 700);
  return f.done('Dolly zoom', 6000);
}

function psycho() {
  const f = film('psycho', 'Psycho', { bg: 'FF000000' });
  const bars = [[70, 14], [110, 22], [158, 10], [262, 18], [300, 26], [350, 12]];
  bars.forEach(([y, h], i) => f.label(`Bar${i + 1}`, '', 0, y, W, h, { fill: i % 2 ? 'FFF2F2F2' : 'FFBDBDBD' }));
  f.label('Title', 'PSYCHO', 60, 160, 600, 96, { size: 88, colour: 'FFFFFFFF' });
  // The bars slash in from alternate sides, and on out the far side: two clips on one place each.
  bars.forEach((_, i) => {
    const side = i % 2 ? 1 : -1;
    f.clip(`Bar${i + 1}`, 'Transform', i * 150, frames([{ at: 0, x: side * 760 }, { at: 1, x: 0 }], { easing: 'inOutCubic' }), 600);
    f.clip(`Bar${i + 1}`, 'Transform', 3000 + i * 110, frames([{ at: 0, x: 0 }, { at: 1, x: -side * 760 }], { easing: 'inCubic' }), 500);
  });
  f.clip('Title', 'Text', 900, text('wipe', 'in', { duration: 700, direction: 'right' }), 700);
  f.clip('Title', 'Text', 3100, text('part', 'out', { duration: 700, easing: 'inCubic' }), 700);
  return f.done('Slash', 5200);
}

function missionImpossible() {
  const f = film('mission', 'Mission Impossible', { set: 'arc-line', bg: 'FF0A0D12' });
  f.label('Title', 'MISSION: IMPOSSIBLE', 0, 40, W, 70, { size: 44, colour: 'FFF2F5F8', family: 'Allerta Stencil', weight: 400 });
  f.label('Tag', 'THIS PANEL WILL SELF-DESTRUCT', 0, 110, W, 26, { size: 15, colour: 'FFFF5A4A', family: 'JetBrains Mono', weight: 500 });
  const knobs = Array.from({ length: 6 }, (_, i) => f.add('Knob', `K${i + 1}`, 40 + i * 110, 186, 86, 86, { Behavior: { defaultCurrentValue: 0.72 } }));
  f.label('Fuse', '', 20, 330, 680, 3, { fill: 'FF3A3F47' });
  glow(f.label('Spark', '', 12, 322, 18, 18, { fill: 'FFFFD36A', radius: 9 }), 'FFFF9A2A', 14);
  // The spark runs the fuse, spitting; each knob lights as it passes.
  f.clip('Spark', 'Transform', 0, frames([{ at: 0, x: 0 }, { at: 1, x: 670 }]), 3200);
  f.clip('Spark', 'Transform', 0, frames([{ at: 0, opacity: 1 }, { at: 0.3, opacity: 0.55 }, { at: 0.6, opacity: 1 }, { at: 0.8, opacity: 0.7 }, { at: 1, opacity: 1 }], { iterations: 16 }), 200);
  f.clip('Spark', 'Transform', 3200, frames([{ at: 0, scale: 1, opacity: 1 }, { at: 1, scale: 3, opacity: 0 }], { easing: 'outQuad' }), 350);
  knobs.forEach((knob, i) => {
    const passes = Math.round(((40 + i * 110 + 43 - 12) / 670) * 3200);
    f.clip(`K${i + 1}`, 'Value', passes, fx('value:reach'), 900);
    f.clip(`K${i + 1}`, 'Transform', passes, fx('move:pulse'), 500);
  });
  f.clip('Title', 'Text', 3300, text('typewriter', 'in', { colour: 'FFFF9A2A', stagger: 45, duration: 300 }), 1200);
  f.clip('Tag', 'Text', 4500, text('typewriter', 'in', { stagger: 40, duration: 200 }), 1400);
  for (const cname of ['Title', 'Tag']) f.clip(cname, 'Transform', 6300, fx('move:fadeOut'), 500);
  return f.done('Fuse', 6900);
}


// --- The second reel ------------------------------------------------------------------------------

/** A seeded run of numbers, so a picture draws the same every export. */
function seeded(seed) {
  let n = seed >>> 0;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}
function starTile(seed, count, rmin, rmax, w, h) {
  const next = seeded(seed);
  return svg(Array.from({ length: count }, () => `<circle cx="${(2 + next() * (w - 4)).toFixed(1)}" cy="${(2 + next() * (h - 4)).toFixed(1)}" r="${(rmin + next() * (rmax - rmin)).toFixed(2)}" fill="#fff"/>`).join(''), w, h);
}
const STARS_NEAR = starTile(3, 9, 1.0, 2.0, 190, 130);
const STARS_FAR = starTile(5, 12, 0.4, 0.9, 110, 80);
const RING = svg('<circle cx="50" cy="50" r="46" fill="none" stroke="#fff" stroke-width="3"/>', 100, 100);
/** A sky of stars that does not move: two tiles, near and far. */
function starSky(f, cname) {
  const sky = f.label(cname, '', 0, 0, W, H);
  pattern(sky, { src: STARS_FAR, tint: 'FFFFFFFF', opacity: 70, repeat: 'both', speed: 0 });
  pattern(sky, { src: STARS_NEAR, tint: 'FFFFFFFF', opacity: 95, repeat: 'both', speed: 0, offsetX: 37, offsetY: 21 });
  return sky;
}
const jitter = (amp, extra = {}) => frames([{ at: 0, x: 0, y: 0 }, { at: 0.2, x: -amp, y: amp / 2 }, { at: 0.4, x: amp, y: -amp / 2 }, { at: 0.6, x: -amp / 2, y: amp }, { at: 0.8, x: amp / 2, y: -amp / 2 }, { at: 1, x: 0, y: 0 }], extra);

function starWars() {
  const f = film('starwars', 'Star Wars');
  starSky(f, 'Sky');
  f.label('Before', 'Previously, in the Animation Designer....', 40, 180, 640, 40, { size: 22, colour: 'FF4BD5EE', family: 'Barlow', weight: 500 });
  f.label('Logo', 'STAR WARS', 40, 130, 640, 130, { size: 104, colour: 'FFFFE81F', spacing: 4 });
  const lines = ['Episode XI', 'THE PANELS AWAKEN', 'Nine effects were not enough.', 'From a forgotten branch the', 'designers forged two more:', 'PART, that opens words like', 'doors, and REEL, that rolls', 'every letter into place....'];
  lines.forEach((words, i) => f.label(`Line${i + 1}`, words, 110, 398, 500, 34, { size: i < 2 ? 26 : 22, colour: 'FFFFE81F', family: 'Barlow Semi Condensed', weight: i < 2 ? 700 : 500 }));
  f.clip('Before', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.2, opacity: 1 }, { at: 0.8, opacity: 1 }, { at: 1, opacity: 0 }]), 2800);
  // The title fills the screen and falls away into the stars.
  f.clip('Logo', 'Transform', 3000, frames([{ at: 0, scale: 2.8, opacity: 0 }, { at: 0.01, opacity: 1 }, { at: 0.85, opacity: 1 }, { at: 1, scale: 0.04, opacity: 0 }], { easing: 'outQuad' }), 6000);
  // A crawl with no tilt: each line rises and shrinks towards the middle, and the lines one after
  // another read as text sliding away into the distance.
  lines.forEach((_, i) => f.clip(`Line${i + 1}`, 'Transform', 4400 + (i + (i > 1 ? 1 : 0)) * 560, frames([{ at: 0, y: 0, scale: 1.2, opacity: 0 }, { at: 0.05, opacity: 1 }, { at: 0.72, opacity: 1 }, { at: 1, y: -330, scale: 0.28, opacity: 0 }]), 7200));
  return f.done('Crawl', 4400 + 8 * 560 + 7200 + 300);
}

const RAIN = (() => {
  const next = seeded(17);
  return svg(Array.from({ length: 16 }, () => {
    const x = next() * 120; const y = next() * 160;
    return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 4).toFixed(1)}" y2="${(y + 20).toFixed(1)}" stroke="#fff" stroke-width="1.2" stroke-opacity="${(0.35 + next() * 0.6).toFixed(2)}"/>`;
  }).join(''), 120, 160);
})();
const SKYLINE = (() => {
  const next = seeded(29);
  let x = 0; const parts = [];
  while (x < 720) {
    const w = 30 + next() * 60; const h = 60 + next() * 190; const y = 255 - h;
    parts.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${next() > 0.5 ? '#0b0d1a' : '#130f24'}"/>`);
    for (let wy = y + 8; wy < 250; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 9) {
      if (next() < 0.16) parts.push(`<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="4" height="5" fill="${next() > 0.3 ? '#ffb347' : '#4fe8ff'}" fill-opacity="0.7"/>`);
    }
    x += w + 2;
  }
  return svg(parts.join(''), 720, 255);
})();
function bladeRunner() {
  const f = film('bladerunner', 'Blade Runner', { bg: 'FF05060A' });
  gradient(f.label('Haze', '', 0, 0, W, H), 180, [[0, '#070a18'], [55, '#1a1030'], [100, '#2a0f1f']]);
  gradient(f.label('Beam', '', 0, 0, 220, H), 90, [[0, '#00000000'], [50, '#40bcd4ff'], [100, '#00000000']]);
  picture(f.label('City', '', 0, 150, W, 255), SKYLINE, 'cover');
  glow(f.label('Neon', 'BLADE RUNNER', 80, 56, 560, 84, { size: 58, colour: 'FFFF4FD8', family: 'Rubik', weight: 500, spacing: 2 }), 'FFFF4FD8', 22);
  glow(f.label('Noodles', 'NOODLES', 520, 196, 150, 40, { size: 22, colour: 'FF4FE8FF', family: 'Barlow Semi Condensed' }), 'FF4FE8FF', 14);
  pattern(f.label('Rain', '', 0, 0, W, H), { src: RAIN, tint: 'FF9FC3FF', opacity: 45, repeat: 'both', speed: 520, direction: 100 });
  pattern(f.label('RainNear', '', 0, 0, W, H), { src: RAIN, tint: 'FFC8DCFF', opacity: 60, repeat: 'both', speed: 820, direction: 102, scale: 1.6, offsetX: 40 });
  // The sign stutters into life, and now and then catches the other gas.
  f.clip('Neon', 'Transform', 300, frames([{ at: 0, opacity: 0 }, { at: 0.08, opacity: 1 }, { at: 0.14, opacity: 0.1 }, { at: 0.3, opacity: 1 }, { at: 0.36, opacity: 0.2 }, { at: 0.5, opacity: 0.95 }, { at: 1, opacity: 1 }]), 1400);
  f.clip('Neon', 'Text', 3300, text('shimmer', 'in', { colour: 'FF4FE8FF', stagger: 30, duration: 260 }), 800);
  f.clip('Noodles', 'Transform', 1700, frames([{ at: 0, opacity: 1 }, { at: 0.1, opacity: 0.15 }, { at: 0.2, opacity: 1 }, { at: 0.55, opacity: 1 }, { at: 0.6, opacity: 0.1 }, { at: 0.7, opacity: 0.9 }, { at: 1, opacity: 1 }], { iterations: 3 }), 1400);
  // A searchlight sweeps the haze.
  f.clip('Beam', 'Transform', 0, frames([{ at: 0, x: -220 }, { at: 0.5, x: 720 }, { at: 1, x: -220 }], { easing: 'inOutQuad' }), 6000);
  return f.done('Rain', 6000);
}

function tron() {
  const f = film('tron', 'Tron');
  gradient(f.label('Horizon', '', 0, 0, W, 190), 180, [[0, '#000000'], [100, '#04202a']]);
  pattern(gradient(f.label('Floor', '', 0, 190, W, 215), 180, [[0, '#021016'], [100, '#000000']]), { src: 'builtin:grid', tint: 'FF00E5FF', opacity: 38, repeat: 'both', scale: 2.4, speed: 90, direction: 90 });
  glow(f.label('Edge', '', 0, 188, W, 2, { fill: 'FF00E5FF' }), 'FF00E5FF', 10);
  // The trails are typed: box-drawing lines, a character at a time, as fast as each cycle rides.
  const trail = (cname, words, x, y, w, h, colour, extra = {}) => glow(f.label(cname, words, x, y, w, h, { size: 20, colour, family: 'JetBrains Mono', weight: 700, lineHeight: 1, ...extra }), colour, 10);
  trail('TrailBlue', '━'.repeat(50), 20, 248, 680, 24, 'FF00E5FF', { align: 'left' });
  trail('TrailOrange', '━'.repeat(33), 300, 308, 400, 24, 'FFFF8A1F', { align: 'right' });
  trail('TrailUp', '┃\n┃\n┃', 294, 262, 14, 60, 'FFFF8A1F');
  glow(f.label('CycleBlue', '', 6, 254, 28, 10, { fill: 'FFB8F6FF', radius: 5 }), 'FF00E5FF', 14);
  glow(f.label('CycleOrange', '', 686, 314, 28, 10, { fill: 'FFFFD3A0', radius: 5 }), 'FFFF8A1F', 14);
  f.label('Derez', '▪ ▪ ▪ ▪ ▪ ▪', 250, 250, 100, 30, { size: 16, colour: 'FFFF8A1F', family: 'JetBrains Mono' });
  glow(f.label('Title', 'TRON', 0, 60, W, 100, { size: 84, colour: 'FFB8F6FF', family: 'Rubik', weight: 500, spacing: 18 }), 'FF00E5FF', 18);
  f.clip('CycleBlue', 'Transform', 0, frames([{ at: 0, x: 0 }, { at: 1, x: 680 }]), 3000);
  f.clip('TrailBlue', 'Text', 0, text('typewriter', 'in', { stagger: 53, duration: 60 }), 3000);
  f.clip('CycleOrange', 'Transform', 0, frames([{ at: 0, x: 0, y: 0 }, { at: 0.78, x: -392, y: 0 }, { at: 1, x: -392, y: -58 }]), 2300);
  f.clip('TrailOrange', 'Text', 0, text('typewriter', 'in', { order: 'reverse', stagger: 55, duration: 60 }), 1800);
  f.clip('TrailUp', 'Text', 1800, text('typewriter', 'in', { order: 'reverse', stagger: 160, duration: 60 }), 500);
  // It rides into the blue wall: derezzed.
  f.clip('CycleOrange', 'Transform', 2300, frames([{ at: 0, scale: 1, opacity: 1 }, { at: 1, scale: 3, opacity: 0 }], { easing: 'outQuad' }), 300);
  f.clip('Derez', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.999, opacity: 0 }, { at: 1, opacity: 1 }]), 2300);
  f.clip('Derez', 'Text', 2300, text('explode', 'out', { scatter: 70, scale: 1.4, stagger: 10, duration: 700 }), 900);
  f.clip('Title', 'Text', 3100, text('wipe', 'in', { duration: 900 }), 900);
  for (const cname of ['TrailBlue', 'TrailOrange', 'TrailUp', 'CycleBlue']) f.clip(cname, 'Transform', 5400, fx('move:fadeOut'), 500);
  return f.done('Light cycles', 6200);
}

const FRONDS = (() => {
  const leaf = (x, y, angle, len) => `<path d="M0 0 Q ${len * 0.5} ${-len * 0.18} ${len} 0 Q ${len * 0.5} ${len * 0.18} 0 0 Z" fill="#173d1d" transform="translate(${x} ${y}) rotate(${angle})"/>`;
  const leaves = [];
  for (let i = 0; i < 9; i += 1) leaves.push(leaf(-10, 40 + i * 6, -40 + i * 11, 170 + (i % 3) * 30));
  for (let i = 0; i < 9; i += 1) leaves.push(leaf(730, 20 + i * 7, 220 - i * 11, 160 + (i % 3) * 35));
  return svg(leaves.join(''), 720, 405);
})();
function jurassic() {
  const f = film('jurassic', 'Jurassic Park', { bg: 'FF050805' });
  gradient(f.label('Jungle', '', 0, 0, W, H), 180, [[0, '#0b1a0e'], [100, '#020402']]);
  picture(f.label('Fronds', '', 0, 0, W, H), FRONDS, 'cover');
  gradient(f.label('Dash', '', 0, 300, W, 105), 180, [[0, '#1c1a16'], [100, '#0a0908']]);
  const cup = f.label('Cup', '', 300, 190, 120, 120, { radius: 60 });
  Object.assign(cup._children.Background._children.Fill, { solidEnabled: false, gradientEnabled: true, gradient: { type: 'radial', stops: [{ position: 0, color: '#6f8fa0' }, { position: 70, color: '#3a5868' }, { position: 100, color: '#cfd8dc' }] } });
  const thumps = [[500, 1.5], [1700, 3], [2900, 5], [4100, 9]];
  thumps.forEach((_, i) => picture(f.label(`Ripple${i + 1}`, '', 300, 190, 120, 120), RING, 'contain'));
  f.label('Title', 'JURASSIC PARK', 40, 44, 640, 80, { size: 58, colour: 'FFF2C14E', spacing: 2 });
  // Thumps, closer and harder: the water rings, and everything shakes a little more each time.
  thumps.forEach(([at, amp], i) => {
    f.clip(`Ripple${i + 1}`, 'Transform', at, frames([{ at: 0, scale: 0.15, opacity: 1 }, { at: 1, scale: 1.05, opacity: 0 }], { easing: 'outQuad' }), 900);
    for (const cname of ['Cup', 'Fronds', 'Dash']) f.clip(cname, 'Transform', at, jitter(amp), 320);
  });
  for (const [i, [at]] of thumps.entries()) f.clip(`Ripple${i + 1}`, 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 0 }]), Math.max(10, at - 10));
  // The roar.
  f.clip('Title', 'Text', 4300, text('explode', 'in', { scatter: 140, scale: 3.2, order: 'random', stagger: 25, duration: 620 }), 1000);
  f.clip('Title', 'Transform', 4300, jitter(6, { iterations: 2 }), 300);
  return f.done('Footsteps', 6600);
}

function encounters() {
  const f = film('encounters', 'Close Encounters', { bg: 'FF03050E' });
  gradient(f.label('Night', '', 0, 0, W, H), 180, [[0, '#03050e'], [100, '#121c38']]);
  const ship = f.label('Ship', '', 120, 10, 480, 170, { radius: 240 });
  Object.assign(ship._children.Background._children.Fill, { solidEnabled: false, gradientEnabled: true, gradient: { type: 'radial', stops: [{ position: 0, color: '#ffffff' }, { position: 25, color: '#bfd7ff' }, { position: 60, color: '#3a5aa8' }, { position: 100, color: '#03050e' }] } });
  const bulbs = 18;
  for (let i = 0; i < bulbs; i += 1) {
    const a = (i / bulbs) * Math.PI * 2;
    glow(f.label(`Bulb${i + 1}`, '', Math.round(360 + Math.cos(a) * 215 - 5), Math.round(95 + Math.sin(a) * 52 - 5), 10, 10, { fill: 'FFFFE9B0', radius: 5 }), 'FFFFD27A', 10);
  }
  const lamps = [['FFFFD23F', 'FF3A3010', 'D'], ['FFFF8C42', 'FF3A2010', 'E'], ['FFFF4F7B', 'FF3A1020', 'C'], ['FF9B5DE5', 'FF20103A', 'C'], ['FFE8F1FF', 'FF20283A', 'G']];
  lamps.forEach(([, dim, note], i) => {
    glow(f.label(`Lamp${i + 1}`, '', 140 + i * 96, 230, 72, 72, { fill: dim, radius: 36 }), 'AAFFFFFF', 8);
    f.label(`Note${i + 1}`, note, 140 + i * 96, 306, 72, 22, { size: 16, colour: 'FF8FA3C8', family: 'Barlow' });
  });
  f.label('Title', 'CLOSE ENCOUNTERS', 0, 350, W, 40, { size: 26, colour: 'FFE8F1FF', family: 'Barlow Semi Condensed', spacing: 6 });
  f.clip('Ship', 'Transform', 0, frames([{ at: 0, opacity: 0, scale: 0.9 }, { at: 1, opacity: 0.85, scale: 1 }], { easing: 'outQuad' }), 1600);
  // The lights chase round the ship.
  for (let i = 0; i < bulbs; i += 1) f.clip(`Bulb${i + 1}`, 'Transform', i * 70, frames([{ at: 0, opacity: 1, scale: 1.5 }, { at: 0.5, opacity: 0.25, scale: 1 }, { at: 1, opacity: 0.25, scale: 1 }], { iterations: 6 }), bulbs * 70);
  // Five notes, twice: re, mi, do, do an octave down, sol.
  const motif = [[0, 420], [500, 420], [1000, 420], [1500, 650], [2250, 1100]];
  [300, 4000].forEach((from) => motif.forEach(([at, len], i) => f.clip(`Lamp${i + 1}`, 'Transform', from + at, frames([{ at: 0, fill: lamps[i][1], scale: 1 }, { at: 0.06, fill: lamps[i][0], scale: 1.22 }, { at: 0.7, fill: lamps[i][0], scale: 1.05 }, { at: 1, fill: lamps[i][1], scale: 1 }], { easing: 'outQuad' }), len)));
  f.clip('Title', 'Text', 3600, text('crossfade', 'in', { split: 'letter', order: 'centre', stagger: 60, duration: 500 }), 1600);
  return f.done('Five notes', 7600);
}

const MAP = (() => {
  const blob = (d) => `<path d="${d}" fill="#d2b47e" stroke="#8a6a3a" stroke-width="1.5"/>`;
  const grid = Array.from({ length: 9 }, (_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="405" stroke="#b39463" stroke-opacity=".35"/>`).join('') + Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${i * 101}" x2="720" y2="${i * 101}" stroke="#b39463" stroke-opacity=".35"/>`).join('');
  return svg(`<rect width="720" height="405" fill="#ead8ad"/>${grid}`
    + blob('M40 120 C 80 80 170 90 210 140 C 230 200 180 260 130 280 C 80 300 30 240 40 120 Z')
    + blob('M260 90 C 330 60 420 80 450 130 C 470 180 420 220 380 230 C 330 240 280 200 260 160 Z')
    + blob('M330 250 C 370 240 420 270 410 320 C 400 370 350 380 330 350 C 310 320 300 270 330 250 Z')
    + blob('M500 110 C 580 90 680 120 690 190 C 700 260 640 300 570 290 C 510 280 480 220 490 170 Z')
    + '<circle cx="660" cy="350" r="30" fill="none" stroke="#8a6a3a" stroke-width="1.5"/><path d="M660 318 L 666 350 L 660 382 L 654 350 Z" fill="#8a6a3a"/>'
    + '<rect width="720" height="405" fill="none" stroke="#a07c48" stroke-width="10" stroke-opacity=".5"/>', 720, 405);
})();
const PLANE = svg('<path d="M2 15 L 40 13 L 48 6 L 52 6 L 50 13 L 58 13 C 62 13 62 17 58 17 L 50 17 L 52 24 L 48 24 L 40 17 L 2 15 Z M8 15 L 4 9 L 8 9 L 14 14 Z" fill="#3a2414"/>', 64, 30);
function indianaJones() {
  const f = film('indy', 'Indiana Jones', { bg: 'FFEAD8AD' });
  picture(f.label('Map', '', 0, 0, W, H), MAP, 'cover');
  const cities = [['Lisbon', 'LISBON', 110, 250], ['Cairo', 'CAIRO', 345, 160], ['Kathmandu', 'KATHMANDU', 600, 230]];
  for (const [cname, , x, y] of cities) f.label(cname, '', x - 6, y - 6, 12, 12, { fill: 'FF8A1C14', radius: 6 });
  for (const [cname, words, x, y] of cities) f.label(`${cname}Name`, words, x - 70, y + 10, 140, 22, { size: 14, colour: 'FF5A2E14', family: 'Libre Franklin', weight: 700, spacing: 2 });
  // A route is a line of dashes typed along a label turned to lie along it.
  const legs = [];
  cities.slice(1).forEach(([, , x2, y2], i) => {
    const [, , x1, y1] = cities[i];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const cname = `Route${i + 1}`;
    f.label(cname, '━'.repeat(Math.floor((len - 16) / 12)), Math.round((x1 + x2) / 2 - len / 2), Math.round((y1 + y2) / 2 - 11), Math.round(len), 22, { size: 20, colour: 'FFC0261C', family: 'JetBrains Mono', align: 'left', rotation: Math.round(angle * 10) / 10 });
    legs.push({ cname, x1, y1, x2, y2, chars: Math.floor((len - 16) / 12), angle });
  });
  picture(f.label('Plane', '', cities[0][2] - 32, cities[0][3] - 15, 64, 30), PLANE, 'contain');
  f.label('Title', 'INDIANA JONES', 0, 24, W, 70, { size: 52, colour: 'FF5A1E0E', family: 'Libre Franklin', weight: 700, spacing: 3 });
  let at = 400;
  const planeFrames = [];
  const total = 2200 * legs.length;
  legs.forEach((leg, i) => {
    f.clip(leg.cname, 'Text', at, text('typewriter', 'in', { stagger: Math.round(2000 / leg.chars), duration: 80 }), 2100);
    planeFrames.push({ at: (i * 2200) / total, x: leg.x1 - cities[0][2], y: leg.y1 - cities[0][3], rotate: leg.angle });
    f.clip(`${cities[i + 1][0]}Name`, 'Text', at + 2000, text('typewriter', 'in', { stagger: 40, duration: 150 }), 700);
    at += 2200;
  });
  const last = legs.at(-1);
  planeFrames.push({ at: 1, x: last.x2 - cities[0][2], y: last.y2 - cities[0][3], rotate: last.angle });
  f.clip('Plane', 'Transform', 400, frames(planeFrames), total);
  f.clip('LisbonName', 'Text', 100, text('typewriter', 'in', { stagger: 40, duration: 150 }), 600);
  f.clip('Title', 'Text', at + 100, text('roll', 'in', { split: 'letter', stagger: 45, duration: 380, direction: 'up' }), 1100);
  return f.done('By map', at + 2300);
}

function groundhogDay() {
  const f = film('groundhog', 'Groundhog Day', { bg: 'FF120D09' });
  gradient(f.label('Room', '', 0, 0, W, H), 180, [[0, '#2a1d14'], [100, '#0f0a07']]);
  gradient(f.label('Radio', '', 160, 110, 400, 190, { radius: 18 }), 180, [[0, '#7a4f2a'], [100, '#3e2614']]);
  f.label('Face', '', 186, 136, 256, 138, { fill: 'FF0B0B0B', radius: 8 });
  pattern(f.label('Grille', '', 456, 136, 80, 138, { fill: 'FF2A1A0E', radius: 8 }), { src: 'builtin:dots', tint: 'FF120A05', opacity: 100, repeat: 'both', speed: 0, scale: 0.7 });
  const digit = (cname, words, x) => f.label(cname, words, x, 150, 56, 110, { size: 92, colour: 'FFFF3B1F', family: 'JetBrains Mono', fill: 'FF160404', radius: 4 });
  digit('Hour', '6', 194);
  f.label('Colon', ':', 252, 150, 36, 110, { size: 80, colour: 'FFFF3B1F', family: 'JetBrains Mono' });
  digit('Tens', '0', 290);
  digit('Units', '0', 350);
  f.label('Am', 'AM', 410, 236, 28, 18, { size: 12, colour: 'FFFF3B1F', family: 'JetBrains Mono' });
  for (let i = 0; i < 3; i += 1) f.label(`Note${i + 1}`, '♪', 470 + i * 26, 92, 30, 36, { size: 28, colour: 'FFFFD27A' });
  f.label('Title', 'GROUNDHOG DAY', 0, 30, W, 50, { size: 34, colour: 'FFF2E6D0', spacing: 4 });
  f.label('Again', 'AGAIN.', 0, 320, W, 50, { size: 30, colour: 'FFFF6A4A', family: 'JetBrains Mono' });
  // 5:59 becomes 6:00: a reel of one spin through the digit that was there.
  f.clip('Hour', 'Text', 1800, text('reel', 'in', { spins: 1, glyphs: '5', duration: 320, easing: 'outQuad' }), 400);
  f.clip('Tens', 'Text', 1800, text('reel', 'in', { spins: 1, glyphs: '5', duration: 320, easing: 'outQuad' }), 400);
  f.clip('Units', 'Text', 1800, text('reel', 'in', { spins: 1, glyphs: '9', duration: 320, easing: 'outQuad' }), 400);
  f.clip('Colon', 'Transform', 0, frames([{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.2 }, { at: 1, opacity: 1 }], { iterations: 6 }), 1000);
  // The alarm: the radio jumps, the notes rise.
  for (const cname of ['Radio', 'Face', 'Grille', 'Hour', 'Colon', 'Tens', 'Units', 'Am']) f.clip(cname, 'Transform', 2200, jitter(3, { iterations: 6 }), 260);
  for (let i = 0; i < 3; i += 1) f.clip(`Note${i + 1}`, 'Transform', 2200 + i * 250, frames([{ at: 0, y: 30, opacity: 0 }, { at: 0.3, opacity: 1 }, { at: 1, y: -50, opacity: 0, rotate: i % 2 ? 20 : -20 }], { iterations: 3 }), 900);
  f.clip('Title', 'Text', 300, text('typewriter', 'in', { stagger: 50, duration: 200 }), 900);
  f.clip('Again', 'Text', 4600, text('typewriter', 'in', { stagger: 90, duration: 200 }), 700);
  return f.done('6:00', 6400);
}

const TRACKER = svg(`${[30, 60, 90, 120].map((r) => `<circle cx="125" cy="125" r="${r}" fill="none" stroke="#3cff7a" stroke-opacity=".55" stroke-width="1.5"/>`).join('')}<line x1="125" y1="0" x2="125" y2="250" stroke="#3cff7a" stroke-opacity=".35"/><line x1="0" y1="125" x2="250" y2="125" stroke="#3cff7a" stroke-opacity=".35"/>`, 250, 250);
const SWEEP = svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3cff7a" stop-opacity="0"/><stop offset="1" stop-color="#3cff7a" stop-opacity=".55"/></linearGradient></defs><path d="M125 125 L 245 125 A 120 120 0 0 0 210 40 Z" fill="url(#g)"/>', 250, 250);
function alien() {
  const f = film('alien', 'Alien', { bg: 'FF010402' });
  pattern(f.label('Scan', '', 0, 0, W, H), { src: 'builtin:scanlines', tint: 'FF1F7A3A', opacity: 28, repeat: 'both', speed: 10, direction: 90 });
  picture(f.label('Tracker', '', 50, 70, 250, 250, { fill: 'FF031208', radius: 125 }), TRACKER, 'contain');
  picture(f.label('Sweep', '', 50, 70, 250, 250), SWEEP, 'contain');
  picture(f.label('Ping', '', 50, 70, 250, 250), RING, 'contain');
  const blips = [[262, 98], [236, 132], [210, 160], [188, 182]];
  blips.forEach(([x, y], i) => glow(f.label(`Blip${i + 1}`, '', x - 7, y - 7, 14, 14, { fill: 'FF9CFFBC', radius: 7 }), 'FF3CFF7A', 12));
  f.label('Dist', '02 M', 50, 334, 250, 30, { size: 20, colour: 'FF3CFF7A', family: 'JetBrains Mono', weight: 500 });
  f.label('Title', 'ALIEN', 316, 150, 390, 110, { size: 84, colour: 'FFDDEFE3', spacing: 12 });
  f.clip('Sweep', 'Transform', 0, frames([{ at: 0, spin: 0 }, { at: 1, spin: 360 }], { iterations: 5 }), 1300);
  f.clip('Ping', 'Transform', 0, frames([{ at: 0, scale: 0.1, opacity: 0.9 }, { at: 1, scale: 1, opacity: 0 }], { easing: 'outQuad', iterations: 5 }), 1300);
  // Something is coming in: each blip closer than the last.
  blips.forEach((_, i) => f.clip(`Blip${i + 1}`, 'Transform', 500 + i * 1300, frames([{ at: 0, opacity: 0, scale: 0.5 }, { at: 0.12, opacity: 1, scale: 1.3 }, { at: 0.5, opacity: 0.5, scale: 1 }, { at: 1, opacity: 0 }]), 1300));
  f.clip('Dist', 'Text', 300, text('reel', 'in', { spins: 20, glyphs: '0123456789', stagger: 700, duration: 4200, easing: 'outCubic' }), 5000);
  // The title gathers a letter at a time, slowly, out of order.
  f.clip('Title', 'Text', 600, text('crossfade', 'in', { split: 'letter', order: 'random', stagger: 700, duration: 900 }), 3800);
  return f.done('Motion tracker', 6800);
}

const RAINBOW = svg(['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#3949ab', '#8e24aa'].map((c, i) => `<path d="M ${20 + i * 14} 300 A ${280 - i * 14} ${280 - i * 14} 0 0 1 ${580 - i * 14} 300" fill="none" stroke="${c}" stroke-width="14" stroke-opacity=".85"/>`).join(''), 600, 300);
const EMERALD = svg(`<defs><linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dffb0"/><stop offset="1" stop-color="#0b6b35"/></linearGradient></defs>${[[30, 60, 90], [70, 20, 130], [110, 0, 150], [150, 30, 120], [190, 70, 80], [60, 90, 60], [160, 100, 50]].map(([x, top, h]) => `<path d="M ${x} ${top + h + 20} L ${x} ${top + 20} L ${x + 14} ${top} L ${x + 28} ${top + 20} L ${x + 28} ${top + h + 20} Z" fill="url(#e)"/>`).join('')}`, 260, 170);
const BRICKS = svg('<path d="M0 0.5 H 40 M0 12.5 H 40 M0.5 0 V 12 M20.5 12 V 24 M0 24.5 H 40" stroke="#fff" stroke-width="1.5" fill="none"/>', 40, 24);
function wizardOfOz() {
  const f = film('oz', 'The Wizard of Oz', { bg: 'FF6EC6FF' });
  gradient(f.label('Sky', '', 0, 0, W, H), 180, [[0, '#4aa8f0'], [100, '#c8ecff']]);
  picture(f.label('Rainbow', '', 60, 30, 600, 300), RAINBOW, 'contain');
  picture(f.label('City', '', 430, 120, 260, 170), EMERALD, 'contain');
  gradient(f.label('Fields', '', 0, 285, W, 120), 180, [[0, '#4caf50'], [100, '#1b5e20']]);
  pattern(f.label('Road', '', 270, 285, 180, 120, { fill: 'FFF5C518' }), { src: BRICKS, tint: 'FFB8860B', opacity: 90, repeat: 'both', speed: 30, direction: 90 });
  glow(f.label('Title', 'THE WIZARD OF OZ', 0, 22, W, 60, { size: 40, colour: 'FF0B8A3A', spacing: 4 }), 'FFFFFFFF', 10);
  // Kansas: everything in brown, and a door.
  f.label('Sepia', '', 0, 0, W, H, { fill: 'FF8A6A42' });
  gradient(f.label('Door', '', 300, 90, 120, 230, { radius: 4 }), 90, [[0, '#4a3420'], [50, '#6a4c30'], [100, '#4a3420']]);
  f.label('Knob', '', 396, 200, 12, 12, { fill: 'FFC9A15A', radius: 6 });
  // The door swings, and the colour comes in through it.
  f.clip('Door', 'Transform', 900, frames([{ at: 0, x: 0, opacity: 1 }, { at: 1, x: -150, opacity: 0 }], { easing: 'inOutCubic' }), 1000);
  f.clip('Knob', 'Transform', 900, frames([{ at: 0, x: 0, opacity: 1 }, { at: 1, x: -150, opacity: 0 }], { easing: 'inOutCubic' }), 1000);
  f.clip('Sepia', 'Transform', 1500, frames([{ at: 0, opacity: 0.9 }, { at: 1, opacity: 0 }], { easing: 'inOutQuad' }), 1800);
  f.clip('Title', 'Text', 3300, text('shimmer', 'in', { colour: 'FFFFFFFF', stagger: 40, duration: 500 }), 1200);
  f.clip('City', 'Transform', 3300, frames([{ at: 0, scale: 1 }, { at: 0.5, scale: 1.05 }, { at: 1, scale: 1 }], { easing: 'inOutQuad', iterations: 2 }), 1200);
  return f.done('Over the rainbow', 6400);
}

function oceansEleven() {
  const f = film('oceans', "Ocean's Eleven", { bg: 'FF12040A' });
  gradient(f.label('Velvet', '', 0, 0, W, H), 180, [[0, '#3a0614'], [100, '#120208']]);
  // The marquee: forty bulbs round the edge, chasing.
  const bulbs = [];
  const perimeter = (t) => {
    const [x0, y0, w, h] = [30, 24, 660, 357];
    const d = t * 2 * (w + h);
    if (d < w) return [x0 + d, y0];
    if (d < w + h) return [x0 + w, y0 + d - w];
    if (d < 2 * w + h) return [x0 + w - (d - w - h), y0 + h];
    return [x0, y0 + h - (d - 2 * w - h)];
  };
  for (let i = 0; i < 40; i += 1) {
    const [x, y] = perimeter(i / 40);
    bulbs.push(glow(f.label(`Bulb${i + 1}`, '', Math.round(x - 6), Math.round(y - 6), 12, 12, { fill: 'FFFFE08A', radius: 6 }), 'FFFFC44A', 10));
  }
  f.label('Window', '', 180, 110, 360, 150, { fill: 'FFF4EEE2', radius: 12 });
  for (let i = 0; i < 3; i += 1) f.label(`Reel${i + 1}`, '7', 196 + i * 112, 122, 104, 126, { size: 96, colour: 'FFD62828', family: 'Rubik', weight: 700, fill: 'FFFFFFFF', radius: 6 });
  glow(f.label('Jackpot', 'JACKPOT', 0, 50, W, 54, { size: 44, colour: 'FFFFD24A', family: 'Rubik', weight: 700, spacing: 6 }), 'FFFF9A2A', 16);
  f.label('Title', "OCEAN'S ELEVEN", 0, 290, W, 54, { size: 36, colour: 'FFF4EEE2', family: 'Barlow Semi Condensed', spacing: 8 });
  for (let i = 0; i < 40; i += 1) f.clip(`Bulb${i + 1}`, 'Transform', i * 30, frames([{ at: 0, opacity: 1, scale: 1.3 }, { at: 0.3, opacity: 0.3, scale: 1 }, { at: 1, opacity: 0.3, scale: 1 }], { iterations: 6 }), 1200);
  // Three reels, each stopping later than the last, on sevens.
  for (let i = 0; i < 3; i += 1) f.clip(`Reel${i + 1}`, 'Text', 300, text('reel', 'in', { spins: 18, glyphs: '7$★♦♣♠♥€', duration: 1500 + i * 650, easing: 'outCubic' }), 1600 + i * 650);
  f.clip('Window', 'Transform', 3000, frames([{ at: 0, fill: 'FFFFF6B0', scale: 1.04 }, { at: 1, scale: 1 }], { easing: 'outQuad', iterations: 3 }), 300);
  f.clip('Jackpot', 'Text', 3000, text('explode', 'in', { scatter: 120, scale: 2.6, stagger: 30, duration: 520 }), 800);
  f.clip('Title', 'Text', 4200, text('typewriter', 'in', { stagger: 60, duration: 200 }), 1100);
  return f.done('Jackpot', 7200);
}

function spaceOdyssey() {
  const f = film('odyssey', '2001 A Space Odyssey');
  starSky(f, 'Sky');
  const disc = (cname, x, y, size, stops) => {
    const c = f.label(cname, '', x, y, size, size, { radius: size / 2 });
    Object.assign(c._children.Background._children.Fill, { solidEnabled: false, gradientEnabled: true, gradient: { type: 'radial', centerX: 50, centerY: 30, stops: stops.map(([position, color]) => ({ position, color })) } });
    return c;
  };
  const sun = disc('Sun', 300, 150, 120, [[0, '#ffffff'], [18, '#fff6d8'], [40, '#88FFB84A'], [100, '#00FF6A00']]);
  glow(sun, 'FFFFE0A0', 30);
  disc('Earth', 210, 200, 300, [[0, '#9fd3ff'], [45, '#1e5fa8'], [80, '#0a1a3a'], [100, '#020611']]);
  disc('Moon', -140, 290, 1000, [[0, '#9a9a9a'], [12, '#3c3c3c'], [40, '#141414'], [100, '#050505']]);
  f.label('Title', '2001 : A SPACE ODYSSEY', 0, 36, W, 50, { size: 26, colour: 'FFE8EEF5', weight: 300, spacing: 12 });
  // The alignment: the earth climbs over the moon, and the sun over the earth.
  f.clip('Earth', 'Transform', 0, frames([{ at: 0, y: 140 }, { at: 1, y: 0 }], { easing: 'outCubic' }), 3600);
  f.clip('Sun', 'Transform', 1600, frames([{ at: 0, y: 150, scale: 0.6, opacity: 0 }, { at: 0.2, opacity: 1 }, { at: 1, y: -40, scale: 1.25, opacity: 1 }], { easing: 'outCubic' }), 3400);
  f.clip('Title', 'Text', 4400, text('crossfade', 'in', { split: 'letter', order: 'centre', stagger: 50, duration: 900 }), 1700);
  return f.done('Sunrise', 7000);
}

const BUS = svg('<rect x="4" y="6" width="150" height="54" rx="8" fill="#f2b705"/><rect x="4" y="44" width="150" height="6" fill="#1a1a1a"/>'
  + [14, 44, 74, 104].map((x) => `<rect x="${x}" y="14" width="24" height="20" rx="2" fill="#2a3a48"/>`).join('')
  + '<rect x="132" y="14" width="18" height="26" rx="2" fill="#2a3a48"/><circle cx="34" cy="60" r="10" fill="#111"/><circle cx="124" cy="60" r="10" fill="#111"/><circle cx="34" cy="60" r="4" fill="#888"/><circle cx="124" cy="60" r="4" fill="#888"/>', 160, 72);
const LANES = svg('<rect x="0" y="18" width="40" height="5" fill="#f4f1e8"/>', 80, 40);
function speed() {
  const f = film('speed', 'Speed', { bg: 'FF0E1116' });
  gradient(f.label('Sky', '', 0, 0, W, 250), 180, [[0, '#6a8fb8'], [100, '#d9c7a0']]);
  pattern(gradient(f.label('Road', '', 0, 250, W, 155), 180, [[0, '#3a3d42'], [100, '#1a1c20']]), { src: LANES, tint: 'FFF4F1E8', opacity: 90, repeat: 'x', speed: 900, direction: 180, offsetY: 50 });
  picture(f.label('Bus', '', 40, 196, 160, 72), BUS, 'contain');
  f.label('Dash', '', 400, 34, 290, 290, { fill: 'FF101216', radius: 145 });
  const knob = f.add('Knob', 'Speedometer', 425, 59, 240, 240, { Behavior: { defaultValue: 0.6 } });
  knob._children.Core.formShowValue = true;
  f.label('Fifty', '50', 525, 36, 40, 20, { size: 14, colour: 'FFFF4A3A', family: 'JetBrains Mono', weight: 700 });
  f.label('Mph', 'MPH', 495, 236, 100, 20, { size: 13, colour: 'FF9AA3AE', family: 'JetBrains Mono', weight: 500 });
  glow(f.label('Rule', 'STAY ABOVE 50', 40, 40, 330, 40, { size: 26, colour: 'FFFF4A3A', family: 'JetBrains Mono', align: 'left' }), 'FFFF3B30', 12);
  f.label('Title', 'SPEED', 40, 300, 330, 80, { size: 64, colour: 'FFF2B705', align: 'left', spacing: 6 });
  // The needle has to stay over fifty: up, down to the line, up again, and once, nearly not.
  f.clip('Speedometer', 'Value', 300, { kind: 'value', easing: 'inOutCubic', frames: [{ at: 0, value: 0 }, { at: 0.18, value: 0.68 }, { at: 0.32, value: 0.56 }, { at: 0.46, value: 0.72 }, { at: 0.62, value: 0.515 }, { at: 0.72, value: 0.52 }, { at: 0.86, value: 0.66 }, { at: 1 }] }, 5600);
  // The rule shouts when the needle gets close to the line.
  f.clip('Rule', 'Text', 300, text('typewriter', 'in', { stagger: 40, duration: 120 }), 700);
  f.clip('Rule', 'Transform', 3600, frames([{ at: 0, opacity: 1, scale: 1 }, { at: 0.5, opacity: 0.2, scale: 1.08 }, { at: 1, opacity: 1, scale: 1 }], { iterations: 4 }), 260);
  for (const cname of ['Bus', 'Dash', 'Speedometer', 'Mph']) f.clip(cname, 'Transform', 3600, jitter(2, { iterations: 4 }), 260);
  f.clip('Bus', 'Transform', 0, frames([{ at: 0, x: -220 }, { at: 0.3, x: 0 }, { at: 1, x: 10 }], { easing: 'outCubic' }), 1600);
  f.clip('Title', 'Text', 4600, text('push', 'in', { duration: 360, direction: 'right' }), 400);
  f.clip('Title', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.999, opacity: 0 }, { at: 1, opacity: 1 }]), 4600);
  return f.done('Over fifty', 6600);
}

const TOP = svg('<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a5058"/><stop offset=".45" stop-color="#e8edf2"/><stop offset="1" stop-color="#3a4048"/></linearGradient></defs><rect x="27" y="0" width="6" height="22" rx="2" fill="url(#t)"/><path d="M4 30 C 4 22 56 22 56 30 L 30 78 Z" fill="url(#t)"/><ellipse cx="30" cy="30" rx="26" ry="7" fill="url(#t)"/>', 60, 80);
const FRAME = svg('<rect x="2" y="2" width="96" height="56" fill="none" stroke="#fff" stroke-width="2"/>', 100, 60);
function inception() {
  const f = film('inception', 'Inception', { bg: 'FF0C0F14' });
  for (let i = 0; i < 4; i += 1) picture(f.label(`Dream${i + 1}`, '', 160, 80, 400, 240), FRAME, 'contain');
  gradient(f.label('Table', '', 0, 300, W, 105), 180, [[0, '#2a2620'], [100, '#0c0a08']]);
  const top = picture(f.label('Top', '', 330, 222, 60, 80), TOP, 'contain');
  pattern(top, { src: 'builtin:stripes', tint: 'FF0C0F14', opacity: 30, repeat: 'both', speed: 400, direction: 0, place: 'front' });
  f.label('Title', 'INCEPTION', 0, 30, W, 60, { size: 40, colour: 'FFDDE3EA', weight: 300, spacing: 16 });
  f.label('Cut', '', 0, 0, W, H, { fill: 'FF000000' });
  // A dream within a dream: frames falling away, one after another.
  for (let i = 0; i < 4; i += 1) f.clip(`Dream${i + 1}`, 'Transform', i * 650, frames([{ at: 0, scale: 0.15, opacity: 0 }, { at: 0.2, opacity: 0.6 }, { at: 1, scale: 2.2, opacity: 0 }], { easing: 'inQuad', iterations: 3 }), 2600);
  // The top spins and wobbles, and the panel cuts away before it falls, or doesn't.
  f.clip('Top', 'Transform', 0, frames([{ at: 0, rotate: -3, x: 0 }, { at: 0.25, rotate: 4, x: 3 }, { at: 0.5, rotate: -5, x: 0 }, { at: 0.75, rotate: 6, x: -3 }, { at: 1, rotate: -3, x: 0 }], { easing: 'inOutQuad', iterations: 7 }), 840);
  f.clip('Title', 'Text', 1200, text('wipe', 'in', { duration: 1200 }), 1200);
  f.clip('Cut', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.97, opacity: 0 }, { at: 0.98, opacity: 1 }, { at: 1, opacity: 1 }]), 6200);
  return f.done('Still spinning', 6800);
}

const JET = svg('<path d="M2 20 L 30 16 L 42 4 L 48 4 L 44 16 L 70 17 L 78 20 L 70 23 L 44 24 L 48 36 L 42 36 L 30 24 Z" fill="#1a1208"/>', 80, 40);
const TARGET = svg('<g fill="none" stroke="#5cff8a" stroke-width="3"><path d="M2 14 V2 H14 M46 2 H58 V14 M58 46 V58 H46 M14 58 H2 V46"/></g>', 60, 60);
function topGun() {
  const f = film('topgun', 'Top Gun', { bg: 'FF1B0F08' });
  gradient(f.label('Sky', '', 0, 0, W, H), 180, [[0, '#2a1440'], [55, '#d8582a'], [100, '#ffb347']]);
  gradient(f.label('Sea', '', 0, 300, W, 105), 180, [[0, '#3a2030'], [100, '#120810']]);
  glow(f.label('Horizon', '', -120, 230, 960, 3, { fill: 'FF5CFF8A' }), 'FF5CFF8A', 6);
  for (const [cname, y] of [['PitchUp', 170], ['PitchDown', 290]]) f.label(cname, '— — —     — — —', 160, y, 400, 20, { size: 16, colour: 'FF5CFF8A', family: 'JetBrains Mono' });
  picture(f.label('Jet', '', 520, 120, 80, 40), JET, 'contain');
  picture(f.label('Target', '', 530, 110, 60, 60), TARGET, 'contain');
  f.label('BracketL', '[', 480, 100, 40, 80, { size: 72, colour: 'FF5CFF8A', family: 'JetBrains Mono' });
  f.label('BracketR', ']', 600, 100, 40, 80, { size: 72, colour: 'FF5CFF8A', family: 'JetBrains Mono' });
  glow(f.label('Lock', 'LOCK', 500, 182, 120, 30, { size: 22, colour: 'FFFF5A4A', family: 'JetBrains Mono', weight: 700 }), 'FFFF3B30', 10);
  f.label('Hud', 'SPD 540   ALT 12000   G 4.2', 20, 20, 400, 22, { size: 14, colour: 'FF5CFF8A', family: 'JetBrains Mono', weight: 500, align: 'left' });
  f.label('Title', 'TOP GUN', 0, 330, W, 60, { size: 46, colour: 'FFFFF4E0', spacing: 10 });
  // Banking: the horizon and the ladder tilt.
  for (const cname of ['Horizon', 'PitchUp', 'PitchDown']) f.clip(cname, 'Transform', 0, frames([{ at: 0, rotate: 0 }, { at: 0.4, rotate: -9 }, { at: 1, rotate: 0 }], { easing: 'inOutQuad' }), 5200);
  // The bandit drifts; the box follows; the brackets close on it.
  for (const cname of ['Jet', 'Target']) f.clip(cname, 'Transform', 0, frames([{ at: 0, x: 120, y: 40 }, { at: 1, x: 0, y: 0 }], { easing: 'outCubic' }), 2000);
  f.clip('BracketL', 'Transform', 1600, frames([{ at: 0, x: -320, opacity: 0 }, { at: 0.2, opacity: 1 }, { at: 1, x: 0 }], { easing: 'outCubic' }), 900);
  f.clip('BracketR', 'Transform', 1600, frames([{ at: 0, x: 120, opacity: 0 }, { at: 0.2, opacity: 1 }, { at: 1, x: 0 }], { easing: 'outCubic' }), 900);
  f.clip('Lock', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 0 }]), 2500);
  f.clip('Lock', 'Transform', 2500, frames([{ at: 0, opacity: 1 }, { at: 0.5, opacity: 0.1 }, { at: 1, opacity: 1 }], { iterations: 6 }), 300);
  f.clip('Target', 'Transform', 2500, frames([{ at: 0, scale: 1.4 }, { at: 1, scale: 1 }], { easing: 'outQuad' }), 300);
  f.clip('Title', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 0.999, opacity: 0 }, { at: 1, opacity: 1 }]), 4000);
  f.clip('Title', 'Text', 4000, text('push', 'in', { duration: 420, direction: 'right' }), 500);
  return f.done('Lock', 6000);
}

/** Every film, in festival order, each as the panel the editor opens. */
export const FILMS = Object.freeze([
  ['terminator', terminator], ['jaws', jaws], ['shining', shining], ['bttf', backToTheFuture],
  ['matrix', matrix], ['vertigo', vertigo], ['psycho', psycho], ['mission', missionImpossible],
  ['starwars', starWars], ['bladerunner', bladeRunner], ['tron', tron], ['jurassic', jurassic],
  ['encounters', encounters], ['indy', indianaJones], ['groundhog', groundhogDay], ['alien', alien],
  ['oz', wizardOfOz], ['oceans', oceansEleven], ['odyssey', spaceOdyssey], ['speed', speed],
  ['inception', inception], ['topgun', topGun],
]);

export function filmPanel(id) {
  const entry = FILMS.find(([key]) => key === id);
  return entry ? entry[1]() : null;
}
