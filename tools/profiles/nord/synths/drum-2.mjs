// Nord Drum 2: the MIDI controller list of its user manual.

export default {
  id: 'nord-drum-2',
  name: 'Nord Drum 2',
  family: 'Drum',
  description: 'Nord Drum 2 drum synthesizer: every control of its manual\'s MIDI CC list.',
  document: { title: 'Nord Drum 2 User Manual, OS v3.0x, Edition F', file: 'Nord Drum 2 English User Manual v3.0x Edition F.pdf', url: 'https://www.nordkeyboards.com/wt/documents/145/Nord%20Drum%202%20English%20User%20Manual%20v3.0x%20Edition%20F.pdf' },
  pages: [32],
  // The list runs on in the page's right-hand column, which has no header of its own.
  read: { lists: [{ page: 32, from: 225, name: 278, number: 231, reversed: true }] },
  notes: ['The manual: Tone Pitch and Echo BPM are two controllers each, MSB and LSB, the LSB to be sent first; they are laid out as printed, one parameter each.'],
};
