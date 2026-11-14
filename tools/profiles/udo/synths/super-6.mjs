// UDO Super 6: the MIDI specifications of its owner's manual.

const CC = [{ name: 'nav', dx: 0 }, { name: 'cc', dx: 160 }, { name: 'range', dx: 203 }, { name: 'name', dx: 330 }];
const NRPN = [{ name: 'nav', dx: 0 }, { name: 'nrpn', dx: 160 }, { name: 'msb', dx: 203 }, { name: 'lsb', dx: 268 }, { name: 'range', dx: 332 }, { name: 'name', dx: 445 }];

export default {
  id: 'udo-super-6',
  name: 'UDO Super 6',
  family: 'Super',
  description: 'UDO Super 6 binaural polysynth (keyboard and desktop): every parameter of its manual\'s MIDI specifications, as its 14-bit NRPN where it has one, as its controller where not.',
  document: { title: 'UDO Super 6 Owner\'s Manual', file: '66e4297ca75f0eb7e730884b_UDO_Super6_Manual.pdf', url: 'https://cdn.prod.website-files.com/641dd1a703957e750da6b5e3/66e4297ca75f0eb7e730884b_UDO_Super6_Manual.pdf' },
  pages: [121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132],
  read: {
    cc: { pages: [121, 122, 123, 124, 125, 126, 127], columns: CC, first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, until: /Registered Parameter Numbers/, skip: /CC #\s*Value Range|Continuous Controller Messages|table below|mapped to the|and\/or received|\(see page/ },
    nrpn: { pages: [128, 129, 130, 131, 132], columns: NRPN, first: 1, anchor: { column: 1, test: /^\d{4}$/ }, skip: /NRPN (?:MSB|Value)|\(CC#? ?9[89]\)|(?:Global|Patch-Related) Parameters|Non-Registered|table below|are mapped|These messages|configuration in/ },
  },
};
