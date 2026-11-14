// Tasty Chips Arduino Piggyback: the MIDI in table of its web manual.

export default {
  id: 'tasty-chips-arduino-piggyback',
  name: 'Tasty Chips Arduino Piggyback',
  family: 'Piggyback',
  description: 'Tasty Chips Arduino Piggyback synthesizer shield: the six controllers of its manual\'s MIDI in table.',
  form: 'page',
  table: 'MIDI in',
  document: { title: 'Arduino Piggyback synthesizer manual (web page)', file: 'tc-arduino-piggyback-manual.html', url: 'https://www.tastychips.nl/sample-page/arduino-piggyback-synthesizer-manual/', linkedFrom: 'https://www.tastychips.nl/legacy-products-2/', saved: '2026-11-11' },
  // "By default, the Piggy responds to MIDI channel 1", changed by a constant in its source.
  // The table's `*`: "*) Firmware 1.2 onwards".
  footnote: 'firmware 1.2 onwards',
  inbound: 'none: the page gives the Piggy MIDI in and MIDI thru only',
};
