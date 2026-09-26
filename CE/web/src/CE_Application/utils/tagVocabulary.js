// Tags for the library, in three families, and suggestions read from a preset's name.
//
// The vocabulary is CEditor's own. It exists so that tags people add tend to agree ("Bass",
// not "bass", "Basses" and "BS") and so the browser can offer a few likely ones. A suggestion is
// only ever offered, never applied: a name is a hint, and a library that tags itself wrongly is
// worse than one with no tags — the reason other products' ready-made tag data is not imported.

export const TAG_FAMILIES = [
  {
    id: 'instrument',
    label: 'Instrument',
    tags: ['Pad', 'Bass', 'Lead', 'Keys', 'Piano', 'Organ', 'Pluck', 'Bell', 'Strings', 'Brass',
      'Woodwind', 'Choir', 'Vocal', 'Arp', 'Sequence', 'Stab', 'Drum', 'Percussion', 'FX',
      'Drone', 'Texture', 'Guitar'],
  },
  {
    id: 'character',
    label: 'Character',
    tags: ['Warm', 'Bright', 'Dark', 'Soft', 'Hard', 'Clean', 'Dirty', 'Airy', 'Fat', 'Thin',
      'Wide', 'Evolving', 'Punchy', 'Glassy', 'Metallic', 'Analog', 'Digital', 'Lo-Fi'],
  },
  {
    id: 'style',
    label: 'Style',
    tags: ['Ambient', 'Cinematic', 'Techno', 'House', 'Trance', 'Hip-Hop', 'Pop', 'Retro', 'Chill'],
  },
];

const FAMILY_OF = new Map(TAG_FAMILIES.flatMap((f) => f.tags.map((t) => [t.toLowerCase(), f.id])));

/** Which family a tag belongs to ('instrument', 'character', 'style'), or 'other'. */
export function tagFamily(tag) {
  return FAMILY_OF.get(String(tag ?? '').trim().toLowerCase()) ?? 'other';
}

/** A tag as the vocabulary spells it, when it is one of ours ("bass" -> "Bass"). */
export function canonicalTag(tag) {
  const text = String(tag ?? '').trim();
  for (const family of TAG_FAMILIES)
    for (const known of family.tags)
      if (known.toLowerCase() === text.toLowerCase()) return known;
  return text;
}

// Words in a name that point at a tag. Matched as whole words, or as a word's start where the
// entry ends in '*'. Kept deliberately short and unambiguous: "air" is not "Airy" in "Air Horn".
const WORD_RULES = [
  ['pad*', 'Pad'], ['bass*', 'Bass'], ['sub', 'Bass'], ['lead*', 'Lead'],
  ['keys', 'Keys'], ['piano*', 'Piano'], ['rhodes', 'Keys'], ['wurli*', 'Keys'], ['ep', 'Keys'],
  ['organ*', 'Organ'], ['pluck*', 'Pluck'], ['bell*', 'Bell'], ['string*', 'Strings'],
  ['brass*', 'Brass'], ['horn*', 'Brass'], ['flute*', 'Woodwind'], ['reed*', 'Woodwind'],
  ['clarinet*', 'Woodwind'], ['oboe*', 'Woodwind'], ['choir*', 'Choir'], ['vox', 'Vocal'],
  ['vocal*', 'Vocal'], ['voice*', 'Vocal'], ['arp*', 'Arp'], ['seq*', 'Sequence'], ['stab*', 'Stab'],
  ['drum*', 'Drum'], ['kick*', 'Drum'], ['snare*', 'Drum'], ['perc*', 'Percussion'],
  ['fx', 'FX'], ['sfx', 'FX'], ['riser*', 'FX'], ['sweep*', 'FX'], ['impact*', 'FX'],
  ['drone*', 'Drone'], ['texture*', 'Texture'], ['atmo*', 'Texture'], ['guitar*', 'Guitar'],
  ['warm*', 'Warm'], ['bright*', 'Bright'], ['dark*', 'Dark'], ['soft*', 'Soft'], ['hard', 'Hard'],
  ['clean*', 'Clean'], ['dirty', 'Dirty'], ['distort*', 'Dirty'], ['airy', 'Airy'], ['fat', 'Fat'],
  ['thin', 'Thin'], ['wide*', 'Wide'], ['evolv*', 'Evolving'], ['punch*', 'Punchy'],
  ['glass*', 'Glassy'], ['metal*', 'Metallic'], ['analog*', 'Analog'], ['vintage', 'Analog'],
  ['digital', 'Digital'], ['lofi', 'Lo-Fi'], ['lo-fi', 'Lo-Fi'],
  ['ambient', 'Ambient'], ['cinematic', 'Cinematic'], ['film*', 'Cinematic'], ['epic', 'Cinematic'],
  ['techno', 'Techno'], ['house', 'House'], ['trance*', 'Trance'], ['hiphop', 'Hip-Hop'],
  ['hip-hop', 'Hip-Hop'], ['trap', 'Hip-Hop'], ['pop', 'Pop'], ['retro', 'Retro'], ['80s', 'Retro'],
  ['chill*', 'Chill'],
];

// Short prefixes sound designers put first ("BA Deep Sub", "LD Saw Stack"). Only as the FIRST
// word: "PL" in the middle of a name means nothing.
const PREFIX_RULES = new Map([
  ['ba', 'Bass'], ['bs', 'Bass'], ['ld', 'Lead'], ['pd', 'Pad'], ['pl', 'Pluck'], ['ky', 'Keys'],
  ['kb', 'Keys'], ['sq', 'Sequence'], ['sy', null], ['ar', 'Arp'], ['bl', 'Bell'], ['st', 'Strings'],
  ['fx', 'FX'], ['sfx', 'FX'], ['dr', 'Drum'], ['pc', 'Percussion'], ['tx', 'Texture'],
]);

function words(text) {
  return String(text ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')      // "WarmPad" -> "Warm Pad"
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
}

function tagsIn(text, { withPrefix = false } = {}) {
  const found = [];
  const list = words(text);
  if (withPrefix && list.length > 1 && PREFIX_RULES.get(list[0])) found.push(PREFIX_RULES.get(list[0]));
  for (const word of list)
    for (const [rule, tag] of WORD_RULES) {
      const matches = rule.endsWith('*') ? word.startsWith(rule.slice(0, -1)) : word === rule;
      if (matches) found.push(tag);
    }
  return found;
}

/** Tags a record probably deserves, from its name and category, that it does not have yet:
    [{ tag, family }], instrument first. Offered in the browser; never applied by themselves. */
export function suggestTags(record, max = 5) {
  const have = new Set((record?.tags ?? []).map((t) => String(t).toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const tag of [...tagsIn(record?.category), ...tagsIn(record?.name, { withPrefix: true })]) {
    const key = tag.toLowerCase();
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ tag, family: tagFamily(tag) });
  }
  const order = { instrument: 0, character: 1, style: 2, other: 3 };
  return out.sort((a, b) => order[a.family] - order[b.family]).slice(0, max);
}
