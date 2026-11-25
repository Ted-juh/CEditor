// galleryPanels.js — the Gallery: seven panels, each in the manner of an art movement, set moving.
// Every composition here is made for these panels, in the movement's manner, and is not any
// particular work. Written to CE/panels/Gallery/ by export-showcases.mjs, and played for the demo
// recordings straight from here.
//
//   Bauhaus          primary shapes flying in, settling into one composition, then into another
//   Primary Grid     black lines drawn across a white field, cells filling with red, yellow and blue
//   Op Art           two fields of rings, one circling over the other: the moiré moves (pattern clips
//                    pulse a band of stripes)
//   Pointillism      a landscape painted in dots, layer by layer, the dots shrinking as each lands
//   Art Deco         a gold sunburst, lines drawn in from the middle, a title catching the light
//   Kinetic Mobile   three hanging arms swinging, each a beat behind the one before
//   Constructivism   diagonal bands slamming in, a circle, a word set at an angle

import {
  W, H, svg, frames, text, panelMaker, GALLERY_KIND, pattern, patternNames, gradient, radial, picture, glow, seeded,
} from './festivalKit.js';

const gallery = (id, name, options = {}) => panelMaker(id, name, { ...options, kind: GALLERY_KIND });

// --- Bauhaus ------------------------------------------------------------------------------------

const TRIANGLE = (colour) => svg(`<path d="M85 4 L 166 146 L 4 146 Z" fill="${colour}"/>`, 170, 150);
const HALF = (colour) => svg(`<path d="M2 60 A 58 58 0 0 1 118 60 Z" fill="${colour}"/>`, 120, 62);
function bauhaus() {
  const f = gallery('bauhaus', 'Bauhaus', { bg: 'FFF2ECE0' });
  // Where each shape sits in the first composition, where it goes in the second, and where it flies
  // in from: [name, x, y, w, h, kind, colour, [dx, dy, rotate] second, [dx, dy] entry].
  const shapes = [
    ['Circle', 80, 70, 170, 170, 'round', 'FFD62828', [330, 40, 0], [-420, -80]],
    ['Square', 290, 170, 130, 130, 'box', 'FF1E4FA8', [-150, -20, 45], [0, 420]],
    ['Triangle', 460, 40, 170, 150, 'triangle', '#F2C230', [-180, 10, 180], [420, -60]],
    ['Bar', 60, 320, 320, 22, 'box', 'FF141414', [300, -10, -20], [-560, 0]],
    ['Half', 520, 250, 120, 62, 'half', '#141414', [-430, -190, 90], [300, 300]],
    ['Dot', 250, 60, 50, 50, 'round', 'FF1E4FA8', [340, 250, 0], [0, -300]],
  ];
  for (const [cname, x, y, w, h, kind, colour] of shapes) {
    if (kind === 'triangle') picture(f.label(cname, '', x, y, w, h), TRIANGLE(colour), 'contain');
    else if (kind === 'half') picture(f.label(cname, '', x, y, w, h), HALF(colour), 'contain');
    else f.label(cname, '', x, y, w, h, { fill: colour, radius: kind === 'round' ? w / 2 : 0 });
  }
  f.label('Title', 'BAUHAUS', 560, 178, 260, 44, { size: 34, colour: 'FF141414', family: 'Space Grotesk', weight: 700, spacing: 6, rotation: 90 });
  // In from the edges, settled; across to the second composition; back, and out again.
  const length = 7200;
  shapes.forEach(([cname, , , , , , , [bx, by, br], [ex, ey]], i) => {
    const t = (ms) => ms / length;
    f.clip(cname, 'Transform', 0, frames([
      { at: 0, x: ex, y: ey, rotate: -30 }, { at: t(700 + i * 90), x: ex, y: ey, rotate: -30 }, { at: t(1500 + i * 90), x: 0, y: 0, rotate: 0 },
      { at: t(2800), x: 0, y: 0, rotate: 0 }, { at: t(3800), x: bx, y: by, rotate: br }, { at: t(5200), x: bx, y: by, rotate: br },
      { at: t(6200), x: 0, y: 0, rotate: 0 }, { at: t(6700 + i * 60), x: 0, y: 0, rotate: 0 }, { at: 1, x: ex, y: ey, rotate: -30 },
    ], { easing: 'inOutCubic' }), length);
  });
  f.clip('Title', 'Text', 1500, text('typewriter', 'in', { stagger: 80, duration: 160 }), 800);
  return f.done('Composition', length);
}

