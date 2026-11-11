// Behringer JN-80: the MIDI CC table of its Quick Start Guide.
//
// The manual prints the same controllers without values; the guide prints the values, and one more
// (CC 36, VCF Resonance Factor), so the guide is read. Its table is four columns across a wide page,
// one header over the first only, a row's value list set under its number: the layout places the
// columns, and a line under a row is that row's.

const cols = [{ role: 'cc', dx: 0 }, { role: 'hex', dx: 34 }, { role: 'name', dx: 73 }, { role: 'range', dx: 162 }];

export default {
  id: 'behringer-jn-80',
  name: 'Behringer JN-80',
  family: 'JN',
  description: 'Behringer JN-80 8-voice analog polyphonic synthesizer: every controller of its quick start guide\'s MIDI CC table, with the values it prints.',
  document: { title: 'JN-80 Quick Start Guide', file: 'QSG_BE_0722-AAP_JN-80_WW.pdf', url: 'https://cdn-media.empowertribe.com/b22341b3f2674b608b4db82af7af6523/QSG_BE_0722-AAP_JN-80_WW.pdf' },
  pages: [12],
  // The four columns, from where their numbers start, below the page's running header; the fourth
  // stops at the NRPN table under it.
  read: { below: true, top: 85, tables: [52, 315, 632, 895].map((x) => ({ x, width: 258, cols, until: 'NRPNS' })) },
  // The NRPN table beside the controllers, under its `MIDI NRPNS` heading: `MSB  LSB  14-bit  Parameter
  // Name  Range  Scope  Notes`. Read here for the JN-80 NRPN profile (synths/jn-80-nrpn.mjs).
  nrpnTable: { top: 256, left: 885, read: { columns: [{ name: 'msb', dx: 895 }, { name: 'lsb', dx: 920 }, { name: 'number', dx: 942 }, { name: 'name', dx: 971 }, { name: 'range', dx: 1019 }, { name: 'scope', dx: 1059 }, { name: 'notes', dx: 1093 }] } },
  fix: { 16: { name: 'VCF Resonance' } },
  fixNotes: { 16: 'printed VCF Resonace' },
  leaveOut: { 66: 'the wheels, pedals, bank select, NRPN and RPN controllers and the channel mode messages' },
  groupOf: (name) => [[/^(?:Note Priority|Same Note|Voice|Detune)/, 'Voice'], [/^Porta/, 'Portamento'], [/Transpose/, 'Transpose'], [/^(?:ENV|Envelope)/, 'Envelope'], [/^(?:Aftertouch|Velocity|Bender|Mod Wheel|Expression)/, 'Control']].find(([re]) => re.test(name))?.[1],
  notes: ['The guide also prints an NRPN table: twenty of these parameters at 12 bits (0 - 4095), with their scale (`Approx. 10 Hz to 16000 Hz`). The behringer-jn-80-nrpn profile sends those as NRPNs; this one is the controllers.'],
};
