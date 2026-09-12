// mockups.mjs — the figures for docs/design/display-component-futures.md.
//
// It started as pictures of proposals. All three have since shipped, so everything here is now a
// RECORDING of a working feature rather than a drawing of an intended one:
//
//   softkeys-*     shipped. Real `press` actions, and the pressed one is captured mid-press with
//                  the inverse video drawn by the renderer rather than by the scene.
//   glyphs-*       shipped. Both are the same character LCD on the same panel type; the only
//                  difference between them is eight glyph definitions. The "after" used to be a
//                  PixelDisplay impersonating a character LCD, because the character LCD could not
//                  place artwork in a cell. It can now, so the impersonation is gone.
//   state-*        shipped, and the awkward case. All three edges between the screens are real now:
//                  a press gets you in (proposal 4), a layout's own timeoutMs brings you back, and
//                  the MENU cursor moves. But an edge is not a picture. MENU in particular looks
//                  much as it did when it was a drawing — the difference is that its marker zones
//                  are driven by `visibleWhen: { cursor: N }` off real display state, and its
//                  UP/DOWN keys carry `press: { cursor: ±1 }`, so pressing one moves the selection.
//                  The stills show the screens; the document argues the edges in words.
//
// They stay separate from scenes.mjs and land on docs/media/mockup-*.png rather than
// display-*.gif, because the moving recordings are a different claim and the two must not be
// filed together.

/** A source control the mockups can link to. Static: the mockups carry no motion. */
const knob = (min, max, value) => ({ type: 'Knob', Behavior: { family: 'range', role: 'knob', min, max, defaultValue: value } });
const label = (content) => ({ type: 'Label', Text: { content } });

const GREEN_STN = { litColour: 'FF2BE86A', unlitColour: '242BE86A', screenColour: 'FF06371C', backlightColour: 'FF0E5A2E' };
const AMBER = { litColour: 'FFFFB000', unlitColour: '26FFB000', screenColour: 'FF241400', backlightColour: 'FF4A2A00' };

/** Shared chrome for a 20×4 character LCD, so the mockups differ only where the point is. */
const CHAR_LCD = {
  panelType: 'character',
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
  scroll: 'off',
  cursor: 'off',
};

/**
 * A 5×8 glyph written as eight rows of '#' and '.', turned into the '1'/'0' string a bitmap
 * element wants. Authoring them as pictures is the whole reason the proposal is worth having:
 * this is what a CGRAM glyph looks like in the datasheet, and in the code that defines one.
 */