// --- Primary Grid -------------------------------------------------------------------------------

function primaryGrid() {
  const f = gallery('primarygrid', 'Primary Grid', { bg: 'FFF7F4EC' });
  const xs = [0, 150, 410, 560, W];
  const ys = [0, 120, 290, H];
  const cells = [];
  for (let r = 0; r < ys.length - 1; r += 1) {
    for (let c = 0; c < xs.length - 1; c += 1) {
      const cname = `Cell${r + 1}_${c + 1}`;
      f.label(cname, '', xs[c], ys[r], xs[c + 1] - xs[c], ys[r + 1] - ys[r], { fill: 'FFF7F4EC' });
      cells.push(cname);
    }
  }
  const lineW = 10;
  xs.slice(1, -1).forEach((x, i) => f.label(`Vertical${i + 1}`, '', x - lineW / 2, 0, lineW, H, { fill: 'FF141414' }));
  ys.slice(1, -1).forEach((y, i) => f.label(`Horizontal${i + 1}`, '', 0, y - lineW / 2, W, lineW, { fill: 'FF141414' }));
  f.label('Title', 'PRIMARY GRID', 418, 300, 136, 98, { size: 18, colour: 'FF141414', lineHeight: 1.1 });
  // The lines drawn out from their middles; then the colours come, wander, and go.
  const length = 7600;
  [...xs.slice(1, -1).map((_, i) => `Vertical${i + 1}`), ...ys.slice(1, -1).map((_, i) => `Horizontal${i + 1}`)].forEach((cname, i) => {
    f.clip(cname, 'Transform', 0, frames([{ at: 0, scale: 0 }, { at: (150 + i * 180) / length, scale: 0 }, { at: (650 + i * 180) / length, scale: 1 }, { at: (6900) / length, scale: 1 }, { at: 1, scale: 0 }], { easing: 'outCubic' }), length);
  });
  // [cell, colour, from, to]: a colour held in a cell for a while.
  const paint = [
    ['Cell1_1', 'FFD62828', 1400, 4000], ['Cell3_4', 'FF1E4FA8', 1700, 5600], ['Cell2_3', 'FFF2C230', 2000, 3800],
    ['Cell1_4', 'FFF2C230', 3800, 6400], ['Cell3_1', 'FFD62828', 4000, 6600], ['Cell2_2', 'FF1E4FA8', 4300, 6800], ['Cell3_2', 'FF141414', 2300, 5000],
  ];
  for (const [cname, colour, from, to] of paint) {
    f.clip(cname, 'Transform', 0, frames([
      { at: 0, fill: 'FFF7F4EC' }, { at: from / length, fill: 'FFF7F4EC' }, { at: (from + 260) / length, fill: colour },
      { at: to / length, fill: colour }, { at: (to + 260) / length, fill: 'FFF7F4EC' }, { at: 1, fill: 'FFF7F4EC' },
    ], { easing: 'inOutQuad' }), length);
  }
  f.clip('Title', 'Text', 900, text('crossfade', 'in', { split: 'letter', stagger: 40, duration: 400 }), 1100);
  return f.done('Balance', length);
}

// --- Op Art -------------------------------------------------------------------------------------

