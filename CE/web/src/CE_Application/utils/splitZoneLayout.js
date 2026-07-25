// Zone Splitter — the routing table the panel was missing. Notes arriving on the
// hardware input are matched against a list of key ZONES; each zone re-sends
// them on its own MIDI channel, transposed, with its own velocity response. Two
// synths, one keyboard, split at C3 — the single most common thing anyone with
// more than one box wants to do, and it was impossible here until the note-input
// work made incoming notes visible at all.
//
// Zones may OVERLAP, and that is the whole layering story: a note inside two
// zones is sent twice, on two channels, with two transpositions. There is no
// separate "layer" mode to get wrong — overlap IS layering.
//
// Pure: notes and velocities in, routed outputs out. The live wiring (input
// subscription, note-off bookkeeping) lives in the preview surface.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }
function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

export const MIN_NOTE = 0;
export const MAX_NOTE = 127;

// Velocity response per zone. Hardware splitters offer exactly this handful,
// and they're worth more than a drawable curve here: a zone is usually feeding
// a different synth whose own response you're compensating for.
export const VELOCITY_CURVES = ['linear', 'soft', 'hard', 'fixed'];
export const VELOCITY_CURVE_LABELS = {
  linear: 'Linear', soft: 'Soft (easier to play loud)',
  hard: 'Hard (needs a firmer touch)', fixed: 'Fixed',
};
// 0..1 in, 0..1 out. Soft bows the curve up, hard bows it down; both keep the
// endpoints, so pianissimo is still pianissimo and full is still full.
export function velocityCurve(x, curve = 'linear') {
  const v = clamp01(num(x, 0));
  switch (String(curve)) {
    case 'soft': return Math.pow(v, 0.6);
    case 'hard': return Math.pow(v, 1.7);
    case 'fixed':
    case 'linear':
    default: return v;
  }
}

export function splitConfig(control) {
  return control?._children?.SplitZone ?? {};
}
// The MIDI channel to listen on. 0 = omni, which is the sane default: you
// rarely care which channel a keyboard sends on, only which key was pressed.
export function splitInputChannel(control) { return clampInt(splitConfig(control).inputChannel ?? 0, 0, 16); }
// What to do with a note no zone claims. Dropping is the right default — the
// point of a split is that the top half does NOT play the bass patch — but a
// pass-through is useful while setting one up.
export function splitUnmatched(control) {
  return String(splitConfig(control).unmatched ?? 'drop') === 'pass' ? 'pass' : 'drop';
}
export function splitPassChannel(control) { return clampInt(splitConfig(control).passChannel ?? 1, 1, 16); }

// Which continuous controllers a zone passes on. A split is usually two
// different synths, and they rarely agree about what CC1 means — so a zone that
// forwards the mod wheel and one that doesn't is a real need, not a refinement.
// --- Channel-wide messages: pitch bend and channel pressure ----------------------
// These are the awkward ones. A bend carries no note, so "which zone did that
// belong to" cannot be read off the message — it has to be a RULE. Four, because
// the honest answer is that different rigs want different ones:
//
//   off         never forwarded
//   lastPlayed  to whichever zones claimed the most recent note-on   ← default
//   sounding    to every zone currently holding a note
//   always      to every zone, unconditionally
//
// `lastPlayed` is the default because it gets the two common cases right at
// once: in a split, bending after playing the lead bends only the lead; in a
// LAYER, both zones claimed that same note-on, so both bend together. It is a
// set, not a single zone, which is what makes the layer case work.
//
// `sounding` differs when you hold a bass note and play a lead line over it —
// lastPlayed bends only the lead, sounding bends both. Neither is wrong; which
// you want depends on whether the left hand is a pad or a part.
export const BEND_MODES = ['off', 'lastPlayed', 'sounding', 'always'];
export const BEND_MODE_LABELS = {
  off: 'Never', lastPlayed: 'Last played', sounding: 'While sounding', always: 'Always',
};
export const BEND_CENTRE = 8192;
export const BEND_MAX = 16383;

export const CC_MODES = ['all', 'none', 'list'];
export const CC_MODE_LABELS = { all: 'All', none: 'None', list: 'Only these' };
export const SUSTAIN_CC = 64;

