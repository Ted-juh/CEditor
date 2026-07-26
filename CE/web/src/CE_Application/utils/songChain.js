// Song mode — a chain of patterns with repeat counts.
//
// Shared by the Phrase Sequencer (chaining stored PATTERNS) and the Phrase
// Recorder (chaining stored TAKES), because a sequence of things with repeat
// counts is the same object either way and building it twice is how the two
// end up disagreeing about what "3 bars in" means.
//
// The core decision: a chain position is a PURE FUNCTION of a rising lap
// counter, not a cursor that advances. Same rule as the transport's position
// and the sequencer's step index, for the same reasons — nothing drifts,
// nothing gets stuck, and a jump re-derives instead of catching up.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clampInt(n, lo, hi) { const v = Math.round(num(n, lo)); return v < lo ? lo : v > hi ? hi : v; }

export const MAX_CHAIN_STEPS = 64;
export const MAX_REPEATS = 64;

// One link: which slot, and how many laps to stay there. `slot` is an index into
// whatever the host component stores (patterns, takes) — the chain doesn't care
// what it points at, which is exactly why it can be shared.
export function normalizeChain(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_CHAIN_STEPS)
    .filter((s) => s && Number.isFinite(Number(s.slot)))
    .map((s, i) => ({
      id: String(s.id ?? `link_${i + 1}`),
      slot: Math.max(0, Math.round(num(s.slot, 0))),
      // A repeat of 0 would be a link that never plays and never advances —
      // an infinite loop on one entry. One is the floor.
      repeats: clampInt(s.repeats ?? 1, 1, MAX_REPEATS),
      enabled: s.enabled !== false,
    }));
}
// Only the links that will actually play. A disabled link is skipped rather than
// played for zero laps, so "mute this section" doesn't silently change the
// length of everything after it in a way you can't see.
export function activeChain(chain) {
  return normalizeChain(chain).filter((s) => s.enabled);
}
// Total laps in one pass of the chain.
export function chainLength(chain) {
  return activeChain(chain).reduce((sum, s) => sum + s.repeats, 0);
}

/**
 * Where a lap counter lands in the chain.
 *
 * Returns { link, index, lapInLink, lapsRemaining, pass } or null for an empty
 * chain. `pass` counts complete times through, which is what a "play once"
 * chain needs in order to know it has finished.
 *
 * A pure fold, so calling it with the same lap always gives the same answer and
 * a stall re-derives rather than catching up.
 */
export function chainAt(chain, lap, loop = true) {
  const links = activeChain(chain);
  if (!links.length) return null;
  const total = chainLength(links);
  const n = Math.max(0, Math.round(num(lap, 0)));
  if (!loop && n >= total) {
    // Past the end of a one-shot chain: hold on the last link rather than
    // wrapping or going silent. A song that ends should stay ended, on its
    // final section, not jump back to the intro.
    const last = links[links.length - 1];
    return {
      link: last, index: links.length - 1, lapInLink: last.repeats - 1,
      lapsRemaining: 0, pass: 1, finished: true,
    };
  }
  const pass = Math.floor(n / total);
  let rem = n % total;
  for (let i = 0; i < links.length; i += 1) {
    if (rem < links[i].repeats) {
      return {
        link: links[i], index: i, lapInLink: rem,
        lapsRemaining: links[i].repeats - rem - 1, pass, finished: false,
      };
    }
    rem -= links[i].repeats;
  }
  return null;                                     // unreachable while total > 0
}

// The slot a lap should be playing, or null when the chain is off or empty. The
// one call most consumers need.
export function slotForLap(chain, lap, loop = true) {
  const at = chainAt(chain, lap, loop);
  return at ? at.link.slot : null;
}
// Does the slot change between these two laps? The host uses this to know when
// to swap the pattern — swapping on every lap would reset anything mid-flight.
export function chainSwitches(chain, fromLap, toLap, loop = true) {
  const a = slotForLap(chain, fromLap, loop);
  const b = slotForLap(chain, toLap, loop);
  return a !== b;
}

// A readable line for the inspector: "1×2 → 2 → 3×4".
export function chainSummary(chain, names = null) {
  const links = activeChain(chain);
  if (!links.length) return '—';
  return links.map((s) => {
    const label = Array.isArray(names) && names[s.slot] ? String(names[s.slot]) : String(s.slot + 1);
    return s.repeats > 1 ? `${label}×${s.repeats}` : label;
  }).join(' → ');
}

// --- Editing -----------------------------------------------------------------------
// Pure reducers, same convention as everything else here: the SAME array out
// when nothing changed.
export function addLink(chain, slot, repeats = 1) {
  const links = normalizeChain(chain);
  if (links.length >= MAX_CHAIN_STEPS) return links;
  return [...links, {
    id: `link_${links.length + 1}_${links.length}`,
    slot: Math.max(0, Math.round(num(slot, 0))),
    repeats: clampInt(repeats, 1, MAX_REPEATS),
    enabled: true,
  }];
}
export function removeLink(chain, index) {
  const links = normalizeChain(chain);
  const i = Math.round(num(index, -1));
  if (i < 0 || i >= links.length) return links;
  return links.filter((_, k) => k !== i);
}
export function updateLink(chain, index, patch) {
  const links = normalizeChain(chain);
  const i = Math.round(num(index, -1));
  if (i < 0 || i >= links.length || !patch || typeof patch !== 'object') return links;
  const next = normalizeChain([{ ...links[i], ...patch }])[0];
  if (!next) return links;
  if (next.slot === links[i].slot && next.repeats === links[i].repeats && next.enabled === links[i].enabled) return links;
  return links.map((s, k) => (k === i ? next : s));
}
export function moveLink(chain, index, delta) {
  const links = normalizeChain(chain);
  const i = Math.round(num(index, -1));
  const j = i + Math.round(num(delta, 0));
  if (i < 0 || i >= links.length || j < 0 || j >= links.length || i === j) return links;
  const next = links.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
