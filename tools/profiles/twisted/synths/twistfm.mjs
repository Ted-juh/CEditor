// Twisted Electrons TWISTfm: the MIDI IMPLEMENTATION of its web manual (MIDI Engine 3.0): the direct
// performance and main fader controllers, and the SysEx editor protocol's named parameters, with Pull
// from its GET_ALL.

export default {
  id: 'twisted-electrons-twistfm',
  name: 'Twisted Electrons TWISTfm',
  family: 'TWISTfm',
  description: 'Twisted Electrons TWISTfm FM synthesizer: its performance and fader controllers, and every parameter of its SysEx editor protocol, read back with GET_ALL.',
  document: { title: 'TWISTfm manual (web page)', file: 'te-manual-twistfm.html', url: 'https://www.twisted-electrons.com/pages/manual-twistfm', saved: '2026-11-11' },
  controllerTables: ['Direct Performance CCs', 'Main Fader CCs'],
  editor: { table: 'Editor SysEx Parameter Index', protocol: 'SysEx Editor Protocol', responses: 'SysEx Responses' },
};