export function splitZones(control) {
  const raw = splitConfig(control).zones;
  return (Array.isArray(raw) ? raw : []).map((z, i) => {
    // A zone written backwards (low above high) is a mistake, not an empty
    // zone: silently claiming nothing would look like the component is broken.
    const a = clampInt(z?.lowNote ?? 0, MIN_NOTE, MAX_NOTE);
    const b = clampInt(z?.highNote ?? 127, MIN_NOTE, MAX_NOTE);
    return {
      id: String(z?.id ?? `z${i}`),
      label: String(z?.label ?? `Zone ${i + 1}`),
      lowNote: Math.min(a, b),
      highNote: Math.max(a, b),
      channel: clampInt(z?.channel ?? 1, 1, 16),
      transpose: clampInt(z?.transpose ?? 0, -48, 48),
      curve: VELOCITY_CURVES.includes(String(z?.curve)) ? String(z.curve) : 'linear',
      velLow: clampInt(z?.velLow ?? 1, 1, 127),
      velHigh: clampInt(z?.velHigh ?? 127, 1, 127),
      fixedVelocity: clampInt(z?.fixedVelocity ?? 100, 1, 127),
      // Velocity SWITCHING gates the input: the zone only answers a note played
      // within this window. Distinct from velLow/velHigh above, which scale the
      // OUTPUT — one decides whether the zone speaks, the other how loudly.
      velSwitchLow: clampInt(z?.velSwitchLow ?? 1, 1, 127),
      velSwitchHigh: clampInt(z?.velSwitchHigh ?? 127, 1, 127),
      ccMode: CC_MODES.includes(String(z?.ccMode)) ? String(z.ccMode) : 'all',
      ccList: [...new Set((Array.isArray(z?.ccList) ? z.ccList : []).map((c) => clampInt(c, 0, 127)))]
        .sort((a2, b2) => a2 - b2),
      // Sustain gets its own switch rather than living in the CC list. It is the
      // one controller everybody wants per-zone, and burying it in a list of
      // numbers means nobody finds it.
      sustain: z?.sustain !== false,
      bendMode: BEND_MODES.includes(String(z?.bendMode)) ? String(z.bendMode) : 'lastPlayed',
      pressureMode: BEND_MODES.includes(String(z?.pressureMode)) ? String(z.pressureMode) : 'lastPlayed',
      enabled: z?.enabled !== false,
      colour: String(z?.colour ?? ''),
    };
  });
}
export function zoneContains(zone, note) {
  const n = Math.round(num(note, -1));
  return n >= zone.lowNote && n <= zone.highNote;
}
export function zoneSpan(zone) { return zone.highNote - zone.lowNote + 1; }

// A zone's velocity response: curve, then scale into the zone's own range. The
// scale is applied AFTER the curve so the range means what it says — a zone set
// to 40–90 never sends 39 or 91 whatever the curve does.
export function zoneVelocity(zone, velocity) {
  const inVel = clampInt(velocity, 1, 127);
  if (zone.curve === 'fixed') return clampInt(zone.fixedVelocity, 1, 127);
  const lo = Math.min(zone.velLow, zone.velHigh);
  const hi = Math.max(zone.velLow, zone.velHigh);
  const shaped = velocityCurve((inVel - 1) / 126, zone.curve);
  return clampInt(lo + shaped * (hi - lo), 1, 127);
}
export function zoneNote(zone, note) { return Math.round(num(note, 0)) + zone.transpose; }

