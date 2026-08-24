// captureSession.js — the state machine of a capture, and the trap it is built around.
//
// A session is a conversation with three states and the screen should never show more than one:
// SETUP (which mode is even available, and the volatile baseline), CAPTURE (one prompt, one move,
// the hypothesis in plain language) and CONFIRM (name it, test it, keep it).
//
// ECHO IS THE TRAP, and it is worth stating at the top of the file rather than in a function.
// The panel sends, the device echoes, the session learns its own transmission and is delighted with
// itself. That is the single most likely way to ship something that demos beautifully and is wrong.
// The defence here is blunt on purpose: during a capture the panel sends NOTHING except explicit
// dump requests, and any inbound message inside the suppression window of an outbound one is
// discarded rather than attributed. `sendsDuringCapture` is a constant that is false, so the rule
// is visible rather than implied by the absence of code.
//
// PURE. The store drives it and the screen renders it; nothing here touches MIDI, a bridge or a
// clock — times are passed in, so a session can be replayed in a test at whatever speed it likes.

import {
  CONFIDENCE, analyseSweep, attributeLiveMovement, classifyDiff, diffPayloads, fitChecksum,
  learnProvenance, volatileMask,
} from './captureInference.js';

/** The three states, in order. */
export const CAPTURE_STATE = {
  setup: 'setup',
  capture: 'capture',
  confirm: 'confirm',
};

/** Which of the plan's three modes a session is running in. */
export const CAPTURE_MODE = {
  /** The device transmits on edit. */
  live: 'live',
  /** The device answers dump requests but says nothing on edit. */
  dump: 'dump',
  /** A profile exists and is being verified rather than discovered. */
  verify: 'verify',
  /** Neither. Said on the first screen rather than after twenty minutes. */
  none: 'none',
};

/**
 * The panel sends nothing during a capture except explicit dump requests.
 *
 * A constant rather than an absence, so the rule can be read, asserted, and noticed if somebody
 * ever wants to change it.
 */
export const SENDS_DURING_CAPTURE = false;

/** How long after our own outbound message an inbound one is assumed to be its echo. */
export const ECHO_WINDOW_MS = 120;

/** Baselines taken at setup, to find the offsets that move on their own. */
export const BASELINE_COUNT = 3;

/**
 * Which mode this device supports.
 *
 * A synth that transmits nothing and dumps nothing cannot be learned, and the honest answer is on
 * the first screen. Twenty minutes of an unlearnable device is the worst outcome available.
 */
export function chooseMode({ transmitsOnEdit = false, answersDumpRequest = false, hasProfile = false } = {}) {
  if (hasProfile && (transmitsOnEdit || answersDumpRequest)) {
    return { mode: CAPTURE_MODE.verify, why: 'a profile already exists — verifying it is cheaper than rediscovering it' };
  }
  if (transmitsOnEdit) {
    return { mode: CAPTURE_MODE.live, why: 'the device transmits when its front panel moves' };
  }
  if (answersDumpRequest) {
    return { mode: CAPTURE_MODE.dump, why: 'the device says nothing on edit but answers a dump request' };
  }
  return {
    mode: CAPTURE_MODE.none,
    why: 'this device neither transmits on edit nor answers a dump request, so there is nothing to learn from. '
      + 'A profile for it has to be written by hand.',
  };
}

/** A new session. `now` is injected so a replayed session is deterministic. */
export function newSession({ mode = CAPTURE_MODE.dump, profileId = '', now = null } = {}) {
  return {
    id: `capture_${String(now ?? '')}`.replace(/\W+/g, '_'),
    profileId: String(profileId || ''),
    mode,
    state: CAPTURE_STATE.setup,
    baselines: [],
    mask: [],
    checksum: null,
    /** Observations of the control currently being learned. */
    observations: [],
    /** Live-transmit messages seen since the capture started. */
    messages: [],
    /** What has been learned and kept. */
    learned: [],
    hypothesis: null,
    startedAt: now ?? null,
  };
}

