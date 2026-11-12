// Bass Station II. Novation Bass Station II User Guide v5, its MIDI parameters list (pp. 71-74). Its
// headings sit centred over left-aligned cells, so the columns' starts are given here, in points.

export default {
  id: 'novation-bass-station-ii',
  name: 'Novation Bass Station II',
  family: 'Bass Station',
  description: 'Novation Bass Station II, every control change and NRPN in its user guide\'s MIDI parameters list that prints its range.',
  documents: [
    { title: 'Bass Station II User Guide v5', file: 'bass_station_ii_user_guide_v5_en.pdf', url: 'https://downloads.novationmusic.com/novation/synthesisers/bass-station-ii', pages: '71-74', columnStarts: { section: 70, parameter: 120, type: 280, number: 326, range: 372 } },
  ],
  // The section names the controller the rows below it assign (`Mod Wh`, as printed, and Aftertouch).
  prefixSection: /^(Mod Wh|Aftertouch|Velocity)$/,
  // The Other section's `mod  cc 0  0 to 127` and `sustain  cc 64`: CC 0 is MIDI's bank select (the
  // mod wheel is CC 1), so sending it would change banks; the sustain pedal is played, not set.
  skip: [[/^mod$/, 'the guide\'s `mod  cc 0`, which would be sent as MIDI\'s bank select (the mod wheel is CC 1; a misprint)'], [/^sustain$/, 'the sustain pedal']],
};
