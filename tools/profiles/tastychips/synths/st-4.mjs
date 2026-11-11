// Tasty Chips ST-4: the MIDI commands of its web manual, each track's on its own channel.

export default {
  id: 'tasty-chips-st-4',
  name: 'Tasty Chips ST-4',
  family: 'ST4',
  description: 'Tasty Chips ST-4 hybrid synth tracker: every control change of its manual\'s MIDI commands, for each of its four tracks and for all of them at once.',
  form: 'page',
  table: 'MIDI commands',
  document: { title: 'ST4 user\'s manual (web page)', file: 'tc-st4-users-manual.html', url: 'https://www.tastychips.nl/st4-users-manual/', linkedFrom: 'https://www.tastychips.nl/legacy-products-2/', saved: '2026-11-11' },
  // "MIDI input on MIDI channels 1 through 4 to directly control its tracks … channel 5 (all tracks)".
  tracks: [1, 2, 3, 4].map((n) => ({ label: `Track ${n}`, channel: n })),
  all: { label: 'All tracks', channel: 5 },
  actions: /^record sample$/,
  inbound: 'none: the page says the ST-4 sends notes and beat clock only',
  notes: ['The page gives vco mod CC 0, which MIDI otherwise reserves for bank select; it is laid out as printed.'],
};
