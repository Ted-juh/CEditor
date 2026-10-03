// Display and shape designs: the LCD, the Pixel Display and the Shape, which every set left as they were.
//
// The LCD took its four colours from the set (`display.*`) and nothing else: in every set it was the
// same green-station panel with the same round cells, the same glass, the same ghosting. The Pixel
// Display did not even take the colours: its screen was a fixed white OLED. And a Shape's own fill
// and stroke were factory grey in every set; the sets wrote only its Background, which a Shape keeps
// switched off.
//
// A set's display window already says what kind of readout it is. Its glass and its ink were chosen
// together, so the treatment is read from them, the way the instrument voices are read from the
// set's colours:
//
//   reflective  pale glass, dark segments, no backlight: an unlit LCD (Ceramic, Rackmount).
//   glow        dark glass and a saturated ink: a VFD, an LED or a nixie. Lit cells halo, and the
//               cell mesh shows (Tolex's amber window, Valve's nixie, Neon).
//   scan        a black screen with a green trace: a phosphor tube, with scanlines.
//   oled        a black screen otherwise: crisp square cells, no glass, no ghosts.
//   drafting    the line-work set: a pale trace on a navy sheet, a grid, no glass.
//   backlit     everything else: a lit LCD, as the factory one is, with square cells.
//
// The displays sit in the set's own bezel, the section surface with the set's corners. A Shape
// is drawn in the set's section language: the section surface, the frame's line and weight and
// corners, so a box on Tolex is piped in cream and one on Blueprint is a dashed construction line.
//
// Graphite has none of this: its displays and shapes are what they always were. Every property
// written here is one the editor's panels expose.

import { argb, darken, mix } from './controlSetDesigns.js';
import { labelTreatmentFor } from './labelDesigns.js';
import { sectionTreatmentFor } from './sectionDesigns.js';
import { frameFor, grammarFor } from './designGrammar.js';

export const DISPLAY_TREATMENTS = ['reflective', 'glow', 'scan', 'oled', 'drafting', 'backlit'];
export const DISPLAY_TYPES = ['LcdDisplay', 'PixelDisplay', 'Shape'];

