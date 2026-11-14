// build-novation-dump.mjs — Pull for a Novation profile, where the programmer's reference prints the
// request, the reply and the patch format (the Circuit Tracks').
//
// The request names a location (`00 / 01`: Synth 1, Synth 2), and so does the reply, so a part with
// a `location` in the layout gets a request and a dump definition of its own, matched on that byte.
// The reply's data is plain 7-bit bytes, one setting a byte, or several flags in one by bit
// (`LFO1_OneShot (bit 0), …, LFO1_FadeMode (bits 4-5)`). A byte is read into the part's parameter of
// the same name: the patch format writes `Envelope1_Attack` where the MIDI table writes `env 1 attack`
// under Envelope, so names are compared as words, a few spelt alike (envelope/env, equaliser/eq,
// frequency/freq, pos/position, tracking/track, normalise/normalize), with or without the section.
// A byte is read only where its range is the parameter's. A flag's bits are read into a choice with
// as many values, in order (`LFO1_OneShot`'s 0 and 1 into the NRPN's `12=OFF, 13=ON`: the MIDI table
// puts several switches on one NRPN, each with values of its own). One that matches no parameter,
// or whose range differs, is left out and said.

const hex = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const SAME = { envelope: 'env', equaliser: 'eq', equalizer: 'eq', frequency: 'freq', normalise: 'normalize', pos: 'position', tracking: 'track' };

/** `Envelope1_Attack` -> envelope 1 attack -> env1attack; `QNormalise` -> qnormalize; `PitchBend` and `pitchbend` alike. */
export function nameWords(text) {
  return String(text ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => SAME[w] ?? w).join('');
}

const bytesOf = (tokens, location) => tokens.flatMap((t) => (t.bytes ? t.bytes : t.choice ? [location] : []));