// Velocity switching: does this zone answer a note played this hard? A window
// rather than a single threshold, so you can have a soft layer AND a hard one
// without the soft layer also sounding on every fortissimo.
export function zoneAcceptsVelocity(zone, velocity) {
  const v = clampInt(velocity, 1, 127);
  const lo = Math.min(zone.velSwitchLow ?? 1, zone.velSwitchHigh ?? 127);
  const hi = Math.max(zone.velSwitchLow ?? 1, zone.velSwitchHigh ?? 127);
  return v >= lo && v <= hi;
}
export function zoneSwitchesOnVelocity(zone) {
  return (zone.velSwitchLow ?? 1) > 1 || (zone.velSwitchHigh ?? 127) < 127;
}
// Does this zone forward a given controller? Sustain answers to its own switch,
// always — a pedal is not something you want to discover is governed by a list
// of numbers three menus down.
export function zonePassesCc(zone, cc) {
  const n = clampInt(cc, 0, 127);
  if (n === SUSTAIN_CC) return zone.sustain !== false;
  switch (String(zone.ccMode ?? 'all')) {
    case 'none': return false;
    case 'list': return (Array.isArray(zone.ccList) ? zone.ccList : []).includes(n);
    case 'all':
    default: return true;
  }
}
// Route a controller to every channel that should hear it. Deduplicated BY
// CHANNEL: two zones sharing a channel (a keyboard split into a low and high
// half of the same patch) must not double every mod-wheel message — that is
// twice the traffic for no audible difference.
export function routeCc(control, cc, value) {
  const n = clampInt(cc, 0, 127);
  const v = clampInt(value, 0, 127);
  const seen = new Set();
  const out = [];
  for (const zone of splitZones(control)) {
    if (!zone.enabled || !zonePassesCc(zone, n)) continue;
    if (seen.has(zone.channel)) continue;
    seen.add(zone.channel);
    out.push({ zoneId: zone.id, channel: zone.channel, cc: n, value: v });
  }
  if (out.length) return out;
  // Nothing claimed it. Pass-through mode forwards controllers too, so a panel
  // being set up doesn't go half-dead the moment you touch the mod wheel.
  if (splitUnmatched(control) === 'pass') {
    return [{ zoneId: '', channel: splitPassChannel(control), cc: n, value: v }];
  }
  return [];
}

// The routing itself. One incoming note in, every destination out — which is
// more than one when zones overlap. A transposition that lands outside 0-127 is
// DROPPED rather than clamped: clamping would pile every out-of-range note onto
// note 0 or 127, which sounds like a stuck key rather than like nothing.
export function routeNoteOn(control, note, velocity) {
  const n = Math.round(num(note, -1));
  if (n < MIN_NOTE || n > MAX_NOTE) return [];
  const zones = splitZones(control);
  const out = [];
  for (const zone of zones) {
    if (!zone.enabled || !zoneContains(zone, n)) continue;
    if (!zoneAcceptsVelocity(zone, velocity)) continue;
    const dest = zoneNote(zone, n);
    if (dest < MIN_NOTE || dest > MAX_NOTE) continue;
    out.push({ zoneId: zone.id, channel: zone.channel, note: dest, velocity: zoneVelocity(zone, velocity) });
  }
  if (out.length) return out;
  if (splitUnmatched(control) === 'pass') {
    return [{ zoneId: '', channel: splitPassChannel(control), note: n, velocity: clampInt(velocity, 1, 127) }];
  }
  return [];
}
// --- Sounding-note bookkeeping ----------------------------------------------------
// The trap this component has to get right. A note-OFF must go to exactly the
// destinations its note-ON went to. Re-deriving the routing at release time is
// the obvious implementation and it is wrong: drag a split point, or change a
// transposition, while a key is down, and the off goes to a different channel or
// a different pitch — leaving the original note ringing forever with nothing
// that will ever stop it.
//
// So a press REMEMBERS where it went and a release replays that. Pure, so the
// rule is testable rather than buried in component state: state in, new state
// and the messages to send out.
export const EMPTY_SOUNDING = Object.freeze({});

export function pressNote(sounding, control, note, velocity) {
  const map = sounding ?? EMPTY_SOUNDING;
  const key = `${Math.round(num(note, -1))}`;
  const outs = routeNoteOn(control, note, velocity);
  // zoneIds is always present, even when nothing claimed the note — a caller
  // reading `.length` off it must not have to know which path it took.
  if (!outs.length) return { sounding: map, sends: [], zoneIds: [] };
  // A retrigger without an intervening off (running status, a stuck key, a
  // repeat) releases the old routing first, or the old one is orphaned.
  const prior = map[key];
  const sends = [];
  if (prior) for (const o of prior) sends.push({ kind: 'off', channel: o.channel, note: o.note });
  for (const o of outs) sends.push({ kind: 'on', channel: o.channel, note: o.note, velocity: o.velocity });
  return {
    sounding: { ...map, [key]: outs.map((o) => ({ channel: o.channel, note: o.note, zoneId: o.zoneId })) },
    sends,
    // Who claimed it — the caller keeps this as "the last played zones", which
    // is how a bend with no note information gets attributed to a zone at all.
    zoneIds: [...new Set(outs.map((o) => o.zoneId).filter(Boolean))],
  };
}
// The zones currently holding anything, for the 'sounding' attribution mode.
export function soundingZoneIds(sounding) {
  const out = new Set();
  for (const outs of Object.values(sounding ?? EMPTY_SOUNDING)) {
    for (const o of outs) if (o.zoneId) out.add(o.zoneId);
  }
  return [...out];
}