const glyph = (...rows) => rows.join('').replace(/#/g, '1').replace(/\./g, '0');

// The four glyphs a bargraph actually needs. Eight CGRAM slots is the hardware budget, and a bar
// that fills smoothly plus a baseline costs four of them — which is why real panels have exactly
// this and not more.
const BAR_FULL_G = glyph('.....', '.###.', '.###.', '.###.', '.###.', '.###.', '.###.', '#####');
const BAR_HALF_G = glyph('.....', '.....', '.....', '.....', '.###.', '.###.', '.###.', '#####');

// Three icons, because the other half of what CGRAM buys is symbols no font has.
const ICON_NOTE = glyph('...#.', '...##', '...#.', '...#.', '...#.', '.###.', '###..', '.#...');
const ICON_PLUG = glyph('.###.', '#...#', '#.#.#', '#...#', '#####', '..#..', '..#..', '.###.');
const ICON_LEVEL = glyph('...#.', '..##.', '.###.', '####.', '####.', '.###.', '..##.', '...#.');

export const MOCKUPS = [
  /* --- 4. Soft keys: zones as hit targets ------------------------------- IMPLEMENTED --------- */
  //
  // These were mockups of a proposal; the proposal shipped, and so did the pressed state that
  // followed it. Both pictures are now recordings of a working feature: the second one is captured
  // mid-press, with the inverse video drawn by the renderer rather than by the scene.
  {
    id: 'softkeys-idle',
    still: true,
    caption: 'Soft keys at rest — four pressable zones on row 4',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {
      patch: label('HYPERSAW BRASS'),
      cutoff: knob(0, 127, 66),
      reso: knob(0, 127, 46),
    },
    motion: {},
    data: {
      ...CHAR_LCD,
      ...AMBER,
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'z-pl', show: 'static', text: 'PATCH', row: 1, colStart: 1, colEnd: 5 },
          { id: 'z-pn', show: 'text', sourceId: 'src:patch', row: 1, colStart: 7, colEnd: 20 },
          { id: 'z-cl', show: 'static', text: 'CUT', row: 2, colStart: 1, colEnd: 3 },
          { id: 'z-cb', show: 'bar', sourceId: 'src:cutoff', row: 2, colStart: 5, colEnd: 15 },
          { id: 'z-cv', show: 'pct', sourceId: 'src:cutoff', row: 2, colStart: 17, colEnd: 20, suffix: '%', align: 'right' },
          { id: 'z-rl', show: 'static', text: 'RES', row: 3, colStart: 1, colEnd: 3 },
          { id: 'z-rb', show: 'bar', sourceId: 'src:reso', row: 3, colStart: 5, colEnd: 15 },
          { id: 'z-rv', show: 'midiValue', sourceId: 'src:reso', row: 3, colStart: 17, colEnd: 20, radix: 'hex', prefix: '$', align: 'right' },
          // The soft-key row. Five characters each, four of them, exactly twenty columns.
          { id: 'k1', show: 'static', text: '[OSC]', row: 4, colStart: 1, colEnd: 5, press: { layout: 'main' } },
          { id: 'k2', show: 'static', text: '[FLT]', row: 4, colStart: 6, colEnd: 10, press: { layout: 'main' } },
          { id: 'k3', show: 'static', text: '[ENV]', row: 4, colStart: 11, colEnd: 15, press: { layout: 'main' } },
          { id: 'k4', show: 'static', text: '[FX ]', row: 4, colStart: 16, colEnd: 20, press: { layout: 'main' } },
        ],
      }],
    },
  },
  {
    id: 'softkeys-pressed',
    still: true,
    // A REAL press, captured. The recorder clicks the middle of the FLT key and shoots inside the
    // 140ms flash, so the inverse video below is the renderer's, not a drawing. The key's action
    // re-selects the layout it is already on, which is what keeps the rest of the screen still.
    pressAt: { col: 8, row: 4 },
    caption: 'FLT held down — inverse video, captured mid-press from the real renderer',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {
      patch: label('HYPERSAW BRASS'),
      cutoff: knob(0, 127, 66),
      reso: knob(0, 127, 46),
    },
    motion: {},
    data: {
      ...CHAR_LCD,
      ...AMBER,
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'z-pl', show: 'static', text: 'PATCH', row: 1, colStart: 1, colEnd: 5 },
          { id: 'z-pn', show: 'text', sourceId: 'src:patch', row: 1, colStart: 7, colEnd: 20 },
          { id: 'z-cl', show: 'static', text: 'CUT', row: 2, colStart: 1, colEnd: 3 },
          { id: 'z-cb', show: 'bar', sourceId: 'src:cutoff', row: 2, colStart: 5, colEnd: 15 },
          { id: 'z-cv', show: 'pct', sourceId: 'src:cutoff', row: 2, colStart: 17, colEnd: 20, suffix: '%', align: 'right' },
          { id: 'z-rl', show: 'static', text: 'RES', row: 3, colStart: 1, colEnd: 3 },
          { id: 'z-rb', show: 'bar', sourceId: 'src:reso', row: 3, colStart: 5, colEnd: 15 },
          { id: 'z-rv', show: 'midiValue', sourceId: 'src:reso', row: 3, colStart: 17, colEnd: 20, radix: 'hex', prefix: '$', align: 'right' },
          { id: 'k1', show: 'static', text: '[OSC]', row: 4, colStart: 1, colEnd: 5, press: { layout: 'main' } },
          { id: 'k2', show: 'static', text: '[FLT]', row: 4, colStart: 6, colEnd: 10, press: { layout: 'main' } },
          { id: 'k3', show: 'static', text: '[ENV]', row: 4, colStart: 11, colEnd: 15, press: { layout: 'main' } },
          { id: 'k4', show: 'static', text: '[FX ]', row: 4, colStart: 16, colEnd: 20, press: { layout: 'main' } },
        ],
      }],
    },
  },

  /* --- 1. User-definable glyphs ---------------------------------------- IMPLEMENTED --------- */
  //
  // This pair used to be a mockup, with a PixelDisplay impersonating a character LCD because the
  // character LCD could not place artwork in a cell. It can now, so BOTH are the same renderer on
  // the same panel type, and the only difference between them is eight glyph definitions.
  //
  // The bar is driven by a real linked knob in both, so what changes is purely how the characters
  // `bar` composes get DRAWN: as the system font's block characters, or as 5x8 bitmaps with a foot.
  {
    id: 'glyphs-blocks',
    still: true,
    caption: 'Without glyphs: the bar is the system font\u2019s block characters, and symbols are words',
    size: [440, 120],
    type: 'LcdDisplay',
    section: 'Display',
    sources: { level: knob(0, 127, 71.4375) },
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      rows: 2,
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'l', show: 'static', text: 'LEVEL', row: 1, colStart: 1, colEnd: 5 },
          { id: 'b', show: 'bar', sourceId: 'src:level', row: 1, colStart: 7, colEnd: 14 },
          { id: 'd', show: 'static', text: '-12dB', row: 1, colStart: 16, colEnd: 20 },
          { id: 'm', show: 'static', text: 'MIDI', row: 2, colStart: 1, colEnd: 4 },
          { id: 'c', show: 'static', text: 'CH 1', row: 2, colStart: 6, colEnd: 9 },
          { id: 'p', show: 'static', text: 'PRG 041', row: 2, colStart: 12, colEnd: 18 },
        ],
      }],
    },
  },
  {
    id: 'glyphs-cgram',
    still: true,
    caption: 'With eight CGRAM glyphs: the same bar, drawn from 5x8 bitmaps, and symbols no font has',
    size: [440, 120],
    type: 'LcdDisplay',
    section: 'Display',
    sources: { level: knob(0, 127, 71.4375) },
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      rows: 2,
      // Slots 0 and 1 CLAIM the block characters `bar` composes, which is what converts an ordinary
      // bargraph into a segmented one without the zone engine knowing glyphs exist. Slots 2-4 are
      // reached directly as \x02..\x04 in static text, the way the hardware addresses CGRAM.
      glyphs: [
        { bits: BAR_FULL_G, for: '\u2588' },
        { bits: BAR_HALF_G, for: '\u258C' },
        { bits: ICON_PLUG, for: '' },
        { bits: ICON_NOTE, for: '' },
        { bits: ICON_LEVEL, for: '' },
        { bits: '', for: '' }, { bits: '', for: '' }, { bits: '', for: '' },
      ],
      pages: { defaultLayoutId: 'main', selectorSourceId: '', selectorMap: [], overlays: [] },
      layouts: [{
        id: 'main',
        name: 'Main',
        zones: [
          { id: 'l', show: 'static', text: 'LEVEL', row: 1, colStart: 1, colEnd: 5 },
          { id: 'b', show: 'bar', sourceId: 'src:level', row: 1, colStart: 7, colEnd: 14 },
          { id: 'd', show: 'static', text: '-12dB', row: 1, colStart: 16, colEnd: 20 },
          // The same two facts as the row above, said in symbols instead of eleven columns of words.
          { id: 'i1', show: 'static', text: '\u0002', row: 2, colStart: 1, colEnd: 1 },
          { id: 'c', show: 'static', text: 'CH 1', row: 2, colStart: 3, colEnd: 6 },
          { id: 'i2', show: 'static', text: '\u0003', row: 2, colStart: 9, colEnd: 9 },
          { id: 'p', show: 'static', text: '041', row: 2, colStart: 11, colEnd: 13 },
          { id: 'i3', show: 'static', text: '\u0004', row: 2, colStart: 16, colEnd: 16 },
          // Addressed by slot rather than by claim: a mini meter drawn from the bar glyphs directly.
          { id: 'mm', show: 'static', text: '\u0000\u0000\u0001', row: 2, colStart: 18, colEnd: 20 },
        ],
      }],
    },
  },

  /* --- 6. Layouts as a state machine --------------------------------------------------------- */
  //
  // Three real screens. Each renders today; what does not exist is a transition between them that
  // is anything other than "a control's value changed". HOME → EDIT is a press; EDIT → HOME is a
  // timeout. Neither is expressible in `pages.selectorMap`.
  {
    id: 'state-home',
    still: true,
    caption: 'HOME — where the screen rests',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {},
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      lines: [
        'HYPERSAW BRASS   A11',
        'CUT ███████      52%',
        'RES ████         $6E',
        '[OSC][FLT][ENV][FX ]',
      ],
      layouts: [],
      pages: { defaultLayoutId: '', selectorSourceId: '', selectorMap: [], overlays: [] },
    },
  },
  {
    id: 'state-edit',
    still: true,
    caption: 'EDIT — entered by a soft key, left by the page\u2019s own timeoutMs. Both edges are real.',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {},
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      lines: [
        'FILTER       24dB LP',
        'CUTOFF       3.20kHz',
        'RESONANCE       0.62',
        '[BAK][ < ][ > ][OK ]',
      ],
      layouts: [],
      pages: { defaultLayoutId: '', selectorSourceId: '', selectorMap: [], overlays: [] },
    },
  },
  {
    id: 'state-menu',
    still: true,
    // A REAL menu now, not lines of text: cursorMax gives the page three items, each row carries a
    // marker zone shown only at its own index, and the UP/DOWN keys move the selection. The still
    // shows it at rest on item 0 — which is what it looked like when this was a mockup, except
    // that now pressing DOWN actually moves it.
    caption: 'MENU — three items, a live selection marker, and UP/DOWN that move it',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {},
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      layouts: [{
        id: 'menu',
        name: 'Menu',
        cursorMax: 2,
        zones: [
          { id: 'title', show: 'static', text: 'MENU', row: 1, colStart: 1, colEnd: 4 },
          { id: 'pos', show: 'value', sourceId: '@state:cursor', row: 1, colStart: 19, colEnd: 20, align: 'right' },

          { id: 't0', show: 'static', text: 'MIDI CHANNEL    1', row: 2, colStart: 3, colEnd: 20 },
          { id: 'a0', show: 'static', text: '\u25B6', row: 2, colStart: 1, colEnd: 1, visibleWhen: { cursor: 0 } },
          { id: 't1', show: 'static', text: 'TRANSPOSE       0', row: 3, colStart: 3, colEnd: 20 },
          { id: 'a1', show: 'static', text: '\u25B6', row: 3, colStart: 1, colEnd: 1, visibleWhen: { cursor: 1 } },

          { id: 'up', show: 'static', text: '[ \u25B2 ]', row: 4, colStart: 1, colEnd: 5, press: { cursor: -1 } },
          { id: 'dn', show: 'static', text: '[ \u25BC ]', row: 4, colStart: 7, colEnd: 11, press: { cursor: 1 } },
          { id: 'ok', show: 'static', text: '[OK ]', row: 4, colStart: 16, colEnd: 20, press: { layout: 'menu' } },
        ],
      }],
      pages: { defaultLayoutId: 'menu', selectorSourceId: '', selectorMap: [], overlays: [] },
    },
  },
];