const RINGS = svg(Array.from({ length: 34 }, (_, i) => `<circle cx="450" cy="450" r="${8 + i * 13}" fill="none" stroke="#111" stroke-width="5"/>`).join(''), 900, 900);
function opArt() {
  const f = gallery('opart', 'Op Art', { bg: 'FFF4F4F0' });
  picture(f.label('RingsStill', '', -90, -248, 900, 900), RINGS, 'contain');
  picture(f.label('RingsMoving', '', -90, -248, 900, 900), RINGS, 'contain');
  const band = f.label('Band', '', 0, 330, W, 75, { fill: 'FFF4F4F0' });
  pattern(band, { src: 'builtin:stripes', tint: 'FF111111', opacity: 100, repeat: 'both', scale: 1.4, speed: 0 });
  pattern(band, { src: 'builtin:stripes', tint: 'FF111111', opacity: 100, repeat: 'both', scale: 1.4, speed: 0, flipX: true });
  const [stripes, crossed] = patternNames(band);
  f.label('Title', 'OP ART', 250, 150, 220, 56, { size: 40, colour: 'FF111111', fill: 'FFF4F4F0', spacing: 10 });
  // One field of rings circles over the other, and the interference moves; the crossed stripes
  // below are drawn apart and back together on the timeline (pattern clips).
  const length = 6000;
  const orbit = [];
  for (let k = 0; k <= 12; k += 1) {
    const a = (k / 12) * 2 * Math.PI;
    orbit.push({ at: k / 12, x: Math.round(Math.cos(a) * 22 * 10) / 10, y: Math.round(Math.sin(a) * 22 * 10) / 10 });
  }
  f.clip('RingsMoving', 'Transform', 0, frames(orbit), length);
  f.clip('Band', `Patterns.${stripes}`, 0, frames([{ at: 0, x: 0, scale: 1 }, { at: 0.5, x: 18, scale: 1.15 }, { at: 1, x: 0, scale: 1 }], { easing: 'inOutQuad' }), length);
  f.clip('Band', `Patterns.${crossed}`, 0, frames([{ at: 0, x: 0, scale: 1 }, { at: 0.5, x: -18, scale: 0.9 }, { at: 1, x: 0, scale: 1 }], { easing: 'inOutQuad' }), length);
  f.clip('Title', 'Text', 300, text('crossfade', 'in', { split: 'letter', order: 'random', stagger: 90, duration: 500 }), 1100);
  return f.done('Interference', length);
}

// --- Pointillism --------------------------------------------------------------------------------

/** A tile of dots in one colour: a pattern is a mask painted in its tint, so each colour of a
 *  region's dots is a pattern of its own, laid over the others at its own offset. */
const DOTS = (seed, size = 16) => {
  const next = seeded(seed);
  return svg(Array.from({ length: 5 }, () => `<circle cx="${(2 + next() * (size - 4)).toFixed(1)}" cy="${(2 + next() * (size - 4)).toFixed(1)}" r="${(1.2 + next() * 1.1).toFixed(2)}" fill="#fff"/>`).join(''), size, size);
};
function pointillism() {
  const f = gallery('pointillism', 'Pointillism', { bg: 'FFFBF8F0' });
  // [name, x, y, w, h, radius, dot colours]: the picture, back to front.
  const layers = [
    ['Sky', 0, 0, W, 250, 0, ['FF8CBCE6', 'FFB4D8F4', 'FFF2C6D6']],
    ['Sun', 470, 50, 120, 120, 60, ['FFFFC53A', 'FFFF9628', 'FFFFE68A']],
    ['FarHill', -100, 170, 560, 260, 260, ['FF6FA27C', 'FF98C094', 'FFC2D9AE']],
    ['NearHill', 260, 200, 620, 300, 300, ['FF3F7A44', 'FF6E9E4E', 'FFA2C062']],
    ['Water', 0, 320, W, 85, 0, ['FF2F6FAF', 'FF66A0D6', 'FFCCE3F4']],
  ];
  layers.forEach(([cname, x, y, w, h, radius, colours], i) => {
    const layer = f.label(cname, '', x, y, w, h, { radius });
    colours.forEach((tint, k) => pattern(layer, { src: DOTS(11 + i * 7 + k), tint, opacity: 100, repeat: 'both', speed: 0, offsetX: k * 5, offsetY: k * 3 }));
  });
  f.label('Title', 'POINTILLISM', 20, 20, 300, 40, { size: 26, colour: 'FF2F4A6A', weight: 300, spacing: 6, align: 'left' });
  // Painted a layer at a time: each fades in with its dots large, and they settle to their size.
  const length = 6800;
  layers.forEach(([cname], i) => {
    const layer = f.ids[cname];
    const names = patternNames(f.controlById(layer));
    names.forEach((name, k) => {
      const at = 300 + i * 800 + k * 180;
      f.clip(cname, `Patterns.${name}`, 0, frames([
        { at: 0, opacity: 0, scale: 3 }, { at: at / length, opacity: 0, scale: 3 }, { at: (at + 900) / length, opacity: 1, scale: 1 },
        { at: 6100 / length, opacity: 1, scale: 1 }, { at: 1, opacity: 0, scale: 1 },
      ], { easing: 'outCubic' }), length);
    });
  });
  f.clip('Title', 'Text', 4300, text('typewriter', 'in', { stagger: 70, duration: 200 }), 1000);
  return f.done('Painting', length);
}

