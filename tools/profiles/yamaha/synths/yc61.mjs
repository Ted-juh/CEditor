// Yamaha YC61: the MIDI data format of its owner's manual (pp. 63-64) and the MIDI Data Table (YC61)
// of the YC88/YC73/YC61 V2.00 supplementary manual (bulk dump blocks p. 13, parameter change tables
// pp. 14-17), which supersedes the owner's manual's. Every table laid out: the System, and the Live
// Set Sound with its four zones and its sections.
import { ycLayout } from './yc88-yc73.mjs';

export default ycLayout({
  id: 'yamaha-yc61',
  name: 'Yamaha YC61',
  description: 'Yamaha YC61 stage keyboard: every parameter change table of its V2.00 data list (System, the Live Set Sound with its zones and sections), identity, and Pull from the current sound.',
  manual: { title: 'YC61 Owner\'s Manual (C0)', file: 'VCN7200_YC61_owners_manual_En_C0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/4/1311174/VCN7200_YC61_owners_manual_En_C0.pdf' },
  bulkPage: 13,
  tablePages: [14, 15, 16, 17],
  // `dd: Device family number/code`, `YC61: 5CH 06H`.
  identityReply: ['F0', '7E', '7F', '06', '02', '43', '00', '41', '5C', '06', '00', '00', '00', '7F', 'F7'],
});