/** Add a setup baseline. Once there are enough, the volatile mask falls out. */
export function addBaseline(session, payload) {
  const baselines = [...(session.baselines ?? []), payload];
  const mask = baselines.length >= 2 ? [...volatileMask(baselines)] : [];
  return { ...session, baselines, mask };
}

/** Setup is done when the baselines are in and, if the dump has one, the checksum is fitted. */
export function readyToCapture(session) {
  if (session.mode === CAPTURE_MODE.live) return true;
  return (session.baselines?.length ?? 0) >= BASELINE_COUNT;
}

/**
 * Move to capture.
 *
 * The checksum is fitted here, once, from the setup baselines plus whatever else is to hand — and
 * it has to be, because without it every diff carries a spurious trailing byte and every
 * classification is one offset too wide.
 */
export function beginCapture(session, { extraPayloads = [] } = {}) {
  const payloads = [...(session.baselines ?? []), ...extraPayloads];
  return {
    ...session,
    state: CAPTURE_STATE.capture,
    checksum: session.checksum ?? fitChecksum(payloads),
    observations: [],
    messages: [],
    hypothesis: null,
  };
}

/**
 * Record a dump taken after the human moved something.
 *
 * The previous payload is the last observation's, or the final baseline — so the first move is
 * measured against a real starting state rather than against nothing.
 */
export function recordDump(session, payload) {
  const previous = session.observations?.at(-1)?.payload
    ?? session.baselines?.at(-1)
    ?? null;
  if (!previous) return session;

  const mask = new Set(session.mask ?? []);
  const observations = [...(session.observations ?? []), {
    changed: diffPayloads(previous, payload, mask),
    payload,
  }];
  const hypothesis = classifyDiff(observations, {
    checksum: session.checksum,
    payloadLength: payload.length,
  });
  return { ...session, observations, hypothesis };
}

/**
 * Record inbound live messages, discarding anything that could be our own echo.
 *
 * `sentAt` is when the panel last transmitted. Inside the window the message is dropped without
 * being counted — the alternative is a session that learns the panel's own output, which looks
 * exactly like success.
 */
export function recordMessages(session, messages, { at = 0, sentAt = null } = {}) {
  const suppressed = sentAt !== null && at - sentAt < ECHO_WINDOW_MS;
  if (suppressed) return { ...session, lastSuppressed: messages.length };

  const all = [...(session.messages ?? []), ...(Array.isArray(messages) ? messages : [])];
  const attribution = attributeLiveMovement(all);
  const sweep = attribution.hit ? analyseSweep(attribution.hit.values) : null;

  return {
    ...session,
    messages: all,
    lastSuppressed: 0,
    hypothesis: attribution.hit
      ? {
        kind: attribution.hit.kind,
        controller: attribution.hit.controller,
        channel: attribution.hit.channel,
        confidence: attribution.ambiguous ? CONFIDENCE.candidate : (sweep?.confidence ?? CONFIDENCE.candidate),
        why: `${attribution.why}; ${sweep?.why ?? ''}`.trim(),
        range: sweep ? { min: sweep.min, max: sweep.max } : null,
        valueType: sweep?.valueType ?? 'continuous',
        signed: sweep?.signed === true,
        ambiguous: attribution.ambiguous === true,
      }
      : { kind: 'none', confidence: CONFIDENCE.candidate, why: attribution.why },
  };
}

/** Move to the naming step. Only worth doing when there is something to name. */
export function toConfirm(session) {
  if (!session.hypothesis || session.hypothesis.kind === 'none') return session;
  return { ...session, state: CAPTURE_STATE.confirm };
}

/**
 * Keep what was learned and go round again.
 *
 * `verified` is the human's answer to "did the synth do the thing" — the ground truth no amount of
 * byte analysis substitutes for. It is what promotes a probable hypothesis to confirmed, and
 * nothing else does.
 */