// --- Art Deco -----------------------------------------------------------------------------------

const SUNBURST = svg(Array.from({ length: 36 }, (_, i) => `<path d="M400 400 L ${(400 + 560 * Math.cos(((i * 10 - 90 - 2) * Math.PI) / 180)).toFixed(1)} ${(400 + 560 * Math.sin(((i * 10 - 90 - 2) * Math.PI) / 180)).toFixed(1)} L ${(400 + 560 * Math.cos(((i * 10 - 90 + 2) * Math.PI) / 180)).toFixed(1)} ${(400 + 560 * Math.sin(((i * 10 - 90 + 2) * Math.PI) / 180)).toFixed(1)} Z" fill="#d4af37" fill-opacity="${i % 2 ? '.16' : '.3'}"/>`).join(''), 800, 800);
const FAN = svg('<path d="M60 58 L 4 4 A 80 80 0 0 1 116 4 Z" fill="none" stroke="#d4af37" stroke-width="2"/>' + [20, 40, 60].map((r) => `<path d="M${60 - r * 0.7} ${58 - r * 0.7} A ${r} ${r} 0 0 1 ${60 + r * 0.7} ${58 - r * 0.7}" fill="none" stroke="#d4af37" stroke-width="2"/>`).join(''), 120, 60);
function artDeco() {
  const f = gallery('artdeco', 'Art Deco', { bg: 'FF0B0B0D' });
  picture(f.label('Burst', '', -40, -180, 800, 800), SUNBURST, 'contain');
  radial(f.label('Glow', '', 160, 60, 400, 400), [[0, '#55D4AF37'], [100, '#00D4AF37']]);
  const line = (cname, y, chars) => f.label(cname, '━'.repeat(chars), 0, y, W, 18, { size: 16, colour: 'FFD4AF37', family: 'JetBrains Mono' });
  line('LineTop', 108, 40);
  line('LineMid', 236, 30);
  line('LineFoot', 330, 52);
  for (const [cname, x] of [['FanL', 120], ['FanR', 480]]) picture(f.label(cname, '', x, 260, 120, 60), FAN, 'contain');
  glow(f.label('Title', 'ART DECO', 0, 140, W, 90, { size: 66, colour: 'FFD4AF37', weight: 300, spacing: 24 }), '88D4AF37', 16);
  f.label('Year', 'MCMXXV', 0, 358, W, 24, { size: 14, colour: 'FFB8962E', family: 'JetBrains Mono', spacing: 8 });
  // The burst turns a little each way; the lines are drawn out from the middle; the title shines.
  const length = 6400;
  f.clip('Burst', 'Transform', 0, frames([{ at: 0, rotate: -4 }, { at: 0.5, rotate: 4 }, { at: 1, rotate: -4 }], { easing: 'inOutQuad' }), length);
  ['LineTop', 'LineMid', 'LineFoot'].forEach((cname, i) => f.clip(cname, 'Text', 200 + i * 250, text('crossfade', 'in', { split: 'letter', order: 'centre', stagger: 22, duration: 220 }), 1400));
  for (const [cname, at] of [['FanL', 1200], ['FanR', 1350]]) f.clip(cname, 'Transform', at, frames([{ at: 0, scale: 0, opacity: 0 }, { at: 1, scale: 1, opacity: 1 }], { easing: 'outCubic' }), 600);
  for (const cname of ['FanL', 'FanR']) f.clip(cname, 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1, opacity: 0 }]), 1200);
  f.clip('Title', 'Text', 1600, text('crossfade', 'in', { split: 'letter', order: 'centre', stagger: 70, duration: 600 }), 1400);
  f.clip('Title', 'Text', 3600, text('shimmer', 'in', { colour: 'FFFFF6D8', stagger: 60, duration: 700 }), 1400);
  f.clip('Year', 'Text', 2400, text('typewriter', 'in', { stagger: 80, duration: 160 }), 700);
  return f.done('Opening night', length);
}

