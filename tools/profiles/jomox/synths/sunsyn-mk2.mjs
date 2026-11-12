// Jomox SunSyn Mk2: the MIDI implementation of its manual, linked from Jomox's support page for it.

export default {
  id: 'jomox-sunsyn-mk2',
  name: 'Jomox SunSyn Mk2',
  family: 'SunSyn',
  description: 'Jomox SunSyn Mk2 polysynth: the sound parameters of its MIDI implementation.',
  document: { title: 'SunSyn Mk2 MIDI Implementation', file: 'SunSyn_MidiImplementation.pdf', url: 'https://www.jomox.de/upload/manuals/SunSyn_MidiImplementation.pdf', linkedFrom: 'https://www.jomox.de/support.php?lang=2&product_id=14', pages: [1, 4] },
  // The switch list of CC 88 that follows the table (`swctrl0  0= vco_sync`, …) is another shape.
  stop: /^Switch Controller CC 88/,
};
