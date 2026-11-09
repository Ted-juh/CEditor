// S-1 (AIRA Compact). The MIDI implementation chart and Control change list in the S-1 Owner's
// Manual (version 1.02), p73-74. Each entry names the controller and then, in brackets, the panel
// control that edits it; the brackets become the parameter's description.
//
// Five entries print a waveform icon (the pulse and the sawtooth that label the oscillator's
// level knobs), which the text layer drops. Read from the rendered page: CC 15, 19 and 102 show the
// pulse, CC 20 and 107 the sawtooth.

const pulse = 'the manual prints the pulse-wave icon here (p74), which the text layer drops';
const saw = 'the manual prints the sawtooth icon here (p74), which the text layer drops';

export default {
  id: 'roland-s-1',
  name: 'Roland S-1',
  family: 'AIRA Compact',
  chart: 's-1',
  description: 'Roland AIRA Compact S-1 Tweak Synth, from the Control change list in its Owner\'s Manual.',
  documentTitle: 'Owner\'s Manual, Control change list',
  names: {
    15: { name: 'OSC PULSE WIDTH ([SHIFT] button + [PWM DEPTH] pad) ([SHIFT] +OSCILLATOR [PULSE] knob)', why: pulse },
    19: { name: 'OSC PULSE LEVEL (OSCILLATOR [PULSE] knob)', why: pulse },
    20: { name: 'OSC SAW LEVEL (OSCILLATOR [SAW] knob)', why: saw },
    102: { name: 'OSC DRAW MULTIPLY ([SHIFT] button + pad [5] (OSC DRAW): MULTIPLY) ([SHIFT] + OSCILLATOR [PULSE] knob)', why: pulse },
    107: { name: 'OSC DRAW SW ([SHIFT] button + pad [5] (OSC DRAW): SW) ([SHIFT] + OSCILLATOR [SAW] knob)', why: saw },
  },
  groups: [
    ['Oscillator', /^(OSC\s+|FINE TUNE$|NOISE MODE$)/],
    ['Filter', /^FILTER\s+/],
    ['Amp', /^AMP\s+/],
    ['Envelope', /^ENV\s+/],
    ['LFO', /^LFO\s+/],
    ['Chord', /^CHORD\s+/],
    ['Effects', /^(REVERB|DELAY)\s+|^CHORUS$/],
    ['Performance', /^(Modulation Wheel|Pan|Expression Pedal|Damper Pedal|PORTAMENTO|PORTAMENTO TIME|PORTAMENTO MODE|TRANSPOSE SW|POLY MODE)$/],
  ],
  presets: {
    banks: [{ id: 'tone', label: 'Tone', role: 'user', writable: false, startSlot: 0, slotCount: 64, programBase: 0 }],
    recall: { kind: 'pc' },
  },
};