/** Requests, dump definitions, mappings and a dump vector per located part, added to a built profile. */
export function addPull(profile, data, layout, notes) {
  const patch = data.patch;
  const parts = (layout.parts ?? []).flatMap((b) => b.parts).filter((p) => p.location);
  if (!patch || !parts.length) return;
  const dataAt = patch.reply.findIndex((t) => t.data);
  const size = patch.reply[dataAt]?.data;
  if (dataAt < 0 || !size) return;
  const requests = [];
  const dumps = [];
  const misses = new Map();
  const unnamed = new Set();
  const miss = (why, what) => misses.set(why, [...(misses.get(why) ?? []), what]);
  for (const part of parts) {
    const own = profile.parameters.filter((p) => p.group === part.name || p.group.startsWith(`${part.name}: `));
    const byWords = new Map();
    for (const p of own) {
      const leaf = p.name.slice(part.name.length + 1);
      const section = p.group.startsWith(`${part.name}: `) ? p.group.slice(part.name.length + 2) : '';
      for (const key of [nameWords(leaf), nameWords(`${section} ${leaf}`)]) if (!byWords.has(key)) byWords.set(key, p);
    }
    const mappings = [];
    for (const row of patch.format) {
      for (const setting of row.settings) {
        if (/Reserved|^Patch_Name$/i.test(setting.name)) continue;
        const name = layout.dumpNames?.[setting.name] ?? setting.name;
        const parameter = byWords.get(nameWords(name));
        if (!parameter) { unnamed.add(setting.name); continue; }
        const [lo, hi] = setting.bits ? [0, 2 ** (setting.bits[1] - setting.bits[0] + 1) - 1] : [row.min, row.max];
        const values = parameter.type === 'choice' ? parameter.choices.map((c) => c.value) : null;
        const ordered = values && setting.bits && values.length === hi - lo + 1 && values.every((v, i) => i === 0 || v > values[i - 1]);
        const fits = ordered || (values ? lo !== null && values.every((v) => v >= lo && v <= hi) && values.length === hi - lo + 1
          : lo !== null && parameter.range.min === lo && parameter.range.max === hi);
        if (!fits) { miss(`its range in the patch (${lo === null ? 'unprinted' : `${lo} - ${hi}`}) is not the parameter's`, setting.name); continue; }
        const bitParts = setting.bits ? [{ at: 0, from: setting.bits[0], bits: setting.bits[1] - setting.bits[0] + 1, shift: 0 }] : null;
        const map = ordered && values.some((v, i) => v !== i) ? values.map((v, i) => [i, v]) : null;
        mappings.push({
          parameter: parameter.id,
          offset: row.address,
          codec: bitParts ? { type: 'bitfields', parts: bitParts, ...(map ? { map } : {}) } : { type: 'u7' },
          setting, row,
        });
        parameter.access = { ...parameter.access, canRead: true };
      }
    }
    if (!mappings.length) continue;
    const slug = part.name.replace(/[^A-Za-z0-9]+/g, '');
    const prefix = bytesOf(patch.reply.slice(0, dataAt), part.location);
    requests.push({ id: `requestPatch${slug}`, name: `${part.name}: Current Patch Dump Request`, kind: 'sysex', template: bytesOf(patch.request, part.location), response: { dump: `patch${slug}` }, timeoutMs: 2000, retries: 1 });
    dumps.push({
      id: `patch${slug}`,
      name: `${part.name}: Current Patch`,
      kind: 'sysex',
      matcher: { prefix, suffix: ['F7'] },
      payload: { offset: prefix.length, size },
      completion: { expectedMessages: 1, expectedBytes: prefix.length + size + 1 },
      mappings: mappings.map(({ parameter, offset, codec }) => ({ parameter, offset, codec })),
      partMappings: mappings,
      part,
    });
  }
  if (!dumps.length) return;
  profile.requests = [...(profile.requests ?? []), ...requests];
  profile.dumpDefinitions = dumps.map(({ partMappings, part, ...d }) => d);
  profile.startup = { policy: 'pull', syncDirection: 'pull', sync: requests.map((r) => ({ request: r.id })) };
  const read = dumps.reduce((n, d) => n + d.mappings.length, 0);
  profile.coverage = {
    ...profile.coverage,
    editBufferDumpRequest: `complete: ${patch.requestTitle ?? 'the current patch dump request'}, once per synth`,
    editBufferDumpParse: `partial: ${read} of the profile's ${profile.parameters.length} parameters are read from the patch dumps`,
  };

  // A dump to read back per part: a plain byte, a flag by bit and a choice, at values that touch them.
  for (const dump of dumps) {
    const payload = new Array(size).fill(0);
    for (const row of patch.format) payload[row.address] = Math.min(row.default ?? 0, 127);
    for (const m of dump.partMappings) {
      // Every mapped byte holds a value its parameter has, as a real patch would.
      const parameter = profile.parameters.find((p) => p.id === m.parameter);
      if (parameter.type === 'choice' && !m.codec.parts) payload[m.offset] = parameter.choices[0].value;
    }
    const expected = {};
    const picks = [
      dump.partMappings.find((m) => !m.codec.parts && profile.parameters.find((p) => p.id === m.parameter).type !== 'choice'),
      dump.partMappings.find((m) => !m.codec.parts && profile.parameters.find((p) => p.id === m.parameter).type === 'choice'),
      dump.partMappings.find((m) => m.codec.parts && m.codec.parts[0].from > 0),
    ].filter(Boolean);
    for (const m of picks) {
      const parameter = profile.parameters.find((p) => p.id === m.parameter);
      if (m.codec.parts) {
        const { from, bits } = m.codec.parts[0];
        const value = (1 << bits) - 1;
        const wire = m.codec.map ? m.codec.map.find(([d]) => d === value)?.[1] : value;
        const choice = parameter.type === 'choice' ? parameter.choices.find((c) => c.value === wire) : null;
        if (parameter.type === 'choice' && !choice) continue;
        payload[m.offset] = (payload[m.offset] & ~(((1 << bits) - 1) << from)) | (value << from);
        expected[m.parameter] = choice ? choice.id : value;
      } else if (parameter.type === 'choice') {
        const choice = parameter.choices.at(-1);
        payload[m.offset] = choice.value;
        expected[m.parameter] = choice.id;
      } else {
        const value = Math.min(parameter.range.max, Math.max(parameter.range.min, 100));
        payload[m.offset] = value;
        expected[m.parameter] = value;
      }
    }
    // Other flags sharing a byte with a picked one read whatever it now holds; leave them be.
    const message = [...dump.matcher.prefix.map((t) => Number.parseInt(t, 16)), ...payload, 0xf7];
    const request = requests.find((r) => r.response.dump === dump.id);
    profile.tests.push(
      { name: request.name, kind: 'request', request: request.id, expectedHex: request.template.join(' ') },
      { name: `${dump.name}, read back`, kind: 'dumpParse', inputHex: message.map(hex).join(' '), expectedValues: expected },
    );
  }

  notes.push(`Pull: ${patch.requestTitle ?? 'the current patch dump request'} for each synth (location ${parts.map((p) => `${p.location} for ${p.name}`).join(', ')}), answered by ${patch.replyTitle ?? 'the current patch'} with ${size} bytes of plain 7-bit data. ${read} parameter(s) are read back from the patch format's addresses: a byte where its range is the parameter's, a flag by its bits.`);
  if (layout.pullNote) notes.push(layout.pullNote);
  for (const [why, list] of misses) notes.push(`In the patch but not read back, ${why}: ${[...new Set(list)].join(', ')}.`);
  if (unnamed.size) notes.push(`In the patch with no parameter of the same name here: ${[...unnamed].join(', ')}.`);
}
