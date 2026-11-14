// Hammond SK1 and SK2: the MIDI INFORMATION appendix of their Owner's Manual (V1.50, 2013), linked
// from Hammond's Legacy SK page.

export default {
  id: 'hammond-sk1-sk2',
  name: 'Hammond SK1 / SK2',
  family: 'SK',
  description: 'Hammond SK1 and SK2 stage keyboards: every global, patch and Leslie parameter its owner\'s manual gives an NRPN, and the drawbars by their controllers.',
  // A category the table prints over two rows' lines: `Upper` then `Registration`.
  categoryContinues: /^Registration$/,
  document: { title: 'Sk1 / Sk2 Owner\'s Manual (V1.50)', file: 'OM-SKseries-1.pdf', url: 'https://hammondorganco.com/wp-content/uploads/2022/09/OM-SKseries-1.pdf', linkedFrom: 'https://hammondorganco.com/legacy-sk', pages: [140, 148] },
};
