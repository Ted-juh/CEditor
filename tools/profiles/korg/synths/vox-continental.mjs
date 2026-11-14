// VOX Continental. VOX Continental MIDI Implementation, Revision 1.00 (2018.02.07): the control changes
// it recognises (2-1). A stage keyboard more than a synthesizer: its nine touch controllers, its
// pedals and two of its panel buttons, and its scenes by Program Change.

export default {
  id: 'korg-vox-continental',
  name: 'VOX Continental',
  family: 'VOX',
  description: 'VOX Continental (61 and 73), its touch controllers, pedals, panel buttons and scenes.',
  document: {
    title: 'VOX Continental MIDI Implementation',
    file: 'VOX_Continental_MIDIimp.txt',
    url: 'https://www.korg.com/us/support/download/manual/0/755/4233/',
  },
  noIdentity: 'the document prints the reply inline rather than as a table, with two member codes, 05 for the Continental 61 and 0E for the 73, and one profile serves both',
  groups: [
    ['Touch Controllers', /^Touch Controller \d$/],
    ['Pedals', /^(Expression|Hold|Sostenuto|Soft Pedal|Rotary Speed)\b/],
    ['Panel', /BUTTON$/],
    ['Mixer', /^(Volume|Pan)$/],
  ],
};
