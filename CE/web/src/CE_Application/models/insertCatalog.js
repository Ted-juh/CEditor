/**
 * The single source of truth for what a user can insert into a panel.
 *
 * Both insert surfaces build from this list — the icon rail's category
 * flyouts (which add per-type icons) and the menu bar's Insert menu. They
 * previously kept separate hand-written lists: the menu knew 11 of the 47
 * types, omitted Slider and Knob entirely, and shipped the internal TestBox.
 */
export const INSERT_CATEGORIES = [
  {
    id: 'layout',
    label: 'Layout & Display',
    items: [
      { type: 'Background',   label: 'Background' },
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
      { type: 'ProgressBar',  label: 'Progress Bar' },
      { type: 'Shape',        label: 'Shape' },
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
      { type: 'Ribbon',          label: 'Ribbon' },
      { type: 'PitchWheel',      label: 'Pitch Wheel' },
      { type: 'ModWheel',        label: 'Mod Wheel' },
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
