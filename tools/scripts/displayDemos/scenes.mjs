// scenes.mjs — the four display demos, as data.
//
// One scene per screen technology the display components actually implement, because the four are
// genuinely different renderers and a picture of one says nothing about the others:
//
//   character  LcdDisplay, panelType 'character' — a glyph per cell, an HD44780 in a bezel
//   segment    LcdDisplay, panelType 'segment'   — 16-segment starbursts drawn as SVG polygons
//   dotmatrix  LcdDisplay, panelType 'graphic'   — a real pixel grid on canvas, with pixel widgets
//   pixel      PixelDisplay                      — free-pixel placement, the wave/ADSR/scope graphs
//
// WHAT A SCENE IS. `sources` are ordinary panel controls — knobs, a slider, a label. They exist so
// the display has something to be bound TO: every zone and element below names one by `src:<key>`,
// and the runner swaps those for the real Core.ids once the controls are created. That indirection
// is the point of the file. A display's zones do not hold values; they hold LINKS, and the demo is
// only honest if the values arrive the way they arrive in the app — through a source control, the
// preview session, and PanelPreviewSurface's __live map.
//
// `motion` drives those sources. Each entry is evaluated per frame with `t` running 0 → 1 across
// the loop, and EVERY ONE OF THEM MUST CLOSE: f(0) === f(1), or the GIF visibly jumps at the wrap.
// That constraint is why the sines are whole cycles and the sawtooths use `t * n % 1` rather than
// anything eased. The scroll speeds obey the same rule — see `scrollSpeed` below, which is not a
// round number by accident.

/** A named source control: what the display's links point at. */
const knob = (min, max, value) => ({ type: 'Knob', Behavior: { family: 'range', role: 'knob', min, max, defaultValue: value } });
const fader = (min, max, value) => ({ type: 'Slider', Behavior: { family: 'range', role: 'slider', min, max, defaultValue: value } });
const label = (content) => ({ type: 'Label', Text: { content } });

/** Motion helpers. All of these satisfy f(0) === f(1) so the loop is seamless. */
const sine = (min, max, cycles = 1, phase = 0) => (t) =>
  min + (max - min) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (cycles * t + phase)));
/** A struck-note envelope: snaps up, decays away, repeats `hits` times per loop. */
const pluck = (min, max, hits = 3, curve = 2.2) => (t) => {
  const phase = (t * hits) % 1;
  return min + (max - min) * ((1 - phase) ** curve);
};
/** A stepped ramp — a sequencer position, not a smooth value. */
const steps = (min, max, count) => (t) => min + Math.floor((t * count) % count) * ((max - min) / (count - 1));

/**
 * The marquee speed that makes a scrolling zone land exactly where it started.
 *
 * A zone marquee loops its content plus a 3-character gap (ZONE_SCROLL_GAP in lcdZones.js) and
 * advances `scrollSpeed` characters per second. Over a loop of `seconds`, it therefore travels
 * exactly one period when the speed is (length + 3) / seconds. Give it a round number instead and
 * the text is mid-stride at the wrap, which is the one artefact that makes a demo GIF look broken.
 */
const marqueeSpeed = (textLength, seconds) => (textLength + 3) / seconds;

/** The palettes, spelled out rather than referenced, so a scene reads as what it looks like. */
const GREEN_STN = { litColour: 'FF2BE86A', unlitColour: '242BE86A', screenColour: 'FF06371C', backlightColour: 'FF0E5A2E' };
const RED_LED = { litColour: 'FFFF3B30', unlitColour: '22FF3B30', screenColour: 'FF160000', backlightColour: 'FF3A0000' };
const AMBER = { litColour: 'FFFFB000', unlitColour: '26FFB000', screenColour: 'FF241400', backlightColour: 'FF4A2A00' };
const VFD_CYAN = { litColour: 'FF3FF0E0', unlitColour: '223FF0E0', screenColour: 'FF001014', backlightColour: 'FF00343E' };

/** The loop every scene is built around. Frames × delay must equal it exactly. */
export const LOOP_SECONDS = 3;