// --- Kinetic Mobile -----------------------------------------------------------------------------

/** One hanging arm, drawn about its hanging point at the middle of its box: a string down, a bar,
 *  and a shape on a string at each end. */
const armReach = (drop) => drop + 120;
const ARM = (drop, half, left, right) => {
  const c = armReach(drop);
  return svg(
    `<line x1="200" y1="${c}" x2="200" y2="${c + drop}" stroke="#222" stroke-width="2"/>`
    + `<rect x="${200 - half}" y="${c + drop - 3}" width="${half * 2}" height="6" rx="3" fill="#222"/>`
    + `<line x1="${200 - half + 4}" y1="${c + drop}" x2="${200 - half + 4}" y2="${c + drop + 40}" stroke="#222" stroke-width="1.5"/>`
    + `<line x1="${200 + half - 4}" y1="${c + drop}" x2="${200 + half - 4}" y2="${c + drop + 26}" stroke="#222" stroke-width="1.5"/>`
    + left(200 - half + 4, c + drop + 40) + right(200 + half - 4, c + drop + 26), 400, c * 2);
};
const disc = (colour, r) => (x, y) => `<circle cx="${x}" cy="${y + r}" r="${r}" fill="${colour}"/>`;
const leaf = (colour) => (x, y) => `<path d="M${x} ${y} C ${x + 26} ${y + 10} ${x + 22} ${y + 44} ${x} ${y + 54} C ${x - 22} ${y + 44} ${x - 26} ${y + 10} ${x} ${y} Z" fill="${colour}"/>`;
function kineticMobile() {
  const f = gallery('kineticmobile', 'Kinetic Mobile', { bg: 'FFF2EFE8' });
  f.label('Rail', '', 60, 26, 600, 6, { fill: 'FF222222', radius: 3 });
  // [name, hanging x, string length, half the bar, the left and right shapes]
  const arms = [
    ['ArmLeft', 190, 90, 90, disc('#d62828', 26), leaf('#141414')],
    ['ArmMiddle', 370, 170, 120, leaf('#f2c230'), disc('#1e4fa8', 20)],
    ['ArmRight', 540, 60, 80, disc('#141414', 16), disc('#d62828', 34)],
  ];
  for (const [cname, x, drop, half, left, right] of arms) picture(f.label(cname, '', x - 200, 30 - armReach(drop), 400, armReach(drop) * 2), ARM(drop, half, left, right), 'contain');
  f.label('Title', 'KINETIC MOBILE', 0, 360, W, 30, { size: 18, colour: 'FF222222', weight: 300, spacing: 14 });
  // Each arm swings about where it hangs, dying away, a beat behind the arm before; then a breath
  // of air starts them again.
  const length = 7000;
  arms.forEach(([cname], i) => {
    const swing = [14, -11, 8, -6, 4, -2.5, 1.2, 0];
    const start = i * 350;
    const list = [{ at: 0, rotate: 0 }, { at: start / length, rotate: 0 }];
    swing.forEach((angle, k) => list.push({ at: (start + (k + 1) * 600) / length, rotate: angle * (i === 1 ? -1 : 1) }));
    list.push({ at: 1, rotate: 0 });
    f.clip(cname, 'Transform', 0, frames(list, { easing: 'inOutQuad' }), length);
  });
  f.clip('Title', 'Text', 400, text('crossfade', 'in', { split: 'letter', stagger: 40, duration: 500 }), 1200);
  return f.done('Breeze', length);
}

// --- Constructivism -----------------------------------------------------------------------------