export function releaseNote(sounding, note) {
  const map = sounding ?? EMPTY_SOUNDING;
  const key = `${Math.round(num(note, -1))}`;
  const outs = map[key];
  if (!outs) return { sounding: map, sends: [] };
  const next = { ...map };
  delete next[key];
  return { sounding: next, sends: outs.map((o) => ({ kind: 'off', channel: o.channel, note: o.note })) };
}

// Controllers a zone is currently holding down, so panic and a channel change
// can put them back. Only latching ones matter — a mod wheel left at 40 is a
// tone, a sustain pedal left down is a synth full of notes that will never stop.
export const LATCHING_CCS = [64, 66, 67, 69];   // sustain, sostenuto, soft, hold-2
export function heldLatchingCcs(control, ccState) {
  const state = ccState ?? {};
  const out = [];
  for (const [key, value] of Object.entries(state)) {
    const [ch, cc] = key.split(':').map(Number);
    if (!LATCHING_CCS.includes(cc) || value < 64) continue;
    out.push({ channel: ch, cc, value: 0 });
  }
  return out;
}
// Fold a routed CC into the "what is latched" state, so it can be released.
export function trackCc(ccState, sends) {
  let next = ccState ?? {};
  let changed = false;
  for (const m of (Array.isArray(sends) ? sends : [])) {
    if (!LATCHING_CCS.includes(m.cc)) continue;
    const key = `${m.channel}:${m.cc}`;
    if (next[key] === m.value) continue;
    if (!changed) { next = { ...next }; changed = true; }
    next[key] = m.value;
  }
  return next;
}

export function releaseAll(sounding) {
  const map = sounding ?? EMPTY_SOUNDING;
  const sends = [];
  for (const outs of Object.values(map)) {
    for (const o of outs) sends.push({ kind: 'off', channel: o.channel, note: o.note });
  }
  return { sounding: EMPTY_SOUNDING, sends };
}

// Bring the sounding set in line with what is actually held. `heldNotes` is the
// live input state; anything sounding that is no longer held is released, and
// anything held that isn't sounding is pressed. `keep` is a note being held by
// the mouse rather than the keyboard, which must survive the reconcile.
export function reconcileHeld(sounding, control, heldEntries, keep = null) {
  let map = sounding ?? EMPTY_SOUNDING;
  const sends = [];
  const live = new Set((Array.isArray(heldEntries) ? heldEntries : []).map((e) => Math.round(num(e?.note, -1))));
  for (const key of Object.keys(map)) {
    const note = Number(key);
    if (live.has(note) || note === keep) continue;
    const r = releaseNote(map, note);
    map = r.sounding;
    sends.push(...r.sends);
  }
  let zoneIds = null;
  for (const entry of (Array.isArray(heldEntries) ? heldEntries : [])) {
    const note = Math.round(num(entry?.note, -1));
    if (map[`${note}`]) continue;
    const r = pressNote(map, control, note, entry?.velocity ?? 100);
    map = r.sounding;
    sends.push(...r.sends);
    if (r.zoneIds.length) zoneIds = r.zoneIds;     // the newest press wins
  }
  return { sounding: map, sends, zoneIds };
}
export function soundingNotes(sounding) {
  return Object.keys(sounding ?? EMPTY_SOUNDING).map(Number).sort((a, b) => a - b);
}

