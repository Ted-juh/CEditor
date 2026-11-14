// Hammond XK-1c: the MIDI INFORMATION appendix of its Owner's Manual (V1.00, 2013), linked from
// Hammond's Legacy SK page.

export default {
  id: 'hammond-xk-1c',
  name: 'Hammond XK-1c',
  family: 'XK',
  description: 'Hammond XK-1c portable organ: every global, patch and Leslie parameter its owner\'s manual gives an NRPN, and the drawbars by their controllers.',
  // A category the table prints over two rows' lines: `Upper` then `Registration`.
  categoryContinues: /^Registration$/,
  document: { title: 'XK-1c Owner\'s Manual (V1.00)', file: 'owners-manual-XK-1c-101613.pdf', url: 'https://hammondorganco.com/wp-content/uploads/2022/09/owners-manual-XK-1c-101613.pdf', linkedFrom: 'https://hammondorganco.com/legacy-sk', pages: [124, 132] },
};
