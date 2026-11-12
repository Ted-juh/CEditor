// Waldorf Blofeld (desktop and keyboard): its System Exclusive Specifications, software release 1.04,
// laid out in full. Every sound parameter (index 0 - 382, the same as its offset in the sound dump) is
// sent as a Sound Parameter Change to the Sound mode edit buffer, and Pull asks for that edit buffer's
// sound dump.

export default {
  id: 'waldorf-blofeld',
  name: 'Waldorf Blofeld',
  family: 'Blofeld',
  description: 'Waldorf Blofeld synthesizer (desktop and keyboard): every sound parameter of its SysEx specification, sent to the Sound mode edit buffer, with identity and Pull from that edit buffer.',
  document: { title: 'Blofeld System Exclusive Specifications, software release 1.04', file: 'Blofeld_sysex_v1_04.pdf', url: 'https://downloads.waldorfmusic.com/cloud/index.php/s/ybExJgT4TzqT8ir/download/Blofeld_sysex_v1_04.pdf' },
  // Rows the reader cannot split: the tab between value and name collapsed to a space.
  rows: {
    317: { value: 'Up,Down,Alt Up,Alt Down', name: 'Arpeggiator Direction' },
  },
  // `16..112 128'..1/2' Osc 1 Octave, in steps of 12`: nine octaves, 16 to 112 by 12.
  choices: Object.fromEntries([1, 17, 33].map((i) => [i, ["128'", "64'", "32'", "16'", "8'", "4'", "2'", "1'", "1/2'"].map((label, k) => ({ value: 16 + 12 * k, label }))])),
  names: { 1: 'Osc 1 Octave', 17: 'Osc 2 Octave', 33: 'Osc 3 Octave' },
  // A parameter's group, from its name.
  groups: [
    [/^Osc (\d)/, 'Oscillator $1'],
    [/^Osc Pitch/, 'Oscillators'],
    [/^(Glide|Unisono|Allocation)/, 'Common'],
    [/^Mixer/, 'Mixer'],
    [/^Filter Envelope/, 'Filter Envelope'],
    [/^Filter (\d)/, 'Filter $1'],
    [/^Filter Routing/, 'Filters'],
    [/^Amplifier Envelope/, 'Amplifier Envelope'],
    [/^Amplifier/, 'Amplifier'],
    [/^Effect (\d)/, 'Effect $1'],
    [/^LFO (\d)/, 'LFO $1'],
    [/^Envelope (\d)/, 'Envelope $1'],
    [/^Modifier (\d)/, 'Modifier $1'],
    [/^Modulation (\d+)/, 'Modulation $1'],
    [/^(Arpeggiator|Arp )/, 'Arpeggiator'],
    [/^(Name|Category)/, 'Sound'],
  ],
  // The SNDR the spec prints: `F0h, 3Eh, 13h, DEV, 00h, BB, NN, CHK, F7`.
  notes: [
    'The Blofeld\'s spec prints the sound request\'s checksum byte in its format line and leaves it out of the table beneath; the Microwave 2\'s, its ancestor, prints it as (BB+NN) & 7F, which for the edit buffer (7F 00) is 7F, the value the spec says is always accepted. The request carries it.',
    'In Multi mode the same parameter change reaches instrument 1\'s sound (location 00); the other instruments (01 - 0F) are not laid out.',
    'The global parameters (GLBD) have no parameter change, and are not laid out.',
    'Read through this profile, Waldorf\'s Blofeld factory sounds (2008 and 2012, 2,048 sounds) all match the sound dump and pass its checksum. A few hold values neither the spec nor the manual lists: modulation destinations 54 - 57 (29 times, in slots 9 - 16 only; both documents stop at 53, M4 Amount), oscillator octaves between the steps of 12 (e.g. 47, 102), and envelope mode bytes 64 and 47 (8 times). A Pull of such a sound shows the number. Two of the 2012 sounds have a 02 byte in their names, read as ?.',
  ],
};