// Which zones claim a note at all (for the display — a lit key wants to know
// its colour even when nothing is sounding).
export function zonesAt(control, note) {
  return splitZones(control).filter((z) => z.enabled && zoneContains(z, note));
}
// Notes claimed by nothing, inside the drawn range. Surfacing these is the
// difference between "my top octave is silent" being a five-minute mystery and
// being visible at a glance.
export function unclaimedNotes(control, lowNote, highNote) {
  const lo = clampInt(lowNote, MIN_NOTE, MAX_NOTE);
  const hi = clampInt(highNote, MIN_NOTE, MAX_NOTE);
  const zones = splitZones(control).filter((z) => z.enabled);
  const out = [];
  for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n += 1) {
    if (!zones.some((z) => zoneContains(z, n))) out.push(n);
  }
  return out;
}
// Do two zones overlap? Not an error — it's how you layer — but the editor says
// so, because an accidental overlap sends every note twice and the usual
// symptom is "it sounds thin and out of tune", which nobody traces to this.
export function zoneOverlaps(control) {
  const zones = splitZones(control).filter((z) => z.enabled);
  const pairs = [];
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      const lo = Math.max(zones[i].lowNote, zones[j].lowNote);
      const hi = Math.min(zones[i].highNote, zones[j].highNote);
      if (lo <= hi) pairs.push({ a: zones[i].id, b: zones[j].id, lowNote: lo, highNote: hi });
    }
  }
  return pairs;
}

// Which zones should hear a channel-wide message, given a mode and what is going
// on. `attribution` is { lastZoneIds, soundingZoneIds } — both plain id lists.
//
// The one case with no good answer is 'lastPlayed' before anything has been
// played: there is nothing to attribute it to. Sending nowhere would mean
// "I moved the bend wheel and the panel did nothing", which reads as broken, so
// with no history it goes everywhere. Once you play a note it narrows.
function zoneHearsChannelMessage(zone, mode, attribution) {
  switch (String(mode)) {
    case 'off': return false;
    case 'always': return true;
    case 'sounding':
      return (attribution?.soundingZoneIds ?? []).includes(zone.id);
    case 'lastPlayed':
    default: {
      const last = attribution?.lastZoneIds ?? [];
      return last.length ? last.includes(zone.id) : true;
    }
  }
}
function routeChannelMessage(control, field, attribution) {
  const seen = new Set();
  const out = [];
  for (const zone of splitZones(control)) {
    if (!zone.enabled) continue;
    if (!zoneHearsChannelMessage(zone, zone[field], attribution)) continue;
    if (seen.has(zone.channel)) continue;       // one message per channel, as with CCs
    seen.add(zone.channel);
    out.push({ zoneId: zone.id, channel: zone.channel });
  }
  return out;
}
// Pitch bend. The 14-bit value is carried through intact: re-sending a bend as
// 7 bits would turn a slow glide into a staircase, which is exactly the thing
// a bend wheel exists to avoid.
export function routeBend(control, value14, attribution = null) {
  const v = clampInt(value14, 0, BEND_MAX);
  const dests = routeChannelMessage(control, 'bendMode', attribution);
  if (dests.length) return dests.map((d) => ({ ...d, value14: v }));
  if (splitUnmatched(control) === 'pass') {
    return [{ zoneId: '', channel: splitPassChannel(control), value14: v }];
  }
  return [];
}
// Channel pressure. Same attribution problem, same rule, its own switch —
// a synth that responds well to aftertouch and one that screams are a common
// pair, and you want the choice per zone.
export function routePressure(control, value, attribution = null) {
  const v = clampInt(value, 0, 127);
  const dests = routeChannelMessage(control, 'pressureMode', attribution);
  if (dests.length) return dests.map((d) => ({ ...d, value: v }));
  if (splitUnmatched(control) === 'pass') {
    return [{ zoneId: '', channel: splitPassChannel(control), value: v }];
  }
  return [];
}
export function bendBytes(channel, value14) {
  const v = clampInt(value14, 0, BEND_MAX);
  return [0xE0 | (clampInt(channel, 1, 16) - 1), v & 0x7F, (v >> 7) & 0x7F];
}
export function pressureBytes(channel, value) {
  return [0xD0 | (clampInt(channel, 1, 16) - 1), clampInt(value, 0, 127)];
}
// A bend left off-centre is a permanently detuned synth, so — like the sustain
// pedal — it has to be remembered and put back. Channels already at centre are
// not re-centred, so panic on an untouched rig sends nothing.
export function trackBend(bendState, sends) {
  let next = bendState ?? {};
  let changed = false;
  for (const m of (Array.isArray(sends) ? sends : [])) {
    const key = `${m.channel}`;
    if (next[key] === m.value14) continue;
    if (!changed) { next = { ...next }; changed = true; }
    next[key] = m.value14;
  }
  return next;
}
export function offCentreBends(bendState) {
  return Object.entries(bendState ?? {})
    .filter(([, v]) => v !== BEND_CENTRE)
    .map(([ch]) => ({ channel: Number(ch), value14: BEND_CENTRE }));
}