const BAND = (colour, from, to, thickness) => svg(`<line x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" stroke="${colour}" stroke-width="${thickness}"/>`, W, H);
function constructivism() {
  const f = gallery('constructivism', 'Constructivism', { bg: 'FFEFE6D2' });
  pattern(f.label('Paper', '', 0, 0, W, H), { src: 'builtin:dots', tint: 'FFD8CDB4', opacity: 50, repeat: 'both', scale: 0.6, speed: 0 });
  picture(f.label('RedBand', '', 0, 0, W, H), BAND('#c8231e', [-40, 380], [760, 60], 70), 'contain');
  picture(f.label('BlackBand', '', 0, 0, W, H), BAND('#141414', [-40, 120], [760, 330], 26), 'contain');
  f.label('Circle', '', 470, 40, 180, 180, { fill: 'FF141414', radius: 90 });
  for (let i = 0; i < 4; i += 1) f.label(`Block${i + 1}`, '', 70 + i * 34, 320, 24, 24, { fill: i % 2 ? 'FF141414' : 'FFC8231E' });
  f.label('Word', 'MOTION', 40, 120, 440, 110, { size: 92, colour: 'FF141414', family: 'Rubik', weight: 700, rotation: -14 });
  f.label('Small', 'A PANEL IN FIVE MOVEMENTS', 330, 254, 330, 22, { size: 14, colour: 'FFEFE6D2', family: 'Barlow Semi Condensed', weight: 700, fill: 'FF141414', rotation: -14 });
  // The red band from the left, the black from the right, the circle stamped, the word pushed in.
  const length = 6200;
  f.clip('RedBand', 'Transform', 0, frames([{ at: 0, x: -760, y: 300 }, { at: 0.06, x: -760, y: 300 }, { at: 0.16, x: 0, y: 0 }, { at: 0.88, x: 0, y: 0 }, { at: 1, x: 760, y: -300 }], { easing: 'outCubic' }), length);
  f.clip('BlackBand', 'Transform', 0, frames([{ at: 0, x: 760, y: 200 }, { at: 0.12, x: 760, y: 200 }, { at: 0.22, x: 0, y: 0 }, { at: 0.9, x: 0, y: 0 }, { at: 1, x: -760, y: -200 }], { easing: 'outCubic' }), length);
  f.clip('Circle', 'Transform', 0, frames([{ at: 0, scale: 0 }, { at: 0.24, scale: 0 }, { at: 0.3, scale: 1.15 }, { at: 0.33, scale: 1 }, { at: 0.86, scale: 1 }, { at: 0.92, scale: 0 }, { at: 1, scale: 0 }]), length);
  for (let i = 0; i < 4; i += 1) f.clip(`Block${i + 1}`, 'Transform', 0, frames([{ at: 0, scale: 0 }, { at: (2300 + i * 120) / length, scale: 0 }, { at: (2450 + i * 120) / length, scale: 1 }, { at: 0.9, scale: 1 }, { at: 1, scale: 0 }]), length);
  f.clip('Word', 'Text', 1900, text('push', 'in', { duration: 360, direction: 'right' }), 400);
  f.clip('Word', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 1900 / length, opacity: 0 }, { at: 1901 / length, opacity: 1 }, { at: 0.88, opacity: 1 }, { at: 0.92, opacity: 0 }, { at: 1, opacity: 0 }]), length);
  f.clip('Small', 'Text', 2800, text('typewriter', 'in', { stagger: 30, duration: 100 }), 900);
  f.clip('Small', 'Transform', 0, frames([{ at: 0, opacity: 0 }, { at: 2800 / length, opacity: 0 }, { at: 2801 / length, opacity: 1 }, { at: 0.88, opacity: 1 }, { at: 0.92, opacity: 0 }, { at: 1, opacity: 0 }]), length);
  return f.done('Poster', length);
}

/** Every gallery panel, in order, each as the panel the editor opens. */
export const GALLERY = Object.freeze([
  ['bauhaus', bauhaus], ['primarygrid', primaryGrid], ['opart', opArt], ['pointillism', pointillism],
  ['artdeco', artDeco], ['kineticmobile', kineticMobile], ['constructivism', constructivism],
]);

/** One gallery panel by its id, or null. */
export function galleryPanel(id) {
  const entry = GALLERY.find(([key]) => key === id);
  return entry ? entry[1]() : null;
}
