// Hammond SKX: the MIDI INFORMATION appendix of its Owner's Manual (V1.01, 2018), linked from
// Hammond's Legacy SK page.

export default {
  id: 'hammond-skx',
  name: 'Hammond SKX',
  family: 'SK',
  description: 'Hammond SKX dual-manual stage keyboard: every global, patch and Leslie parameter its owner\'s manual gives an NRPN, and the drawbars by their controllers.',
  // A category the table prints over two rows' lines: `Upper` then `Registration`.
  categoryContinues: /^Registration$/,
  document: { title: 'Skx Owner\'s Manual (V1.01)', file: 'SKX-Owners-Manual-1.pdf', url: 'https://hammondorganco.com/wp-content/uploads/2022/09/SKX-Owners-Manual-1.pdf', linkedFrom: 'https://hammondorganco.com/legacy-sk', pages: [140, 148] },
};