export function acceptHypothesis(session, { id = '', label = '', group = '', verified = false, now = null } = {}) {
  const hypothesis = session.hypothesis;
  if (!hypothesis) return session;

  const confidence = verified ? CONFIDENCE.confirmed : hypothesis.confidence;
  const learned = [...(session.learned ?? []), {
    id: String(id || label || `learned_${session.learned?.length ?? 0}`).trim(),
    label: String(label || id || 'Unnamed'),
    group: String(group || ''),
    kind: hypothesis.kind,
    encoding: hypothesis.encoding ?? null,
    offsets: hypothesis.offsets ?? [],
    size: hypothesis.size ?? null,
    controller: hypothesis.controller ?? null,
    range: hypothesis.range ?? null,
    valueType: hypothesis.valueType ?? null,
    confidence,
    provenance: learnProvenance({ ...hypothesis, confidence }, { at: now, sessionId: session.id }),
  }];

  return {
    ...session,
    learned,
    state: CAPTURE_STATE.capture,
    observations: [],
    messages: [],
    hypothesis: null,
  };
}

/** Throw the current hypothesis away and try the same control again. */
export function discardHypothesis(session) {
  return { ...session, observations: [], messages: [], hypothesis: null };
}

/**
 * Undo the last thing kept.
 *
 * S5 calls session ergonomics "not optional", and this is the smallest piece of it that matters:
 * naming twenty parameters and being unable to fix the third is what makes somebody stop.
 */
export function undoLast(session) {
  if (!(session.learned?.length)) return session;
  return { ...session, learned: session.learned.slice(0, -1) };
}

/**
 * What the session would write into the profile.
 *
 * Split by confidence, because they land differently: confirmed and probable become parameters,
 * candidates become draft rows with their alternatives, and conflicts are a question rather than a
 * write. "High confidence writes a parameter. Low confidence writes a candidate. Nothing writes
 * silence."
 */
export function sessionHarvest(session) {
  const learned = session.learned ?? [];
  const parameters = learned.filter((entry) => entry.confidence === CONFIDENCE.confirmed
    || entry.confidence === CONFIDENCE.probable);
  return {
    parameters,
    // Both land as parameters, and they are not the same thing. `confirmed` means a person moved
    // the control and said the synth did what it should; `probable` means the bytes looked right
    // and nobody checked. Kept apart here because the summary below is the only place anybody sees
    // the shape of a session, and a run where two of thirty were verified read exactly like a run
    // where all thirty were — which is the failure this function's own comment warns about, one
    // level up.
    verified: parameters.filter((entry) => entry.confidence === CONFIDENCE.confirmed),
    unverified: parameters.filter((entry) => entry.confidence === CONFIDENCE.probable),
    candidates: learned.filter((entry) => entry.confidence === CONFIDENCE.candidate),
    conflicts: learned.filter((entry) => entry.confidence === CONFIDENCE.conflict),
    total: learned.length,
  };
}

/**
 * Match a list of names pasted out of a manual against what the session has learned.
 *
 * S5 asks for this and the plan says why in one line: the manual is still useful — as NAMES, which
 * it gets right, and not as BYTES, which is where it lies. Nobody wants to type "Filter Envelope
 * Attack" thirty times when the page they are reading already has all thirty in order.
 *
 * POSITIONAL, and it says so rather than trying to be clever. The nth non-empty line names the nth
 * parameter learned, because that is the order somebody sweeps a panel in and any attempt to match
 * by similarity would silently pair "Cutoff" with "Cutoff Env Amount" on a page that has both. What
 * it does instead is report the mismatch: more names than parameters, or fewer, is something the
 * author has to look at, and a paste that is off by one at the top would otherwise rename
 * everything below it.
 *
 * `id` is derived from the label rather than taken from a second column. A manual page is one
 * column of names, and asking somebody to build a two-column paste is asking them to do the typing
 * this exists to avoid.
 */