const PATCH_1 = 'HYPERSAW BRASS PAD';
const PATCH_2 = 'ANALOG LEAD';

export const SCENES = [
  /* ------------------------------------------------------------------------------------------ */
  {
    id: 'character',
    title: 'Character LCD',
    blurb: 'A 20x4 HD44780 in green STN. Six zones, five kinds of link, one scrolling patch name.',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {
      patch: label(PATCH_1),
      cutoff: knob(0, 127, 64),
      reso: knob(0, 127, 40),
      level: fader(0, 127, 100),
      pan: knob(-64, 63, 0),
    },
    motion: {
      cutoff: sine(6, 126, 1),
      reso: sine(10, 120, 2, 0.15),
      level: pluck(4, 127, 3),
      pan: sine(-64, 63, 1, 0.25),
    },
    data: {
      panelType: 'character',
      ...GREEN_STN,
      rows: 4,
      cols: 20,
      padding: 12,
      charSpacing: 1,
      lineSpacing: 4,
      fontScale: 1,
      brightness: 100,
      contrast: 58,
      showGhost: true,
      showGlass: true,
      backlightOn: true,
      // Zone marquee only — the whole-screen scroll stays off, so `scrollSpeed` belongs entirely
      // to the patch-name zone and the loop-closing arithmetic above applies to it alone.
      scroll: 'off',
      scrollSpeed: marqueeSpeed(PATCH_1.length, LOOP_SECONDS),
      cursor: 'off',
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'z-play', show: 'static', text: '▶', row: 1, colStart: 1, colEnd: 1 },
          { id: 'z-patch', show: 'text', sourceId: 'src:patch', row: 1, colStart: 3, colEnd: 14, scroll: true },
          { id: 'z-slot', show: 'static', text: 'A11', row: 1, colStart: 18, colEnd: 20, align: 'right' },

          { id: 'z-cut-l', show: 'static', text: 'CUT', row: 2, colStart: 1, colEnd: 3 },
          { id: 'z-cut-b', show: 'bar', sourceId: 'src:cutoff', row: 2, colStart: 5, colEnd: 15 },
          { id: 'z-cut-v', show: 'pct', sourceId: 'src:cutoff', row: 2, colStart: 17, colEnd: 20, suffix: '%', align: 'right' },

          { id: 'z-res-l', show: 'static', text: 'RES', row: 3, colStart: 1, colEnd: 3 },
          { id: 'z-res-b', show: 'bar', sourceId: 'src:reso', row: 3, colStart: 5, colEnd: 15 },
          { id: 'z-res-v', show: 'midiValue', sourceId: 'src:reso', row: 3, colStart: 17, colEnd: 20, radix: 'hex', prefix: '$', align: 'right' },

          { id: 'z-lvl-l', show: 'static', text: 'LVL', row: 4, colStart: 1, colEnd: 3 },
          { id: 'z-lvl-b', show: 'bar', sourceId: 'src:level', row: 4, colStart: 5, colEnd: 15 },
          { id: 'z-pan-v', show: 'value', sourceId: 'src:pan', row: 4, colStart: 17, colEnd: 20, align: 'right' },
        ],
      }],
    },
  },

  /* ------------------------------------------------------------------------------------------ */
  {
    id: 'segment',
    title: '16-segment LED',
    blurb: 'Starburst segments in red LED: a scrolling name, a tempo to one decimal, a step counter.',
    size: [440, 160],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {
      patch: label(PATCH_2),
      tempo: knob(60, 200, 128),
      step: knob(1, 16, 1),
    },
    motion: {
      tempo: sine(120.0, 136.0, 1),
      step: steps(1, 16, 16),
    },
    data: {
      panelType: 'segment',
      segmentType: '16',
      ...RED_LED,
      rows: 2,
      cols: 10,
      padding: 12,
      charSpacing: 3,
      lineSpacing: 6,
      fontScale: 1,
      brightness: 100,
      contrast: 30,
      showGhost: true,
      showGlass: true,
      backlightOn: true,
      scroll: 'off',
      scrollSpeed: marqueeSpeed(PATCH_2.length, LOOP_SECONDS),
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'z-name', show: 'text', sourceId: 'src:patch', row: 1, colStart: 1, colEnd: 10, scroll: true },
          { id: 'z-bpm', show: 'value', sourceId: 'src:tempo', row: 2, colStart: 1, colEnd: 5, precision: 1, align: 'right' },
          { id: 'z-st', show: 'static', text: 'ST', row: 2, colStart: 7, colEnd: 8 },
          { id: 'z-step', show: 'value', sourceId: 'src:step', row: 2, colStart: 9, colEnd: 10, align: 'right' },
        ],
      }],
    },
  },

  /* ------------------------------------------------------------------------------------------ */
  {
    id: 'dotmatrix',
    title: 'Dot-matrix graphic LCD',
    blurb: 'A 144x64 amber pixel grid: eight peak-holding bars, two smoothed meters and a needle.',
    size: [440, 210],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {
      cutoff: knob(0, 127, 64),
      reso: knob(0, 127, 40),
      level: fader(0, 127, 100),
      pan: knob(-64, 63, 0),
      // Eight analyser bands. Each is the struck-note envelope shaped by its own slower sine, so
      // the bank breathes as one instrument rather than eight unrelated meters.
      b1: knob(0, 127, 0),
      b2: knob(0, 127, 0),
      b3: knob(0, 127, 0),
      b4: knob(0, 127, 0),
      b5: knob(0, 127, 0),
      b6: knob(0, 127, 0),
      b7: knob(0, 127, 0),
      b8: knob(0, 127, 0),
    },
    motion: {
      cutoff: sine(10, 124, 1),
      reso: sine(16, 112, 2, 0.3),
      level: pluck(6, 127, 3),
      pan: sine(-64, 63, 1, 0.75),
      b1: band(0), b2: band(1), b3: band(2), b4: band(3),
      b5: band(4), b6: band(5), b7: band(6), b8: band(7),
    },
    data: {
      panelType: 'graphic',
      ...AMBER,
      // 24 cols x 8 rows at the 6x8 base cell = a 144x64 grid, whose 2.25 aspect matches the
      // screen inside the bezel. Get this wrong and the dots come out as rectangles.
      rows: 8,
      cols: 24,
      pixelWidth: 0,
      pixelHeight: 0,
      padding: 12,
      fontScale: 1,
      brightness: 100,
      contrast: 45,
      dotShape: 'round',
      showGhost: true,
      showGlass: true,
      backlightOn: true,
      scroll: 'off',
      scrollSpeed: 0,
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'z-title', show: 'static', text: 'SPECTRUM', row: 1, colStart: 1, colEnd: 8 },
          { id: 'z-lvl', show: 'pct', sourceId: 'src:level', row: 1, colStart: 20, colEnd: 24, suffix: '%', align: 'right' },

          ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
            id: `z-band${n}`,
            show: 'vbar',
            sourceId: `src:b${n}`,
            row: 2,
            rowSpan: 3,
            colStart: 1 + (n - 1) * 3,
            colEnd: 2 + (n - 1) * 3,
            peakHold: true,
            smooth: true,
          })),

          { id: 'z-cut-l', show: 'static', text: 'CUT', row: 5, colStart: 1, colEnd: 3 },
          { id: 'z-cut-b', show: 'hbar', sourceId: 'src:cutoff', row: 5, colStart: 5, colEnd: 24, frame: true, smooth: true },
          { id: 'z-res-l', show: 'static', text: 'RES', row: 6, colStart: 1, colEnd: 3 },
          { id: 'z-res-b', show: 'hbar', sourceId: 'src:reso', row: 6, colStart: 5, colEnd: 24, frame: true, smooth: true },

          // Four VU needles rather than one wide one. The needle's sweep radius is capped by BOTH
          // half the box width and the box height (LcdGraphicCanvas: min(ih - 1, iw / 2 - 1)), so
          // a needle given the full 24 columns draws an 11px sweep marooned in a 140px frame. At
          // five columns the box is 30px wide and the sweep fills it.
          ...[
            { n: 1, src: 'pan' }, { n: 2, src: 'cutoff' }, { n: 3, src: 'reso' }, { n: 4, src: 'level' },
          ].map(({ n, src }) => ({
            id: `z-vu${n}`,
            show: 'needle',
            sourceId: `src:${src}`,
            row: 7,
            rowSpan: 2,
            colStart: 1 + (n - 1) * 6,
            colEnd: 5 + (n - 1) * 6,
            frame: true,
            ticks: true,
          })),
        ],
      }],
    },
  },

  /* ------------------------------------------------------------------------------------------ */
  {
    id: 'dotmatrix-gif',
    title: 'A loaded GIF on the dot-matrix panel',
    blurb: 'The same graphic panel playing an animation file, dithered to 1-bit, with live zones over it.',
    size: [440, 210],
    type: 'LcdDisplay',
    section: 'Display',
    // Built by displayDemos/sourceAnimation.mjs and injected as a data URL. Its 1500ms cycle is
    // half the capture loop, so the panel plays it exactly twice and the recording still wraps.
    animSource: 'torus',
    sources: {
      level: fader(0, 127, 100),
    },
    motion: {
      level: pluck(8, 127, 3),
    },
    data: {
      panelType: 'graphic',
      ...GREEN_STN,
      rows: 8,
      cols: 24,
      pixelWidth: 0,
      pixelHeight: 0,
      padding: 12,
      fontScale: 1,
      brightness: 100,
      contrast: 40,
      dotShape: 'round',
      showGhost: true,
      showGlass: true,
      backlightOn: true,
      scroll: 'off',
      scrollSpeed: 0,
      // animSrc is filled in by the recorder. Frame timings come from the file itself, so animFps
      // is only consulted for sprite sheets — which this is not.
      animMode: 'file',
      animLoop: true,
      imageDither: true,
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        // Deliberately sparse. The animation plays BEHIND the zones, so a couple of live fields
        // are enough to show they composite over it; a full dashboard would just hide the point.
        zones: [
          { id: 'z-file', show: 'static', text: 'TORUS.GIF', row: 1, colStart: 1, colEnd: 9 },
          { id: 'z-lvl', show: 'pct', sourceId: 'src:level', row: 1, colStart: 20, colEnd: 24, suffix: '%', align: 'right' },
          { id: 'z-bar', show: 'hbar', sourceId: 'src:level', row: 8, colStart: 1, colEnd: 24, smooth: true },
        ],
      }],
    },
  },

  /* ------------------------------------------------------------------------------------------ */
  {
    id: 'pixel',
    title: 'Free-pixel OLED/VFD',
    blurb: 'A 128x64 VFD: a synthesized oscillator, an ADSR curve, a rolling scope and a meter bank.',
    size: [440, 230],
    type: 'PixelDisplay',
    section: 'Pixel',
    sources: {
      cutoff: knob(0, 127, 64),
      reso: knob(0, 127, 40),
      level: fader(0, 127, 100),
      pan: knob(-64, 63, 0),
      sweep: knob(0, 127, 30),
      attack: knob(0, 127, 20),
      decay: knob(0, 127, 60),
      sustain: knob(0, 127, 80),
      release: knob(0, 127, 50),
      b1: knob(0, 127, 0),
      b2: knob(0, 127, 0),
      b3: knob(0, 127, 0),
      b4: knob(0, 127, 0),
    },
    motion: {
      cutoff: sine(14, 126, 1),
      reso: sine(4, 112, 2, 0.2),
      level: pluck(10, 127, 3),
      pan: sine(-64, 63, 1, 0.5),
      sweep: sine(10, 120, 1, 0.35),
      attack: sine(6, 90, 1, 0.1),
      decay: sine(20, 110, 1, 0.6),
      sustain: sine(30, 120, 1, 0.85),
      release: sine(24, 118, 1, 0.4),
      b1: band(0), b2: band(2), b3: band(4), b4: band(6),
    },
    data: {
      pixelsW: 128,
      pixelsH: 64,
      ...VFD_CYAN,
      padding: 8,
      brightness: 100,
      contrast: 50,
      gamma: 1,
      glow: 0.45,
      dotShape: 'round',
      showGhost: true,
      showGlass: true,
      backlightOn: true,
      layouts: [],
      pages: { defaultLayoutId: '', selectorSourceId: '', selectorMap: [], overlays: [] },
      elements: [
        { id: 'e-name', kind: 'static', text: 'SATURN VB', x: 2, y: 0, w: 66, h: 7 },
        { id: 'e-lvl', kind: 'pct', sourceId: 'src:level', x: 92, y: 0, w: 34, h: 7, suffix: '%', align: 'right' },

        // The oscillator drawing is synthesized from the bound values — amplitude from level,
        // brightness of the harmonics from cutoff/resonance, wobble from the LFO. No audio needed.
        {
          id: 'e-wave',
          kind: 'wave',
          sourceId: 'src:level',
          cutoffSourceId: 'src:cutoff',
          resoSourceId: 'src:reso',
          // Frequency, not the LFO input, and the difference is the loop. The LFO's phase is
          // sin(2*PI * rate * elapsed) with `rate` read live from its source, so a rate that moves
          // makes the phase an integral of a changing frequency — it lands somewhere different
          // every lap and the GIF jumps at the wrap (measured: 0.96% of pixels). `freqSourceId`
          // scales the waveform's spatial cycles instead: no integration, so a periodic input
          // gives a periodic picture, and the wave still visibly stretches and compresses.
          freqSourceId: 'src:sweep',
          waveShape: 'saw',
          waveCycles: 2,
          waveSpeed: 1,
          waveDepth: 0.5,
          x: 2, y: 10, w: 60, h: 24,
          frame: true,
        },
        {
          id: 'e-adsr',
          kind: 'adsr',
          attackSourceId: 'src:attack',
          decaySourceId: 'src:decay',
          sustainSourceId: 'src:sustain',
          releaseSourceId: 'src:release',
          x: 66, y: 10, w: 60, h: 24,
          frame: true,
        },

        {
          id: 'e-scope',
          kind: 'scope',
          sourceId: 'src:level',
          scopeSecs: LOOP_SECONDS,
          scopeFill: true,
          x: 2, y: 38, w: 60, h: 24,
          frame: true,
        },
        { id: 'e-b1', kind: 'vbar', sourceId: 'src:b1', x: 65, y: 38, w: 5, h: 24, peakHold: true, smooth: true },
        { id: 'e-b2', kind: 'vbar', sourceId: 'src:b2', x: 72, y: 38, w: 5, h: 24, peakHold: true, smooth: true },
        { id: 'e-b3', kind: 'vbar', sourceId: 'src:b3', x: 79, y: 38, w: 5, h: 24, peakHold: true, smooth: true },
        { id: 'e-b4', kind: 'vbar', sourceId: 'src:b4', x: 86, y: 38, w: 5, h: 24, peakHold: true, smooth: true },
        // 32 wide, not 18: the sweep radius is min(h - 1, w / 2 - 1), so a narrow box shrinks the
        // needle to a stub however tall it is.
        { id: 'e-pan', kind: 'needle', sourceId: 'src:pan', x: 94, y: 38, w: 32, h: 24, frame: true, ticks: true },
      ],
    },
  },
];

/**
 * One analyser band: the shared struck-note envelope, scaled by a slow per-band sine.
 *
 * Declared after SCENES only because it is referenced inside it — hoisting makes that legal, and
 * keeping it here rather than up with the other helpers puts it next to the thing it explains.
 * Both factors complete whole cycles over the loop, so the band closes like everything else.
 */
function band(index) {
  const hit = pluck(0, 1, 3, 1.6 + index * 0.22);
  const tilt = sine(0.35, 1, 1, index / 8);
  return (t) => 127 * hit(t) * tilt(t);
}
