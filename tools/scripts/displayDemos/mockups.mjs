// mockups.mjs — the proposals in docs/design/display-component-futures.md, rendered.
//
// These are NOT recordings of features. Everything in scenes.mjs is a picture of what the
// components do; everything here is a picture of what they might do, and the two must never get
// filed together. The distinction is kept honest in three ways:
//
//   1. They are written as stills (`still: true`), so nothing here can be mistaken for one of the
//      moving recordings.
//   2. They go to docs/media/mockup-*.png, not display-*.gif.
//   3. Where a mockup shows something the component genuinely cannot do, it says which renderer is
//      standing in for it — see the glyph pair below, where a PixelDisplay impersonates a character
//      LCD precisely because the character LCD is the one that cannot do it.
//
// What IS real in here is worth knowing, because it is most of it: the soft-key row and the menu
// screens are ordinary zones and lines that render today. The proposal in those cases is not the
// picture, it is that a zone could be *pressed* or a layout could be *entered* — behaviour, which
// no still can show and which the document has to argue in words.

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
const BAR_FULL = glyph('.....', '.###.', '.###.', '.###.', '.###.', '.###.', '.###.', '#####');
const BAR_HALF = glyph('.....', '.....', '.....', '.....', '.###.', '.###.', '.###.', '#####');
const BAR_EMPTY = glyph('.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####');

// Three icons, because the other half of what CGRAM buys is symbols no font has.
const ICON_NOTE = glyph('...#.', '...##', '...#.', '...#.', '...#.', '.###.', '###..', '.#...');
const ICON_PLUG = glyph('.###.', '#...#', '#.#.#', '#...#', '#####', '..#..', '..#..', '.###.');
const ICON_LEVEL = glyph('...#.', '..##.', '.###.', '####.', '####.', '.###.', '..##.', '...#.');

/** Place a 5×8 glyph at character cell (col, row), 1-based, on a 6×8 pixel grid. */
const cell = (id, col, row, bits) => ({
  id, kind: 'bitmap', x: (col - 1) * 6, y: (row - 1) * 8, w: 5, h: 8, bits,
});

