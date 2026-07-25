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
  if (!outs.length) return { sounding: map, sends: [] };
  // A retrigger without an intervening off (running status, a stuck key, a
  // repeat) releases the old routing first, or the old one is orphaned.
  const prior = map[key];
  const sends = [];
  if (prior) for (const o of prior) sends.push({ kind: 'off', channel: o.channel, note: o.note });
  for (const o of outs) sends.push({ kind: 'on', channel: o.channel, note: o.note, velocity: o.velocity });
  return { sounding: { ...map, [key]: outs.map((o) => ({ channel: o.channel, note: o.note })) }, sends };
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
  for (const entry of (Array.isArray(heldEntries) ? heldEntries : [])) {
    const note = Math.round(num(entry?.note, -1));
    if (map[`${note}`]) continue;
    const r = pressNote(map, control, note, entry?.velocity ?? 100);
    map = r.sounding;
    sends.push(...r.sends);
  }
  return { sounding: map, sends };
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
