// Gamechanger Audio Bigsby Pedal: its CC and PC map, linked from Gamechanger's downloads page.

export default {
  id: 'gamechanger-bigsby',
  name: 'Gamechanger Audio Bigsby Pedal',
  family: 'Bigsby',
  description: 'Gamechanger Audio Bigsby Pedal: every controller of its CC map, the MSB and LSB pairs as 14-bit values.',
  form: 'addresses',
  document: { title: 'Bigsby Pedal CC & PC map', file: 'BIGSBY-MANUAL-CC-PC-MAP-desktop-read.pdf', url: 'https://gamechangeraudio.com/wp-content/uploads/2022/04/BIGSBY-MANUAL-CC-PC-MAP-desktop-read.pdf', linkedFrom: 'https://gamechangeraudio.com/downloads/', pages: [1, 1] },
  notes: ['The map sets the pedal\'s position three ways: CC 27 in 7 bits, CC 28 and 60 in 14, and the pitch wheel; and the EXP output\'s override value two (CC 105, CC 26 and 58). Each is laid out as printed. Its program changes (loading and saving the ten preset slots, the pitch ranges, the EXP override and more) are not laid out.'],
};