export const MOCKUPS = [
  /* --- 4. Soft keys: zones as hit targets ---------------------------------------------------- */
  //
  // Both of these render today — the soft-key row is four static zones. What does NOT exist is the
  // press: there is no Mouse section, no HitZones section, and no way to give a zone an action. The
  // pair exists to show that the *only* thing missing between them is behaviour.
  {
    id: 'softkeys-idle',
    still: true,
    caption: 'Soft keys at rest — four static zones on row 4',
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
          { id: 'k1', show: 'static', text: '[OSC]', row: 4, colStart: 1, colEnd: 5 },
          { id: 'k2', show: 'static', text: '[FLT]', row: 4, colStart: 6, colEnd: 10 },
          { id: 'k3', show: 'static', text: '[ENV]', row: 4, colStart: 11, colEnd: 15 },
          { id: 'k4', show: 'static', text: '[FX ]', row: 4, colStart: 16, colEnd: 20 },
        ],
      }],
    },
  },
  {
    id: 'softkeys-pressed',
    still: true,
    caption: 'FLT pressed — the proposal is that this is a zone action, not a repaint',
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
          { id: 'k1', show: 'static', text: '[OSC]', row: 4, colStart: 1, colEnd: 5 },
          { id: 'k2', show: 'static', text: '▶FLT◀', row: 4, colStart: 6, colEnd: 10 },
          { id: 'k3', show: 'static', text: '[ENV]', row: 4, colStart: 11, colEnd: 15 },
          { id: 'k4', show: 'static', text: '[FX ]', row: 4, colStart: 16, colEnd: 20 },
        ],
      }],
    },
  },

  /* --- 1. User-definable glyphs -------------------------------------------------------------- */
  //
  // The honest pair. "Now" is a real character LCD. "Proposed" is a PixelDisplay standing in for
  // one — 20×4 cells at the 6×8 character pitch — because a PixelDisplay is the only renderer here
  // that can place arbitrary 5×8 artwork in a cell, which is exactly the capability the character
  // LCD lacks and this proposal asks for.
  {
    id: 'glyphs-now',
    still: true,
    caption: 'Today: the bar is Unicode block characters, and there are no symbols at all',
    size: [440, 80],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {},
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      rows: 2,
      // No layouts, so `lines` is what renders. A mockup wants exact characters, not a link.
      lines: [
        // Exactly twenty columns: LEVEL(1-5) _ bar(7-14) _ -12dB(16-20). Longer and the LCD
        // truncates it, which is its own small lesson about designing for a fixed grid.
        'LEVEL █████▌   -12dB',
        'MIDI  CH 1   PRG 041',
      ],
      layouts: [],
      pages: { defaultLayoutId: '', selectorSourceId: '', selectorMap: [], overlays: [] },
    },
  },
  {
    id: 'glyphs-proposed',
    still: true,
    caption: 'With 8 CGRAM glyphs: a segmented bar with a baseline, and symbols no font carries',
    // 120×16 grid = 20 × 2 cells at the 6×8 character pitch, so this is a character LCD's geometry
    // exactly — only the cell contents are free. The box is sized so that grid lands on SQUARE
    // dots: 416px of screen across 120 columns is 3.47 each, so 16 rows need ~56px, not the 96 a
    // taller box would stretch them into.
    size: [440, 80],
    type: 'PixelDisplay',
    section: 'Pixel',
    sources: {},
    motion: {},
    data: {
      pixelsW: 120,
      pixelsH: 16,
      ...GREEN_STN,
      padding: 12,
      brightness: 100,
      contrast: 55,
      glow: 0.2,
      dotShape: 'round',
      showGhost: true,
      showGlass: true,
      backlightOn: true,
      layouts: [],
      pages: { defaultLayoutId: '', selectorSourceId: '', selectorMap: [], overlays: [] },
      elements: [
        { id: 't1', kind: 'static', text: 'LEVEL', x: 0, y: 0, w: 30, h: 8 },
        { id: 't2', kind: 'static', text: '-12dB', x: 90, y: 0, w: 30, h: 8 },

        // The bar sits cell-for-cell over the row above it: five full, one half, two empty. All
        // three glyphs are on show, and the baseline runs unbroken underneath — which is the part
        // Unicode blocks cannot do, because no block character carries a foot.
        ...[0, 1, 2, 3, 4].map((i) => cell(`b${i}`, 7 + i, 1, BAR_FULL)),
        cell('b5', 12, 1, BAR_HALF),
        cell('b6', 13, 1, BAR_EMPTY),
        cell('b7', 14, 1, BAR_EMPTY),

        // Row two: symbols doing the job words were doing — the other half of what eight user
        // glyphs buy, and the reason every real panel spends them.
        cell('i1', 1, 2, ICON_PLUG),
        { id: 't4', kind: 'static', text: 'CH 1', x: 12, y: 8, w: 24, h: 8 },
        cell('i2', 9, 2, ICON_NOTE),
        { id: 't5', kind: 'static', text: '041', x: 60, y: 8, w: 18, h: 8 },
        cell('i3', 16, 2, ICON_LEVEL),
        cell('m1', 18, 2, BAR_FULL),
        cell('m2', 19, 2, BAR_HALF),
        cell('m3', 20, 2, BAR_EMPTY),
      ],
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
    caption: 'EDIT — entered by pressing FLT, left by a timeout',
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
    caption: 'MENU — a list with a selection, which no current layout can express',
    size: [440, 190],
    type: 'LcdDisplay',
    section: 'Display',
    sources: {},
    motion: {},
    data: {
      ...CHAR_LCD,
      ...GREEN_STN,
      lines: [
        'MENU            1/3 ',
        '▶ MIDI CHANNEL     1',
        '  TRANSPOSE        0',
        '[BAK][ ▲ ][ ▼ ][OK ]',
      ],
      layouts: [],
      pages: { defaultLayoutId: '', selectorSourceId: '', selectorMap: [], overlays: [] },
    },
  },
];
