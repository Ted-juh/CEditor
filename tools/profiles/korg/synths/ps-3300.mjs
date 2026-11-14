// PS-3300. KORG PS-3300 MIDI Implementation, Revision 1.00 (2026.06.18), in single channel mode: the
// PSU-3302's switches and levels on control changes, and each of the three PSU-3301 synthesizer
// units' settings by NRPN, the MSB picking the unit (*2: 0~2 = RIGHT, CENTER, LEFT) and the LSB the
// setting (*3). In multi channel mode the same settings are control changes on a channel per unit,
// which this profile does not send.

const UNITS = ['RIGHT', 'CENTER', 'LEFT'];

// The program dump names some unit settings otherwise than the NRPN table does.
const DUMP_NAMES = {
  'SIGNAL GENERATORS : WAVE FORM': 'VCO WAVE',
  'SIGNAL GENERATORS : SCALE': 'VCO SCALE',
  'SIGNAL GENERATORS : FREQUENCY MODULATION REVERSE': 'VCO MOD REVERSE',
  'SIGNAL GENERATORS : FREQUENCY MODULATION ON': 'VCO MOD Off/On',
  'DYNAMIC LP FILTERS : CUT OFF FREQ MODULATION ON': 'VCF MOD Off/On',
  'RESONATORS : PEAK FREQ MODULATION BY MG2 ON': 'PEAK FREQ MOD Off/On',
  'AMPLITUDE MODULATION ON': 'AMPLITUDE MOD Off/On',
  'MODULATION GENERATOR : MG1 FREQUENCY': 'MG1 FREQUENCY',
  'MODULATION GENERATOR : MG2 FREQUENCY': 'MG2 FREQUENCY',
  'MODULATION GENERATOR : MG1 WAVEFORM': 'MG1 WAVE',
};

export default {
  id: 'korg-ps-3300',
  name: 'Korg PS-3300',
  family: 'PS',
  description: 'Korg PS-3300 (2026), the PSU-3302 by control change and each of its three PSU-3301 units by NRPN, with its program dump.',
  document: {
    title: 'PS-3300 MIDI Implementation',
    file: 'PS-3300_MIDIImp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/991/5695/',
  },
  dumpNames: {
    'PSU-3302 : SWITCH : CHANNEL 1 SIGNAL': 'PSU-3302 : SWITCH : CH-1 SIGNAL',
    'PSU-3302 : SWITCH : CHANNEL 2 SIGNAL': 'PSU-3302 : SWITCH : CH-2 SIGNAL',
    'PSU-3302 : SWITCH : CHANNEL 3 SIGNAL': 'PSU-3302 : SWITCH : CH-3 SIGNAL',
    'PSU-3302 : CHANNEL 1 VOLUME': 'PSU-3302 : CH-1 VOLUME',
    'PSU-3302 : CHANNEL 2 VOLUME': 'PSU-3302 : CH-2 VOLUME',
    'PSU-3302 : CHANNEL 3 VOLUME': 'PSU-3302 : CH-3 VOLUME',
    ...Object.fromEntries(UNITS.flatMap((unit) => Object.entries(DUMP_NAMES).map(([nrpn, dump]) => [`PSU-3301 ${unit} : ${nrpn}`, `PSU-3301 ${unit} : ${dump}`]))),
  },
  groups: [
    ['PSU-3302', /^PSU-3302 : /],
    ['PSU-3301 Right', /^PSU-3301 RIGHT : /],
    ['PSU-3301 Center', /^PSU-3301 CENTER : /],
    ['PSU-3301 Left', /^PSU-3301 LEFT : /],
    ['Performance', /^DAMPER$/],
  ],
};
