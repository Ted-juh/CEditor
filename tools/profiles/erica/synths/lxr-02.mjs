// Erica Synths LXR-02: the MIDI CC and NRPN lists of its owner's manual.

export default {
  id: 'erica-lxr-02',
  name: 'Erica Synths LXR-02',
  family: 'LXR',
  description: 'Erica Synths LXR-02 six-voice digital drum synthesizer: every controller of its owner\'s manual\'s MIDI CC list and every parameter of its NRPN list.',
  document: { title: 'LXR-02 Owner\'s Manual', file: 'LXR_manual_2_copy.pdf', url: 'https://www.ericasynths.lv/service/file/download/product_id/754/file_id/416/ (the manual on https://www.ericasynths.lv/drum-synthesizer-lxr-02-1132/)' },
  pages: [35, 36, 37, 38],
  read: 'lists',
  inbound: 'the instrument sends controllers where its MIDI filter (mtx) lets Control Change through',
  notes: [
    'The controllers answer on the global MIDI channel (the channel variable); each voice\'s own channel, set beside it, is for its notes.',
    'An NRPN is sent as the list\'s own controllers say: CC 99 (NRPN coarse) the number\'s upper half, always 0 here, CC 98 (NRPN fine) the number, CC 6 (NRPN data entry) the value.',
  ],
};