// --- Presets ----------------------------------------------------------------------
// The four or five splits anyone actually uses. Built from the CURRENT drawn
// range rather than fixed note numbers, so applying one to a 25-key controller
// gives sensible boundaries instead of zones off the end of the keyboard.
export const SPLIT_PRESETS = [
  { id: 'whole', label: 'Whole keyboard', hint: 'One zone, everything to channel 1.' },
  { id: 'classic', label: 'Classic split', hint: 'Lower half to ch1 an octave down, upper half to ch2.' },
  { id: 'splitLayer', label: 'Split + layered lead', hint: 'Bass below, two channels layered above.' },
  { id: 'threeWay', label: 'Three-way', hint: 'Bass / pad / lead across ch1-3.' },
  { id: 'velLayer', label: 'Velocity layers', hint: 'Same keys, soft to ch1 and hard to ch2.' },
];
const PRESET_COLOURS = ['FF5B9BD5', 'FF39D98A', 'FFF2994A', 'FFBB6BD9', 'FFEB5757'];
function presetZone(i, over) {
  return {
    id: `z${i}`, label: `Zone ${i + 1}`, lowNote: 0, highNote: 127, channel: i + 1,
    transpose: 0, curve: 'linear', velLow: 1, velHigh: 127, fixedVelocity: 100,
    velSwitchLow: 1, velSwitchHigh: 127, ccMode: 'all', ccList: [], sustain: true,
    bendMode: 'lastPlayed', pressureMode: 'lastPlayed',
    enabled: true, colour: PRESET_COLOURS[i % PRESET_COLOURS.length], ...over,
  };
}
// Split the range at a proportion, on a white key so the boundary lands
// somewhere a player would put it rather than mid-accidental.
function splitPoint(lowNote, highNote, fraction) {
  const lo = clampInt(lowNote, MIN_NOTE, MAX_NOTE);
  const hi = clampInt(highNote, MIN_NOTE, MAX_NOTE);
  let n = clampInt(lo + (hi - lo) * clamp01(fraction), lo, hi);
  while (n > lo && isBlackKey(n)) n -= 1;
  return n;
}
export function splitPresetZones(presetId, lowNote = 36, highNote = 96) {
  const lo = Math.min(lowNote, highNote);
  const hi = Math.max(lowNote, highNote);
  switch (String(presetId)) {
    case 'classic': {
      const mid = splitPoint(lo, hi, 0.5);
      return [
        presetZone(0, { label: 'Bass', lowNote: lo, highNote: mid - 1, channel: 1, transpose: -12 }),
        presetZone(1, { label: 'Lead', lowNote: mid, highNote: hi, channel: 2 }),
      ];
    }
    case 'splitLayer': {
      const mid = splitPoint(lo, hi, 0.4);
      return [
        presetZone(0, { label: 'Bass', lowNote: lo, highNote: mid - 1, channel: 1, transpose: -12 }),
        presetZone(1, { label: 'Lead', lowNote: mid, highNote: hi, channel: 2 }),
        presetZone(2, { label: 'Lead +8ve', lowNote: mid, highNote: hi, channel: 3, transpose: 12 }),
      ];
    }
    case 'threeWay': {
      const a = splitPoint(lo, hi, 1 / 3);
      const b = splitPoint(lo, hi, 2 / 3);
      return [
        presetZone(0, { label: 'Bass', lowNote: lo, highNote: a - 1, channel: 1, transpose: -12 }),
        presetZone(1, { label: 'Pad', lowNote: a, highNote: b - 1, channel: 2 }),
        presetZone(2, { label: 'Lead', lowNote: b, highNote: hi, channel: 3 }),
      ];
    }
    case 'velLayer':
      return [
        presetZone(0, { label: 'Soft', lowNote: lo, highNote: hi, channel: 1, velSwitchHigh: 79 }),
        presetZone(1, { label: 'Hard', lowNote: lo, highNote: hi, channel: 2, velSwitchLow: 80 }),
      ];
    case 'whole':
    default:
      return [presetZone(0, { label: 'All', lowNote: lo, highNote: hi, channel: 1 })];
  }
}

