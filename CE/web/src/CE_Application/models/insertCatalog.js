/**
 * The single source of truth for what a user can insert into a panel.
 *
 * Both insert surfaces build from this list — the icon rail's category
 * flyouts (which add per-type icons) and the menu bar's Insert menu. They
 * previously kept separate hand-written lists: the menu knew 11 of the 47
 * types, omitted Slider and Knob entirely, and shipped the internal TestBox.
 */
/**
 * An item may carry `overrides` — a section patch applied at insert time.
 *
 * That is what lets a PRESET be a catalog entry rather than a new controlType. Three of the
 * "remaining components" in the backlog turned out to be exactly this: a progress bar is a Meter in
 * determinate mode, a pitch wheel is a Ribbon in wheel style with a spring to centre, and the
 * vector shapes the Custom Component Designer already draws only needed surfacing. Minting a
 * controlType for each would have duplicated a working engine three times, and the design notes
 * themselves offer the preset — "its own entry if wanted, else a Meter preset".
 *
 * `id` distinguishes presets of one type from each other and from the plain type, for the recents
 * list and for search.
 */
export const INSERT_CATEGORIES = [
  {
    id: 'layout',
    label: 'Layout & Display',
    items: [
      { type: 'Background',   label: 'Background' },
      // Shape primitives. The backlog listed these as "partly exists — the Custom Component
      // Designer already added vector shapes; surface them as placeable decorative components",
      // and surfacing is all they needed: a Background IS a filled rectangle, and Corners turns it
      // into a circle or a rule. A `Shape` controlType would have been a second, worse Background.
      {
        id: 'Background:rect',
        type: 'Background',
        label: 'Rectangle',
        overrides: {
          Transform: { width: 120, height: 80 },
          Background: { _children: { Fill: { colour: 'FF2A2A32' }, Border: { enabled: true, thickness: 1, colour: 'FF3A3A44' } } },
        },
      },
      {
        // A circle, not an ellipse: a radius large enough to round a SQUARE is exact, and the same
        // radius on an oblong is a stadium. The default size is square for that reason, and
        // stretching it gives a stadium, which is a shape somebody may well want.
        id: 'Background:circle',
        type: 'Background',
        label: 'Circle',
        overrides: {
          Transform: { width: 90, height: 90 },
          Background: {
            _children: {
              Fill: { colour: 'FF2A2A32' },
              Border: { enabled: true, thickness: 1, colour: 'FF3A3A44' },
              Corners: { linked: true, radius: 999 },
            },
          },
        },
      },
      {
        id: 'Background:divider',
        type: 'Background',
        label: 'Divider / Line',
        overrides: {
          Transform: { width: 180, height: 2 },
          Background: { _children: { Fill: { colour: 'FF3A3A44' }, Border: { enabled: false } } },
        },
      },
      { type: 'Label',        label: 'Label' },
      { type: 'TextInput',    label: 'Text Input' },
      { type: 'Container',    label: 'Container' },
      { type: 'Group',        label: 'Group / Frame' },
      { type: 'TabContainer', label: 'Tabbed Container' },
      { type: 'ScrollArea',   label: 'Scroll Area' },
      { type: 'Image',        label: 'Image' },
      { type: 'LcdDisplay',   label: 'LCD Display' },
      { type: 'PixelDisplay', label: 'Pixel Display' },
      { type: 'Meter',        label: 'Meter' },
      {
        // A progress bar IS a meter that reads a known quantity rather than a live level: no peak
        // hold, no threshold zones, one flat fill. Same engine, different question.
        id: 'Meter:progress',
        type: 'Meter',
        label: 'Progress Bar',
        overrides: {
          Meter: {
            peakHold: false,
            segments: 0,
            gradient: false,
            zones: [{ from: 0, colour: 'FF5B9BD5' }],
            fillColour: 'FF5B9BD5',
            valueMin: 0,
            valueMax: 1,
            value: 0.35,
          },
        },
      },
    ],
  },
  {
    id: 'buttons',
    label: 'Buttons & Choices',
    items: [
      { type: 'MomentaryButton',  label: 'Momentary Button' },
      { type: 'ToggleButton',     label: 'Toggle Button' },
      { type: 'RadioButtonGroup', label: 'Radio Button Group' },
      { type: 'CyclicButton',     label: 'Cyclic Button' },
      { type: 'Combobox',         label: 'Combobox' },
      { type: 'Listbox',          label: 'Listbox' },
      { type: 'TimedButton',      label: 'Timed Button' },
      { type: 'OneShotButton',    label: 'One-Shot Button' },
    ],
  },
  {
    id: 'values',
    label: 'Values & Sliders',
    items: [
      { type: 'Slider',          label: 'Slider' },
      { type: 'Knob',            label: 'Knob' },
      { type: 'Range',           label: 'Range' },
      { type: 'Number',          label: 'Number' },
      { type: 'Crossfader',      label: 'Crossfader' },
      { type: 'Numpad',          label: 'Numpad' },
      { type: 'Ribbon',          label: 'Ribbon / Wheel' },
      {
        // Pitch wheel: bipolar, sprung to centre, wheel styling. The Ribbon already had all three
        // as settings; what was missing was somebody being able to find it.
        id: 'Ribbon:pitch',
        type: 'Ribbon',
        label: 'Pitch Wheel',
        overrides: {
          Ribbon: { style: 'wheel', bipolar: true, returnMode: 'center', returnValue: 0.5, returnRate: 12, value: 0.5 },
        },
      },
      {
        // Mod wheel: unipolar and it LATCHES. The difference between the two wheels is entirely
        // whether they spring back, which is why they are two presets of one component.
        id: 'Ribbon:mod',
        type: 'Ribbon',
        label: 'Mod Wheel',
        overrides: {
          Ribbon: { style: 'wheel', bipolar: false, returnMode: 'none', value: 0 },
        },
      },
      { type: 'Macro',           label: 'Macro' },
      { type: 'VectorJoystick',  label: 'Vector Joystick' },
      { type: 'CustomComponent', label: 'Custom Component' },
    ],
  },
  {
    id: 'modulation',
    label: 'Modulation & Routing',
    items: [
      { type: 'Envelope',      label: 'Envelope' },
      { type: 'Matrix',        label: 'Mod Matrix' },
      { type: 'Orbit',         label: 'Orbit Modulator' },
      { type: 'Looper',        label: 'Gesture Looper' },
      { type: 'Router',        label: 'Expression Router' },
      { type: 'Timbre',        label: 'Timbre Space' },
      { type: 'Turing',        label: 'Turing Modulator' },
      { type: 'Kinetic',       label: 'Kinetic Modulator' },
      { type: 'Constellation', label: 'Preset Constellation' },
      { type: 'Constraint',    label: 'Constraint Cell' },
    ],
  },
  {
    id: 'music',
    label: 'Music & Performance',
    items: [
      { type: 'Keyboard',   label: 'Keyboard' },
      { type: 'StepSequencer', label: 'Step Sequencer' },
      { type: 'ChordPad',   label: 'Chord Pad' },
      { type: 'Arp',        label: 'Arpeggiator' },
      { type: 'NoteRibbon', label: 'Ribbon Keyboard' },
      { type: 'DrumPads',   label: 'Drum Pads' },
      { type: 'Phrase',     label: 'Phrase Sequencer (note grid)' },
      { type: 'Recorder',   label: 'Phrase Recorder (record + loop notes)' },
      { type: 'Harmoniser', label: 'Harmoniser (one finger, full chord)' },
      { type: 'SplitZone',  label: 'Zone Splitter (keyboard split)' },
      { type: 'Setlist',    label: 'Setlist (scenes on a footswitch)' },
      { type: 'Transport',  label: 'Transport (master clock)' },
      { type: 'Panic',      label: 'Panic button' },
    ],
  },
];
