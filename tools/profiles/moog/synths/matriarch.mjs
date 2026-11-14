// Moog Matriarch: the MIDI CC mapping (pp. 74-75 as printed) and the global parameters it edits by
// SysEx (pp. 76-79), which it also answers a request for, one parameter at a time.
import { MSB_LSB_TABLE } from './subsequent-25.mjs';

export default {
  id: 'moog-matriarch',
  name: 'Moog Matriarch',
  family: 'Matriarch',
  description: 'Moog Matriarch semi-modular analog synthesizer: the MIDI CC mapping of its manual, and its global settings by SysEx, read back one at a time.',
  documents: [{ title: 'Matriarch Manual (01/2023)', file: 'Matriarch_Manual_012023.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Matriarch/Matriarch_Manual_012023.pdf' }],
  tables: [
    { ...MSB_LSB_TABLE, pages: [74, 75] },
    { kind: 'sysex', pages: [76, 77, 78, 79], columns: [['id', 'Parameter ID'], ['name', 'Parameter Name'], ['values', 'Values']], options: { anchor: 'id' } },
  ],
  skip: [[/^Portamento Control/, 'a note number to tie to, not a setting']],
  // `F0 04 17 23 [Parameter ID], [value MSB], [value LSB], 00 00 00 00 00 00 00 00 [Unit ID] F7`; the
  // request `F0 04 17 3E [Parameter ID] 00 … 00 [Unit ID] F7` is answered with the set message, the
  // byte before the Unit ID (byte 14) set to 1.
  sysex: {
    table: 1,
    group: 'Global',
    set: ['F0', '04', '17', '23', '$id', '$encodedValue', '00', '00', '00', '00', '00', '00', '00', '00', '$unitId', 'F7'],
    request: ['F0', '04', '17', '3E', '$id', '00', '00', '00', '00', '00', '00', '00', '00', '00', '00', '$unitId', 'F7'],
    replyPrefix: ['F0', '04', '17', '23', '$id'],
    valueOffset: 5,
    replyMarker: 14,
    skip: [[/^Unit ID$/, 'the Unit ID every one of these messages is addressed by']],
  },
  variables: { unitId: 127 },
  notes: [
    'The SysEx messages go to Unit ID 7F, which the manual says addresses any Unit ID; set the unitId variable to address one Matriarch among several.',
    'A global setting is read back by asking for it alone: the Matriarch answers with its set message, the byte before the Unit ID set to 1 so that it is not taken for a command if echoed back.',
  ],
  coverage: { editBufferDumpRequest: 'partial: a request per global setting', editBufferDumpParse: 'partial: the global settings, one reply each' },
};