function literal(set, name) {
  let value = set.tokens?.[name];
  for (let i = 0; i < 8 && /^\{.+\}$/.test(String(value ?? '')); i += 1) value = set.tokens?.[String(value).slice(1, -1)];
  return /^[0-9A-F]{6}([0-9A-F]{2})?$/i.test(String(value ?? '')) ? argb(String(value).slice(-6)) : null;
}
function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(String(hex).slice(-6).slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function hueAndSaturation(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(String(hex).slice(-6).slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (!d) return [0, 0];
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / (1 - Math.abs(2 * l - 1))];
}

/** The kind of readout a set's display window is, or null for Graphite. */
export function displayTreatmentFor(set) {
  if (!set || set.id === 'graphite') return null;
  const screen = literal(set, 'display.screen');
  const lit = literal(set, 'display.lit');
  if (!screen || !lit) return null;
  if (labelTreatmentFor(set) === 'frame') return 'drafting';
  const glass = luminance(screen);
  if (glass > 0.3) return 'reflective';
  const [hue, saturation] = hueAndSaturation(lit);
  if (glass < 0.0025) return hue >= 100 && hue <= 160 ? 'scan' : 'oled';
  if (glass < 0.0085 && saturation >= 0.8) return 'glow';
  return 'backlit';
}

// What each treatment does to a screen, LCD and Pixel Display alike. The LCD's cell grid is the
// VFD's mesh; the Pixel Display's is an editing aid, so it is left alone there.
const SCREENS = {
  reflective: { backlightOn: false, showGhost: true, showGlass: true, glassTint: '33FFFFFF', showScanlines: false, dotShape: 'square', glow: 0, grid: false },
  glow: { backlightOn: true, showGhost: true, showGlass: true, glassTint: '0FFFFFFF', showScanlines: false, dotShape: 'round', glow: 0.55, grid: true },
  scan: { backlightOn: true, showGhost: false, showGlass: true, glassTint: '1AFFFFFF', showScanlines: true, dotShape: 'round', glow: 0.45, grid: false },
  oled: { backlightOn: false, showGhost: false, showGlass: false, glassTint: '00FFFFFF', showScanlines: false, dotShape: 'square', glow: 0, grid: false },
  drafting: { backlightOn: false, showGhost: false, showGlass: false, glassTint: '00FFFFFF', showScanlines: false, dotShape: 'square', glow: 0, grid: true },
  backlit: { backlightOn: true, showGhost: true, showGlass: true, glassTint: '14FFFFFF', showScanlines: false, dotShape: 'square', glow: 0, grid: false },
};

// The corner a set's sections take, which its displays and shapes share.
const CORNERS = { well: [4, 14], milled: [2, 5], glow: [6, 16], piping: [14, 14], hairline: [0, 0] };

function cornerFor(set, treatment) {
  const radius = Number(set.families?.Group?.component?.['Background.Corners.radius'] ?? 8);
  const [lo, hi] = CORNERS[treatment] ?? [4, 12];
  return Math.max(lo, Math.min(Number.isFinite(radius) ? radius : 8, hi));
}

/** The families that design a set's LCD, Pixel Display and Shape, or null for Graphite. */
export function displayFamilies(set) {
  const screen = SCREENS[displayTreatmentFor(set)];
  if (!screen) return null;
  const frame = sectionTreatmentFor(set) ?? 'well';
  const corner = cornerFor(set, frame);
  const panel = literal(set, 'panel.surface') ?? 'FF202020';
  const ink = literal(set, 'text.primary') ?? 'FFFFFFFF';
  const accent = literal(set, 'accent') ?? ink;
  // The bezel is the set's frame round the glass (models/designGrammar.js).
  const bezel = frameFor(set, { fill: '{section.surface}', maxRadius: 12 }) ?? {
    'Background.Fill.colour': '{section.surface}',
    'Background.Border.colour': argb(darken(panel.slice(-6), 0.45)),
    'Background.Corners.radius': Math.min(corner, 12),
  };
  const lcd = {
    ...bezel,
    'Display.backlightOn': screen.backlightOn,
    'Display.showGhost': screen.showGhost,
    'Display.showGlass': screen.showGlass,
    'Display.glassTint': screen.glassTint,
    'Display.showScanlines': screen.showScanlines,
    'Display.showGrid': screen.grid,
    'Display.dotShape': screen.dotShape,
  };
  const pixel = {
    ...bezel,
    'Pixel.litColour': '{display.lit}',
    'Pixel.unlitColour': '{display.unlit}',
    'Pixel.screenColour': '{display.screen}',
    'Pixel.backlightColour': '{display.backlight}',
    'Pixel.backlightOn': screen.backlightOn,
    'Pixel.showGhost': screen.showGhost,
    'Pixel.showGlass': screen.showGlass,
    'Pixel.glassTint': screen.glassTint,
    'Pixel.showScanlines': screen.showScanlines,
    'Pixel.dotShape': screen.dotShape,
    'Pixel.glow': screen.glow,
  };
  // A shape in the set's section language: the frame's line, weight and corners on the section
  // surface. The hairline set draws a construction line.
  const line = frame === 'piping' || frame === 'hairline' ? '{text.primary}'
    : frame === 'glow' ? argb(accent.slice(-6), 'B3')
      // Mostly lettering: a line is often a divider on the bare panel, and should read there at 3:1.
      : argb(mix(panel.slice(-6), ink.slice(-6), 0.7));
  const shape = {
    'Shape.fillColour': '{section.surface}',
    'Shape.strokeColour': line,
    'Shape.strokeWidth': grammarFor(set)?.line ?? 1,
    'Shape.cornerRadius': corner,
    'Shape.strokeStyle': frame === 'hairline' ? 'dashed' : 'solid',
  };
  return { LcdDisplay: { component: lcd }, PixelDisplay: { component: pixel }, Shape: { component: shape } };
}

/**
 * The set with its displays and shapes designed. A built-in that names one of these families keeps
 * what it names. (A personal set merges this under what its author wrote, by its own record:
 * models/personalSetDesigns.js.)
 */
export function withDisplayDesign(set) {
  const designed = displayFamilies(set);
  if (!designed) return set;
  const families = { ...set.families };
  for (const [type, family] of Object.entries(designed)) {
    const own = families[type]?.component ?? {};
    families[type] = { ...family, ...families[type], component: { ...family.component, ...own } };
  }
  return { ...set, families };
}
