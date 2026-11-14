// Behringer PolyEight: the NRPN mappings of its user manual, and its SysEx preset parameter table
// for the value lists the NRPN table leaves out.

export default {
  id: 'behringer-polyeight',
  name: 'Behringer PolyEight',
  family: 'PolyEight',
  description: 'Behringer PolyEight 8-voice analog polysynth: every parameter of its manual\'s NRPN mappings, sent as 14-bit NRPNs, with the value lists the manual prints.',
  document: { title: 'PolyEight User Manual, Rev. 3 (2026-08-25)', file: 'Manual_BE_0722-ABA_POLYEIGHT_A4_WW_2026-08-25_Rev.3.pdf', url: 'https://cdn-media.empowertribe.com/2613103449a6763dc1be198e419d1e80/Manual_BE_0722-ABA_POLYEIGHT_A4_WW_2026-08-25_Rev.3.pdf' },
  build: 'nrpn-table',
  // Two printed pages to a sheet: the right one 580 points in. The NRPN mappings are PDF pages 17
  // (right) to 19 (left), `NRPN  HEX  DESCRIPTION  STORAGE  RANGE`, a row's description set over as
  // many lines as it needs around its number; the preset parameters are pages 20 and 21, `INDEX
  // PARAMETER NAME  TYPE  RANGE  DESCRIPTION  ENCODING`, their enum lists under the description.
  pages: [17, 18, 19, 20, 21],
  anchored: {
    rows: {
      pages: [17, 18, 19],
      read: { columns: [{ name: 'nrpn', dx: 58 }, { name: 'hex', dx: 161 }, { name: 'description', dx: 264 }, { name: 'storage', dx: 367 }, { name: 'range', dx: 470 }], split: 590, offset: 580, anchor: { column: 1, test: /^0[xX][0-9A-Fa-f]+$/ }, top: 70, skip: /^NRPN HEX DESCRIPTION/ },
    },
    flow: {
      pages: [20, 21],
      column: 'description',
      read: { columns: [{ name: 'index', dx: 58 }, { name: 'name', dx: 97 }, { name: 'type', dx: 197 }, { name: 'range', dx: 245 }, { name: 'description', dx: 301 }, { name: 'encoding', dx: 461 }], split: 590, offset: 580, first: 1, anchor: { column: 1, test: /^`?pre[A-Z]\w*`?$/ }, top: 70, skip: /^INDEX PARAMETER NAME/, below: true },
    },
  },
  tests: [
    { name: 'Filter cutoff frequency', value: 8192 },
    { name: 'VCO waveform selection', label: 'PWM' },
    { name: 'Arpeggiator step length', label: '1/16' },
  ],
  groupOf: (name) => [
    [/^(?:Portamento|Unison|Voice drift)/, 'Voice'], [/^Noise/, 'Mixer'], [/^Effect/, 'Effect'], [/^VCO/, 'VCO'],
    [/^Envelope generator/, 'EG'], [/^Gate envelope/, 'Gate EG'], [/^(?:Modulation generator|MG)/, 'MG'], [/^Filter/, 'VCF'],
    [/^VCA/, 'VCA'], [/^Bend/, 'Control'], [/^(?:Double preset|Chord note|Key assign|Keyboard|Lower preset|Upper preset)/, 'Keyboard'],
    [/^Modulation matrix bus (\d)/, 'Mod Matrix'], [/^Arpeggiator/, 'Arp'],
  ].find(([re]) => re.test(name))?.[1] ?? 'Sound',
};
