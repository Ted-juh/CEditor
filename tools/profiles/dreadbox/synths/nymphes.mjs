// Dreadbox Nymphes: the CC list of its owner's manual, v2.0.

export default {
  id: 'dreadbox-nymphes',
  name: 'Dreadbox Nymphes',
  family: 'Nymphes',
  description: 'Dreadbox Nymphes six-voice analog synthesizer: every controller of its owner\'s manual\'s CC list, with the values it prints.',
  document: { title: 'Nymphes Owner\'s Manual v2.0', file: 'Nymphes_Owners-Manual-v2.0.pdf', url: 'https://cdn.shopify.com/s/files/1/0527/2557/9960/files/Nymphes_Owners-Manual-v2.0.pdf' },
  pages: [22, 23],
  // `PARAMETER  CC#  VALUE  NOTES`, the names centred; `Targets` over the mod source depths is a
  // heading, not a row's.
  read: { columns: [{ name: 'name', dx: 0 }, { name: 'cc', dx: 245 }, { name: 'value', dx: 283 }, { name: 'notes', dx: 330 }], first: 1, anchor: { column: 1, test: /^\d{1,3}$/ }, skip: /^(?:PARAMETER CC# VALUE NOTES|Targets|\d+)$/ },
  notes: ['The values are the controller\'s own, as the list prints them: a setting listed beside a range (`0-5  Poly/Uni-A/Uni-B/TRI/DUO/MONO`) is that value.', 'The Mod Source depths (CC 31 - 63, 86 - 89) set the depth of the modulation source chosen with Mod Source Selector, CC 30.'],
};