// --- Keyboard geometry -----------------------------------------------------------
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);
export function isBlackKey(note) { return BLACK_PCS.has(((Math.round(num(note, 0)) % 12) + 12) % 12); }
// How many white keys sit strictly below `note`, counting from `from`.
export function whiteKeysBetween(from, note) {
  let count = 0;
  for (let n = Math.round(num(from, 0)); n < Math.round(num(note, 0)); n += 1) if (!isBlackKey(n)) count += 1;
  return count;
}
export function whiteKeyCount(lowNote, highNote) {
  let count = 0;
  for (let n = Math.round(num(lowNote, 0)); n <= Math.round(num(highNote, 0)); n += 1) if (!isBlackKey(n)) count += 1;
  return Math.max(1, count);
}
// The drawn range. Snapped OUT to whole white keys at both ends, so the
// keyboard never starts or ends on a floating black key.
export function splitRange(control) {
  const cfg = splitConfig(control);
  let lo = clampInt(cfg.lowNote ?? 36, MIN_NOTE, MAX_NOTE);
  let hi = clampInt(cfg.highNote ?? 96, MIN_NOTE, MAX_NOTE);
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  while (lo > MIN_NOTE && isBlackKey(lo)) lo -= 1;
  while (hi < MAX_NOTE && isBlackKey(hi)) hi += 1;
  return { lowNote: lo, highNote: hi };
}

