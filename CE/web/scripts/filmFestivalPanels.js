// filmFestivalPanels.js — the Film Festival: eight small panels, each a homage to a film's title
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
  const label = (cname, words, x, y, w, h, { size = 14, colour = 'FFFFFFFF', family = 'Space Grotesk', weight = 700, fill = null, radius = 0, align = null } = {}) => {
    const control = add('Label', cname, x, y, w, h, {
      Text: { content: words, _children: { Font: { family, size, weight: weight >= 700 ? 'Bold' : weight >= 500 ? 'Medium' : 'Regular', weightValue: weight }, Fill: { colour } } },
    });
    const bgc = control._children.Background._children;
    bgc.Fill = { ...bgc.Fill, colour: fill ?? '00000000' };
    bgc.Border = { ...(bgc.Border ?? {}), enabled: false };
    bgc.Corners = { ...(bgc.Corners ?? {}), radius };
    if (align) control._children.Text.justification = align;
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

/** Every film, in festival order, each as the panel the editor opens. */
export const FILMS = Object.freeze([
  ['terminator', terminator], ['jaws', jaws], ['shining', shining], ['bttf', backToTheFuture],
  ['matrix', matrix], ['vertigo', vertigo], ['psycho', psycho], ['mission', missionImpossible],
]);

export function filmPanel(id) {
  const entry = FILMS.find(([key]) => key === id);
  return entry ? entry[1]() : null;
}
