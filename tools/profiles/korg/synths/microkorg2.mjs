// microKORG2. microKORG 2 MIDI Implementation, Revision 1.0 (2024.05.10): the panel's control changes
// (*3, Parameter Edit) and its NRPNs (*4), both printed in hex with what each value means.

export default {
  id: 'korg-microkorg2',
  name: 'Korg microKORG2',
  family: 'microKORG',
  description: 'Korg microKORG2, every control change and NRPN its MIDI Implementation lists for editing.',
  document: {
    title: 'microKORG 2 MIDI Implementation',
    file: 'microKORG2_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/944/5341/',
  },
  hexValues: true,
  groups: [
    ['Oscillator 1', /^OSC1\s+/],
    ['Oscillator 2', /^OSC2\s+/],
    ['Oscillator 3', /^OSC3\s+/],
    ['Mixer', /^(Noise|OSC\d Level)\b/],
    ['Filter', /^Filter\s+/],
    ['Amp', /^(Amp\s+|Timbre (Level|Pan))/],
    ['LFO 1', /^LFO1\s+/],
    ['LFO 2', /^LFO2\s+/],
    ['Patch', /^Patch\s*\d/],
    ['EQ', /^EQ\s+/],
    ['Effects', /^(Mod|Delay|Reverb)\s+/],
    ['Arpeggiator', /^Arpeggiator\s+/],
    ['Voice', /^(Unison|Timbre|Portamento|Voice)\b/],
  ],
};
