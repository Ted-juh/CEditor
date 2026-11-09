// JP-08 (Boutique). MIDI Implementation Chart, version 1.01, Aug. 03, 2016.
//
// The JP-08 is two parts, Upper and Lower. Chart note *1: "The control changes of the Lower part
// are transmitted and received on the channel that is one higher (+1) than the specified channel.
// However, if channel 16 is specified, the Lower part uses channel 1." Every row marked *1 is
// therefore two parameters here, Upper on `channel` and Lower on `lowerChannel`. The engine reads
// a channel from a variable, not from arithmetic, so `lowerChannel` is set beside `channel` and
// must be kept one above it (or 1 when channel is 16).
//
// The second chart in the document is the JP-08's Control Mode (it sends, as a controller, CCs
// laid out for the JUPITER-8's own interface); it is not what the JP-08 receives.

export default {
  id: 'roland-jp-08',
  name: 'Roland JP-08',
  family: 'Boutique',
  chart: 'jp-08',
  description: 'Roland Boutique JP-08 (JUPITER-8 model), from the control changes in its MIDI Implementation Chart. Upper and Lower parts.',
  variables: { channel: 1, lowerChannel: 2 },
  parts: {
    mark: '1',
    list: [
      { id: 'upper', name: 'Upper', channel: '$channel' },
      { id: 'lower', name: 'Lower', channel: '$lowerChannel' },
    ],
  },
  groups: [
    ['VCO Modulator', /^VCO MOD\s+/],
    ['VCO-1', /^VCO-1\s+/],
    ['VCO-2', /^VCO-2\s+/],
    ['VCO', /^SOURCE MIX$/],
    ['HPF', /^HPF\s+/],
    ['VCF', /^VCF\s+/],
    ['VCA', /^VCA\s+/],
    ['ENV-1', /^ENV-1\s+/],
    ['ENV-2', /^ENV-2\s+/],
    ['LFO', /^LFO\s+/],
    ['Delay', /^DELAY\s+/],
    ['Performance', /^(MODULATION|PORTAMENTO|PORTAMENTO TIME|EXPRESSION PEDAL|HOLD|BEND RANGE)$/],
    ['Common', /^(DUAL SWITCH|CURRENT PART|ASSIGN MODE)$/],
  ],
  presets: {
    banks: [
      { id: 'patch', label: 'Patch', role: 'user', writable: false, startSlot: 0, slotCount: 64, programBase: 0 },
      { id: 'patch-preset', label: 'Patch Preset', role: 'factory', writable: false, startSlot: 64, slotCount: 8, programBase: 64 },
    ],
    recall: { kind: 'pc' },
  },
  notes: [
    'Lower part: the chart sends its controllers one channel above the Upper part\'s (channel 16 wraps to 1). Set lowerChannel to match.',
    'Program Change 0-63 selects a Patch and 64-71 a Patch Preset (chart, Program Change remarks).',
  ],
};