export function namesFromPaste(text, session) {
  const learned = session?.learned ?? [];
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\u2022]?\s*/, '').trim())
    .filter(Boolean);

  const pairs = lines.slice(0, learned.length).map((label, index) => ({
    index,
    label,
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `learned_${index}`,
    was: String(learned[index]?.label ?? ''),
  }));

  return {
    pairs,
    // Both directions are worth reporting. Too few names leaves parameters unnamed at the bottom;
    // too many means the paste includes rows the session never captured, which usually means it
    // started one line too high.
    unnamed: Math.max(0, learned.length - lines.length),
    extra: Math.max(0, lines.length - learned.length),
  };
}

/** Apply a `namesFromPaste` result. Separate, so the screen can show the pairing before it lands. */
export function applyPastedNames(session, pairs) {
  const learned = [...(session?.learned ?? [])];
  for (const pair of pairs ?? []) {
    const entry = learned[pair.index];
    if (!entry) continue;
    learned[pair.index] = { ...entry, id: String(pair.id), label: String(pair.label) };
  }
  return { ...session, learned };
}

/**
 * The session report S5 asks for.
 *
 * The summary line says how many; this says WHICH, and carries each parameter's evidence with it.
 * That is the part worth keeping after the session is closed: six months later "u7 at offset 0x2C,
 * values 0-127, checksum moved with it" is the difference between trusting a row and re-capturing
 * it.
 *
 * Grouped by how much the row is worth trusting, hardest first, because a report that lists thirty
 * parameters in capture order buries the four that need attention. Plain text rather than a
 * structure: it goes in a bug report, an email to somebody with the same synth, or a comment in a
 * profile, and all three take text.
 */
export function sessionReport(session) {
  const harvest = sessionHarvest(session);
  const lines = [`Capture session ${session?.id ?? ''}`.trim(), sessionSummary(session), ''];

  const section = (title, rows, note) => {
    if (!rows.length) return;
    lines.push(`## ${title} (${rows.length})`);
    if (note) lines.push(note);
    for (const row of rows) {
      lines.push(`- ${row.label || row.id || 'Unnamed'} — ${row.kind}`
        + `${row.offsets?.length ? ` at ${row.offsets.join(', ')}` : ''}`);
      const why = row.provenance?.evidence;
      if (why) lines.push(`    ${why}`);
    }
    lines.push('');
  };

  section('Verified on the synth', harvest.verified,
    'Somebody moved the control and confirmed the device did what it should.');
  section('Probable', harvest.unverified,
    'The bytes look right and nobody checked. These export as parameters anyway.');
  section('Still a guess', harvest.candidates,
    'Not enough evidence to call. These export as candidates, not parameters.');
  section('In conflict', harvest.conflicts,
    'Two readings that disagree. A question rather than a write.');

  return lines.join('\n').trim();
}

/**
 * A one-line summary of the session, for the report S5 asks for.
 *
 * Says what was NOT settled as prominently as what was: a session that learned thirty parameters
 * and left four as candidates has done well, and hiding the four is how a 95%-right profile gets
 * shipped as a finished one.
 */
export function sessionSummary(session) {
  const harvest = sessionHarvest(session);
  const parts = [`${harvest.parameters.length} parameter${harvest.parameters.length === 1 ? '' : 's'}`];
  // Only when some were and some were not. "30 parameters, 30 verified" is noise, and "30
  // parameters" alone when none were verified is the thing worth not saying quietly.
  if (harvest.unverified.length) {
    parts.push(harvest.verified.length
      ? `${harvest.verified.length} verified on the synth`
      : 'none verified on the synth');
  }
  if (harvest.candidates.length) parts.push(`${harvest.candidates.length} still a guess`);
  if (harvest.conflicts.length) parts.push(`${harvest.conflicts.length} in conflict`);
  const shared = (session.learned ?? []).filter((entry) => entry.kind === 'bitslice');
  if (shared.length) parts.push(`${shared.length} sharing a byte with something else`);
  return parts.join(' · ');
}
