// Yamaha reface CS: its pages of the reface Data List (format p. 2-3, tables p. 4).
export const REFACE_DOC = { title: 'reface Data List (B0)', file: 'reface_en_dl_b0.pdf', url: 'https://usa.yamaha.com/files/download/other_assets/7/794817/reface_en_dl_b0.pdf' };
export const REFACE_NOTES = [
  'The reface sends and receives control changes for its panel only with MIDI Control on (the system setting); this profile edits by parameter change, which the data list prints for every setting, and does not map the control changes.',
];

export default {
  id: 'yamaha-reface-cs',
  name: 'Yamaha reface CS',
  family: 'reface',
  description: 'Yamaha reface CS virtual analog synthesizer: every parameter of its data list by parameter change, and Pull from its bulk dump.',
  documents: [REFACE_DOC],
  read: { formatPages: [2, 3], tablePages: [4], bulk: { page: 4, right: 300 } },
  pullName: 'toneGenerator',
  notes: REFACE_NOTES,
};
