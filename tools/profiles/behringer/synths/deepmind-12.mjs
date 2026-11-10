// Behringer DeepMind 12: the NRPN table of its user manual (chapter 17), and the edit buffer dump of
// its SysEx chapter (19.2.4), whose program data is the same parameters, a byte each, in NRPN order.

const expand = (first, stem, count, from = 1) => Array.from({ length: count }, (u, k) => ({ value: first + k, label: `${stem}${from + k}` }));

export default {
  id: 'behringer-deepmind-12',
  name: 'Behringer DeepMind 12',
  family: 'DeepMind',
  description: 'Behringer DeepMind 12 12-voice analog polysynth: every parameter of its manual\'s NRPN table, sent as 14-bit NRPNs, and read back from the edit buffer.',
  document: { title: 'DeepMind 12 User Manual', file: 'M_BE_0722-AAA_DeepMind-12_WW.pdf', url: 'https://cdn-media.empowertribe.com/6957166d970349898f7b7699d5407a5e/M_BE_0722-AAA_DeepMind-12_WW.pdf' },
  pages: [136, 137, 138, 139],
  tables: [{ kind: 'nrpn', header: ['MSB', 'LSB', '14-bit'], columns: ['msb', 'lsb', 'number', 'name', 'range', 'notes'] }],
  build: 'nrpn',
  // Each envelope's curves are Attack, Decay, Sustain and then Attack again, where its Release Curve
  // belongs; FX 2's and 3's output gains are printed `—`, FX 1's and 4's 0-150, the notes `Output gain
  // for FX slots 1-4`; LFO 1's Mono Mode is printed 0-1, its notes and LFO 2's 0-255.
  fix: {
    61: { name: 'VCA Envelope Release Curve' },
    70: { name: 'VCF Envelope Release Curve' },
    79: { name: 'Mod Envelope Release Curve' },
    219: { range: '0-150' },
    220: { range: '0-150' },
    5: { range: '0-255' },
  },
  fixNotes: {
    61: 'printed VCA Envelope Attack Curve, as 58 is: Release Curve',
    70: 'printed VCF Envelope Attack Curve, as 67 is: Release Curve',
    79: 'printed Mod Envelope Attack Curve, as 76 is: Release Curve',
    219: 'FX 2 Output Gain, printed —: 0-150, as FX 1 and 4',
    220: 'FX 3 Output Gain, printed —: 0-150, as FX 1 and 4',
    5: 'LFO 1 Mono Mode, printed 0-1: 0-255, as its notes and LFO 2\'s',
  },
  // Value lists printed as a pattern rather than one by one.
  values: {
    5: () => [{ value: 0, label: 'Poly' }, { value: 1, label: 'Mono' }, ...expand(2, 'Spread-', 254)],
    12: () => [{ value: 0, label: 'Poly' }, { value: 1, label: 'Mono' }, ...expand(2, 'Spread-', 254)],
    162: () => [{ value: 0, label: 'None' }, ...expand(1, 'Preset-', 32), ...expand(33, 'User-', 32)],
  },
  groupOf: (name) => [
    [/^LFO (\d)/, (m) => `LFO ${m[1]}`], [/^OSC (\d)/, (m) => `OSC ${m[1]}`], [/^(?:OSC|Noise)/, () => 'OSC'],
    [/^(VCA|VCF|Mod) Envelope/, (m) => `${m[1]} Envelope`], [/^VCF/, () => 'VCF'], [/^VCA/, () => 'VCA'],
    [/^Mod \d/, () => 'Mod Matrix'], [/^(?:Ctrl Sequencer|Sequence|Sequencer|Seq|Key Sync & Loop|Slew Rate)/, () => 'Control Sequencer'],
    [/^Arp/, () => 'Arp'], [/^FX/, () => 'FX'], [/^Program/, () => 'Program'],
  ].reduce((found, [re, to]) => found ?? (re.exec(name) ? to(re.exec(name)) : null), null) ?? 'Voice',
  // `F0 00 20 32 20 <dev> 03 F7`, answered `F0 00 20 32 20 <dev> 04 06 <242 bytes packed into 278> F7`:
  // packed MS bit, the top bits of seven bytes first, in the eighth.
  sysex: { header: ['F0', '00', '20', '32', '20', '$deviceId'], request: ['03'], dump: ['04', '06'], size: 242, packedBytes: 278 },
  variables: { deviceId: 0 },
};
