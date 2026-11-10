// Behringer WAVE: the MIDI chapter of its user manual — controllers, NRPNs, and the preset's bytes
// with the request for the edit buffer, so the sound playing can be read back.

export default {
  id: 'behringer-wave',
  name: 'Behringer WAVE',
  family: 'WAVE',
  description: 'Behringer WAVE 8-voice hybrid wavetable synthesizer: every sound parameter of its manual\'s MIDI chapter, both groups (A and B), sent as the controller or NRPN it prints, and read back from the edit buffer.',
  document: { title: 'WAVE User Manual', file: 'Manual_BE_0722-ABD_WAVE.pdf', url: 'https://cdn-media.empowertribe.com/2ee6f3a6dfad48bb85241add20b97f07/Manual_BE_0722-ABD_WAVE.pdf' },
  pages: [34, 35, 36, 37, 38],
  // The three tables, by their headers: `Control #  Range  Function  Transmit  Receive  Remarks`,
  // `MSB  LSB  14-bit  Parameter Name  Range  Notes`, `Byte  Group  Menu  Parameter Name  Range  Notes`.
  tables: [
    { kind: 'cc', header: ['Control', '#', 'Range', 'Function'], columns: ['cc', 'range', 'function', 'transmit', 'receive', 'remarks'] },
    { kind: 'nrpn', header: ['MSB', 'LSB', '14-bit'], columns: ['msb', 'lsb', 'hex', 'name', 'range', 'notes'] },
    { kind: 'preset', header: ['Byte', 'Group', 'Menu'], columns: ['byte', 'group', 'menu', 'name', 'range', 'notes'] },
  ],
  // Group A's and B's rows are the same but for these: each disagrees with the other group's row and
  // with the NRPN table, which agree. And the last semitone offset is printed `SEMIT V7` in both,
  // its notes `Voice 8 - Semi Offset`.
  fix: {
    22: { range: '0-9' },
    106: { range: '0-6' },
    31: { name: 'SEMIT V8' },
    82: { name: 'SEMIT V8' },
  },
  fixNotes: {
    22: 'A EO, printed 0-1: 0-9, as B\'s and the NRPN\'s',
    106: 'B SW, printed 0-3: 0-6, as A\'s and the NRPN\'s',
    31: 'A SEMIT V8, printed SEMIT V7 as byte 30 is, its notes Voice 8',
    82: 'B SEMIT V8, printed SEMIT V7 as byte 81 is, its notes Voice 8',
  },
  // The edit buffer: `F0 00 20 32 00 01 39 <dev> 74 07 F7`, answered `… 74 08 <version> D0 … D120
  // <checksum> F7`, the checksum (D0 + … + Dn) & 7F. The device ID is always 0 for the WAVE.
  sysex: { header: ['F0', '00', '20', '32', '00', '01', '39', '00'], request: ['74', '07'], dump: ['74', '08'], version: '00', size: 121 },
  // Bank Select (0, 32), the wheels and pedals, master volume, the NRPN controllers and the channel
  // mode messages are not sound settings.
  leaveOutCc: [0, 1, 6, 7, 11, 32, 64, 98, 99, 120, 121, 122, 123],
};
