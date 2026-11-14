// Dreadbox Murmux Adept: the CC list of its user manual.

export default {
  id: 'dreadbox-murmux-adept',
  name: 'Dreadbox Murmux Adept',
  family: 'Murmux',
  description: 'Dreadbox Murmux Adept synthesizer: every controller of its manual\'s CC list, with the values it shows.',
  document: { title: 'Murmux Adept User Manual', file: 'Murmux_Adept_User_Manual.pdf', url: 'https://dreadbox-fx.com/wp-content/uploads/2025/04/Murmux_Adept_User_Manual.pdf' },
  pages: [28],
  // A number, then `PARAMETERS  VALUE`; the note on POLY beside the header, above where the rows start.
  read: { columns: [{ name: 'cc', dx: 0 }, { name: 'name', dx: 70 }, { name: 'value', dx: 255 }], first: 0, top: 95, skip: /^PARAMETERS VALUE$/ },
  spreads: true,
  notes: ['The list prints each value as the instrument shows it (`[0 - 99]`, `[-99 - 99]`, `[SINE, TRI, SAW, RMP, SQR, RND]`) and does not say how the controller\'s 0 - 127 map to it. It is taken as the Artemis\'s list says its own are: spread over 0 - 127, a setting sent at the middle of its share. Try one on the instrument before relying on it.'],
};
