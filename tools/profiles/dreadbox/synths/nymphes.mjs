// Dreadbox Nymphes: the CC list of its owner's manual, v2.0.

export default {
  id: 'dreadbox-nymphes',
  name: 'Dreadbox Nymphes',
  family: 'Nymphes',
  description: 'Dreadbox Nymphes six-voice analog synthesizer: every controller of its owner\'s manual\'s CC list, with the values it prints.',
  document: { title: 'Nymphes Owner\'s Manual v2.0', file: 'Nymphes_Owners-Manual-v2.0.pdf', url: 'https://cdn.shopify.com/s/files/1/0527/2557/9960/files/Nymphes_Owners-Manual-v2.0.pdf' },
  pages: [22, 23],
  // The file read is a copy with a text layer on a Shopify store whose owner is not established (the
  // same store serves Polyend's manuals). Dreadbox's own copy sets the CC list as images.
  ownCopy: {
    title: 'Nymphes User Manual V2.0',
    file: 'Nymhes_User_Manual.pdf',
    sha256: '2f321e1a883c54abdf87cb7373ce48e934887d403c69d8951228bb7ac9ed941d',
    url: 'https://dreadbox-fx.com/wp-content/uploads/2025/04/Nymhes_User_Manual.pdf (dreadbox-fx.com/support/)',
    read: 'That file is a copy of the manual with a text layer, on a Shopify store not established to be Dreadbox\'s; Dreadbox\'s own copy is the next source.',
    compared: 'Its CC list (PDF pages 22 and 23) is set as images, so it was not read; the two copies\' pages were rendered side by side and compared row by row, and every row is the same.',
  },
  // `PARAMETER  CC#  VALUE  NOTES`, the names centred; `Targets` over the mod source depths is a
  // heading, not a row's.
  read: { columns: [{ name: 'name', dx: 0 }, { name: 'cc', dx: 245 }, { name: 'value', dx: 283 }, { name: 'notes', dx: 330 }], first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, skip: /^(?:PARAMETER CC# VALUE NOTES|Targets|\d+)$/ },
  notes: ['The values are the controller\'s own, as the list prints them: a setting listed beside a range (`0-5  Poly/Uni-A/Uni-B/TRI/DUO/MONO`) is that value.', 'The Mod Source depths (CC 31 - 63, 86 - 89) set the depth of the modulation source chosen with Mod Source Selector, CC 30.'],
};
