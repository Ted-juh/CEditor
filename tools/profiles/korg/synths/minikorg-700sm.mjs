// miniKORG 700Sm. KORG miniKORG 700Sm MIDI Implementation, Revision 1.00 (2024.10.07): the control
// changes it recognises (2-1) and the ones it sends (1-1). Its NRPNs are the program name only.

export default {
  id: 'korg-minikorg-700sm',
  name: 'Korg miniKORG 700Sm',
  family: 'miniKORG',
  description: 'Korg miniKORG 700Sm, every control change in its MIDI Implementation.',
  document: {
    title: 'miniKORG 700Sm MIDI Implementation',
    file: 'miniKORG_700Sm_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/987/5366/',
  },
  sameLabels: {
    cc72: 'the transmit footnote prints the last as 2, without the foot mark the receive footnote gives it (2\')',
  },
  // The program dump names the panel's controls more fully than the controller list does.
  dumpNames: {
    'TRAVELER (Lower: HPF)': 'TRAVELER Lower Slider (HPF)', 'TRAVELER (Upper: LPF)': 'TRAVELER Upper Slider (LPF)',
    ATTACK: 'ATTACK/SLOW', PERCUSSION: 'SINGING/PERCUSSION', REVERB: 'REVERB Level',
    'VCO2 PITCH COARSE': 'VCO2 COARSE Tune', 'VCO2 PITCH FINE': 'VCO2 FINE Tune', 'VCO1 SCALE': 'SCALE',
    EXPAND: 'EXPAND Switch', BRIGHT: 'BRIGHT Switch', SUSTAIN: 'SUSTAIN Switch', 'SUSTAIN LONG': 'SUSTAIN LONG Switch',
    BENDER: 'BENDER Switch', HOLD: 'HOLD Switch', EFFECT: 'EFFECT Switch',
  },
  groups: [
    ['Oscillator 1', /^VCO1\s+/],
    ['Oscillator 2', /^VCO2\s+/],
    ['Filter', /^TRAVELER\b|^(BRIGHT|EXPAND)$/],
    ['Envelope', /^(ATTACK|PERCUSSION|SUSTAIN|SUSTAIN LONG)$/],
    ['Modulation', /^(REPEAT|VIBRATO|DELAY VIBRATO|TRAVEL VIBRATO)\b/],
    ['Effects', /^(REVERB|EFFECT)$/],
    ['Controllers', /^(Modulation[12]|PORTAMENTO|BENDER|HOLD|BALANCE)\b/],
  ],
};
