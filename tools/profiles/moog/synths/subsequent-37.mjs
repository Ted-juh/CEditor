// Moog Subsequent 37: the MIDI CC table (pp. 53-55) and the NRPN chart (pp. 56-59) of its manual.
export const CC_TABLE = { kind: 'cc', columns: [['name', 'CONTROL/PARAMETER'], ['cc', 'MIDI CC #'], ['values', 'CC VALUE RANGE']], options: { valign: 'top' } };
export const NRPN_CHART = { kind: 'nrpn', columns: [['name', 'PARAMETER NAME'], ['count', 'VALUE RANGE'], ['nrpn', 'NRPN'], ['msb', 'NRPN MSB (CC 99)'], ['lsb', 'NRPN LSB(CC 98)']], options: { anchor: 'nrpn' } };

// The chart's value counts for NRPNs 486-490 do not fit their names (OSC 1 ON with 21 values, OSC 1
// LEVEL with 2, OSC 2 FREQUENCY with 3): printed a row out of step. FILTER RESONANCE prints none.
export const NRPN_MISPRINTS = [
  [/^OSC 2 DUO MODE \(NRPN|^OSC 2 FREQUENCY \(NRPN|^OSC 2 BEAT \(NRPN|^OSC 1 LEVEL \(NRPN|^OSC 1 ON \(NRPN/, 'its number of values printed out of step with the rows around it (OSC 2 DUO MODE with 16384, OSC 2 FREQUENCY with 3, OSC 2 BEAT and OSC 1 LEVEL with 2, OSC 1 ON with 21)'],
];

export const SUB37_NOTES = [
  'The CC table and the NRPN chart are both here: the panel sends CCs or NRPNs as its KNB NRPN/CC setting says, and the NRPN chart reaches every setting, the CCs only some. The NRPN parameters are grouped apart, `(NRPN)` after the group.',
  'When an LFO is synced, its rate controller (CC 3, CC 8) selects a clock division instead; the manual\'s table of those (p. 52) is not a setting of its own and is not read.',
];

export function groupOf(name, section, entry) {
  return entry.message.kind === 'nrpn' && entry.row.count !== undefined ? `${GROUP(name)} (NRPN)` : null;
}
const GROUP = (name) => [
  [/^ARP/, 'Arpeggiator'], [/^GLIDE/, 'Glide'], [/^LFO 1/, 'LFO 1'], [/^LFO 2/, 'LFO 2'], [/^MOD 1/, 'Mod 1'], [/^MOD 2/, 'Mod 2'],
  [/^(OSC|SUB OSC|NOISE|FB EXT)/, 'Oscillators'], [/^(F EG|FILTER EG)/, 'Filter EG'], [/^(A EG|AMP EG)/, 'Amp EG'], [/^FILTER/, 'Filter'],
].find(([re]) => re.test(name))?.[1] ?? 'Program';

export default {
  id: 'moog-subsequent-37',
  name: 'Moog Subsequent 37',
  family: 'Subsequent',
  description: 'Moog Subsequent 37 paraphonic analog synthesizer: the CC table and the NRPN chart of its manual.',
  documents: [{ title: 'Subsequent 37 Manual', file: 'Subsequent_37_Manual_0.pdf', url: 'https://cdn.inmusicbrands.com/Moog/Subsequent37/Subsequent_37_Manual_0.pdf' }],
  tables: [{ ...CC_TABLE, pages: [53, 54, 55] }, { ...NRPN_CHART, pages: [56, 57, 58, 59] }],
  skip: NRPN_MISPRINTS,
  groupOf,
  notes: SUB37_NOTES,
};