export function splitGeometry(width, height, pad = 8, headerH = 22, bandH = 14) {
  const p = Math.max(0, num(pad, 8));
  const hdr = Math.max(0, num(headerH, 0));
  const band = Math.max(0, num(bandH, 0));
  const w = Math.max(1, num(width, 0) - p * 2);
  const h = Math.max(1, num(height, 0) - p * 2 - hdr);
  return {
    x0: p, y0: p + hdr, w, h,
    bandY: p + hdr,                       // the zone bands sit above the keys
    bandH: Math.min(band, h * 0.4),
    keysY: p + hdr + Math.min(band, h * 0.4) + 2,
    keysH: Math.max(6, h - Math.min(band, h * 0.4) - 2),
  };
}
// A key's rectangle. White keys tile the width; black keys are narrower, half
// as tall, and straddle the boundary between their neighbours.
export function keyRect(geom, note, lowNote, highNote) {
  const whites = whiteKeyCount(lowNote, highNote);
  const whiteW = geom.w / whites;
  const n = Math.round(num(note, 0));
  if (!isBlackKey(n)) {
    return { x: geom.x0 + whiteKeysBetween(lowNote, n) * whiteW, y: geom.keysY, w: whiteW, h: geom.keysH, black: false };
  }
  // A black key sits on the join after the white key below it.
  const bw = whiteW * 0.62;
  const centre = geom.x0 + whiteKeysBetween(lowNote, n) * whiteW;
  return { x: centre - bw / 2, y: geom.keysY, w: bw, h: geom.keysH * 0.62, black: true };
}
// Pixel → note. Black keys are tested first because they're drawn on top, which
// is also how a finger hits them.
export function noteAtPoint(geom, px, py, lowNote, highNote) {
  const x = num(px, -1);
  const y = num(py, -1);
  if (y < geom.keysY || y > geom.keysY + geom.keysH) return -1;
  for (let n = lowNote; n <= highNote; n += 1) {
    if (!isBlackKey(n)) continue;
    const r = keyRect(geom, n, lowNote, highNote);
    if (x >= r.x && x <= r.x + r.w && y <= r.y + r.h) return n;
  }
  for (let n = lowNote; n <= highNote; n += 1) {
    if (isBlackKey(n)) continue;
    const r = keyRect(geom, n, lowNote, highNote);
    if (x >= r.x && x <= r.x + r.w) return n;
  }
  return -1;
}
// A zone's band across the keyboard, in pixels.
export function zoneBandRect(geom, zone, lowNote, highNote, laneIndex = 0, laneCount = 1) {
  const lo = Math.max(zone.lowNote, lowNote);
  const hi = Math.min(zone.highNote, highNote);
  if (hi < lo) return null;
  const a = keyRect(geom, lo, lowNote, highNote);
  const bKey = keyRect(geom, hi, lowNote, highNote);
  const lanes = Math.max(1, Math.round(num(laneCount, 1)));
  const laneH = geom.bandH / lanes;
  return {
    x: a.x, w: Math.max(2, bKey.x + bKey.w - a.x),
    y: geom.bandY + laneIndex * laneH, h: Math.max(2, laneH - 1),
  };
}
// Which zone edge is under the cursor, for dragging a split point. Returns
// { index, edge: 'low'|'high' } or null.
//
// At a split point two edges sit on the SAME pixel — zone A ends at B3, zone B
// starts at C4, and those share a boundary. The comparison is strictly less-than
// so the first match wins and the answer is deterministic rather than depending
// on iteration order; `adjacentEdge` below then finds the twin, because what
// the user is actually grabbing there is one split point, not one edge.
export function hitZoneEdge(control, geom, px, py, lowNote, highNote, tolPx = 6) {
  if (py < geom.bandY || py > geom.bandY + geom.bandH) return null;
  const zones = splitZones(control);
  let best = null;
  let bestD = Math.max(0, num(tolPx, 6));
  zones.forEach((zone, index) => {
    const band = zoneBandRect(geom, zone, lowNote, highNote, 0, 1);
    if (!band) return;
    const dLow = Math.abs(num(px, 0) - band.x);
    const dHigh = Math.abs(num(px, 0) - (band.x + band.w));
    if (dLow < bestD) { bestD = dLow; best = { index, edge: 'low' }; }
    if (dHigh < bestD) { bestD = dHigh; best = { index, edge: 'high' }; }
  });
  return best;
}
// The other half of a split point: an edge that butts directly against this one
// with no gap. Zone A ending at 59 and zone B starting at 60 is one split, and
// dragging it must move both — otherwise every drag opens a hole or an overlap
// and the user has to fix the second zone by hand every single time.
export function adjacentEdge(zones, index, edge) {
  const list = Array.isArray(zones) ? zones : [];
  const z = list[index];
  if (!z) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (i === index) continue;
    const o = list[i];
    if (edge === 'high' && o.lowNote === z.highNote + 1) return { index: i, edge: 'low' };
    if (edge === 'low' && o.highNote === z.lowNote - 1) return { index: i, edge: 'high' };
  }
  return null;
}
// Move one edge of a zone, returning a NEW zone list. An edge can't cross its
// partner — dragging the bottom past the top would silently invert the zone.
export function moveZoneEdge(zones, index, edge, note) {
  const list = (Array.isArray(zones) ? zones : []).map((z) => ({ ...z }));
  const z = list[index];
  if (!z) return list;
  const n = clampInt(note, MIN_NOTE, MAX_NOTE);
  if (edge === 'low') z.lowNote = Math.min(n, clampInt(z.highNote ?? 127, MIN_NOTE, MAX_NOTE));
  else z.highNote = Math.max(n, clampInt(z.lowNote ?? 0, MIN_NOTE, MAX_NOTE));
  return list;
}
// Drag a split point: move the grabbed edge, and carry its twin with it so
// abutting zones stay abutting. The twin follows the edge that ACTUALLY moved
// (which clamping may have pinned short of where the cursor is), so the two can
// never be left overlapping by a drag.
export function dragSplitPoint(zones, index, edge, note) {
  const list = (Array.isArray(zones) ? zones : []).map((z) => ({ ...z }));
  const twin = adjacentEdge(list, index, edge);
  const moved = moveZoneEdge(list, index, edge, note);
  if (!twin) return moved;
  const landed = edge === 'high' ? moved[index].highNote : moved[index].lowNote;
  return moveZoneEdge(moved, twin.index, twin.edge, edge === 'high' ? landed + 1 : landed - 1);
}
