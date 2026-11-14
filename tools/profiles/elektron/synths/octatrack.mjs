// Elektron Octatrack: the CC mappings of its user manual (appendix C), the audio tracks' on a track's channel
// and the MIDI tracks' (MIDI mode) on the auto channel.

export default {
  id: 'elektron-octatrack',
  name: 'Elektron Octatrack',
  family: 'Octatrack',
  description: 'Elektron Octatrack sampler: the controllers its manual\'s MIDI control reference maps, the audio tracks\' on a track channel and the MIDI mode\'s on the auto channel.',
  document: { title: 'Octatrack User Manual, OS 1.40A', file: 'Octatrack-User-Manual_ENG-OS1.40A_220204.pdf', url: 'https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-User-Manual_ENG-OS1.40A_220204.pdf' },
  // `HEX DEC CTRL PARAMETER TRN REC`, in appendix C.
  read: 'ctrl',
  appendix: '^APPENDIX C: MIDI',
  // `C.8 MIDI MODE CTRL CHANGE MAPPINGS`: `While in MIDI mode and CC DIRECT CONNECT is deactivated,
  // the auto channel responds to the following CC messages.`
  // (The MKI's manual numbers it C.3; it is known by its title.)
  channels: [[/MIDI MODE CTRL CHANGE MAPPINGS/, 'autoChannel']],
  // A page of parameters each (playback, amp, LFO, the two effects); the MIDI mode's under its own.
  groupOf: (r) => `${/MIDI MODE/.test(r.section) ? 'MIDI Mode ' : ''}${/^(Playback|Amp|MIDI LFO|LFO|FX1|FX2|CC #\d+)\b/.exec(r.name)?.[1].replace(/^CC #\d+$/, 'CC') ?? 'Track'}`,
  variables: { autoChannel: 16 },
  unprinted: ['autoChannel'],
  settingOf: {
    autoChannel: 'AUTO CHANNEL (PROJECT > MIDI > CHANNELS)',
  },
  notes: [
    'A playback, amp, LFO or effect parameter is numbered (`Playback param #1`): what it sets depends on the machine or effect the track has, which the appendix does not say; the bracketed names are those it prints (`Amp param #1 (Attack)`).',
    'The MIDI mode\'s controllers take effect on the auto channel while CC DIRECT CONNECT is off; with it on, the Octatrack passes them to its MIDI output instead.',
  ],
};
