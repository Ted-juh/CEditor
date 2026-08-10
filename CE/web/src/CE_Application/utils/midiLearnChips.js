/**
 * What just moved on the MIDI input, as something you can pick up.
 *
 * MIDI learn already existed and reached exactly one control: RouterEditor arms a session, the
 * reducer watches for a window and returns the controller that moved the most. That heuristic is
 * there because a raw CC does not say what it is — brushing a key on the way to the mod wheel sends
 * a note, and some keyboards trickle aftertouch constantly, so the first message to arrive is the
 * wrong answer. Nothing else in the app could learn anything.
 *
 * Two things changed that. The inbound index can now say WHICH PARAMETER a message belongs to, so a
 * candidate can carry a name instead of a controller number. And the drag-to-bind path in
 * CanvasControl — the drop handler, the compatibility preview, the surface highlight, the whole
 * `deviceParameterDrag` store — turned out to have no drag source anywhere in the app. Chips are
 * that source.
 *
 * SYSEX IS THE POINT, not an extra. The learn reducer skips it deliberately ("a dump, not
 * performance data"), which is right for a keyboard and wrong for the instrument this app is built
 * around: the GAIA transmits three of its knobs as CC and everything else — every envelope, filter
 * and LFO control — as a DT1. A chip strip that could only show CC would be blank for almost the
 * whole synth. A DT1 also needs no heuristic at all: the address names the parameter exactly, so
 * there is nothing to rank and nothing to guess.
 *
 * MOST RECENT FIRST, not most-moved. The one-shot session ranks by span because it has to pick a
 * winner from a window. A strip is read differently: you wiggle the control you want and take the
 * chip that just appeared. Span and message count are still shown, as evidence.
 */

import { EMPTY_LEARN_STATE, applyLearnHex, learnCandidateLabel, learnCandidates } from './midiNoteInput.js';
import { decodeInbound } from './inboundParameterIndex.js';
import { midiControlParameterShape } from './midiControlBindings.js';

export const EMPTY_CHIP_STATE = Object.freeze({ learn: EMPTY_LEARN_STATE, sysex: {}, seen: {}, seq: 0 });

/** How many chips the strip keeps. Enough to cover a section of a panel, few enough to scan. */
export const CHIP_LIMIT = 12;

const isSysexHex = (hex) => /^\s*f0/i.test(String(hex ?? ''));

/** Does this parameter carry a number? A raw controller always does; a patch name does not. */
const isNumeric = (parameter) =>
  !parameter || (Number.isFinite(Number(parameter?.range?.min)) && Number.isFinite(Number(parameter?.range?.max)));

/**
 * Fold one incoming message into the chip state.
 *
 * `index` may be null — the profile source arrives asynchronously, and until it does the CC side
 * still works, it just cannot name anything.
 */
export function applyChipHex(state, hex, index = null) {
  const current = state ?? EMPTY_CHIP_STATE;
  if (!hex) return current;

  if (isSysexHex(hex)) {
    const hit = index ? decodeInbound(index, hex) : null;
    // An unrecognised sysex is not a candidate. It could be an identity reply, a dump, or another
    // instrument entirely, and a chip that says "some sysex happened" is not something you can bind.
    if (!hit?.parameterId) return current;
    const previous = current.sysex[hit.parameterId];
    const entry = previous
      ? { ...previous, min: Math.min(previous.min, hit.value), max: Math.max(previous.max, hit.value), count: previous.count + 1, last: hit.value }
      : { min: hit.value, max: hit.value, count: 1, last: hit.value };
    return {
      ...current,
      sysex: { ...current.sysex, [hit.parameterId]: entry },
      seen: { ...current.seen, [`param:${hit.parameterId}`]: current.seq + 1 },
      seq: current.seq + 1,
    };
  }

  const learn = applyLearnHex(current.learn, hex);
  if (learn === current.learn) return current;

  // Stamp only the keys this message actually touched, so one CC arriving does not reorder the rest.
  const seen = { ...current.seen };
  let seq = current.seq;
  for (const candidate of learnCandidates(learn)) {
    const previous = current.learn.candidates[candidate.key];
    if (!previous || previous.count !== candidate.count) seen[candidate.key] = ++seq;
  }
  return { ...current, learn, seen, seq };
}

/** A CC candidate as the message that would have produced it, so the index can be asked about it. */
function candidateHex(candidate) {
  if (candidate.kind !== 'cc' || candidate.cc == null) return '';
  const channel = Math.min(16, Math.max(1, Math.round(Number(candidate.channel) || 1)));
  const byte = (n) => n.toString(16).toUpperCase().padStart(2, '0');
  return `${byte(0xb0 + channel - 1)} ${byte(candidate.cc & 0x7f)} ${byte(candidate.last & 0x7f)}`;
}

/**
 * The chips, newest first.
 *
 * A chip carries a `parameter` when the profile can name it. One that does not is still bindable if
 * it is a CC, as the message rather than as a name — see midiControlBindings.js. What is left over
 * is aftertouch, velocity and poly pressure, which no binding kind covers; those are listed anyway,
 * with the reason, because a controller that appears dead teaches nothing.
 */
export function chipList(state, { index = null, parameterById = {} } = {}) {
  const current = state ?? EMPTY_CHIP_STATE;
  const chips = [];

  for (const [parameterId, entry] of Object.entries(current.sysex ?? {})) {
    const parameter = parameterById[parameterId] ?? null;
    chips.push({
      key: `param:${parameterId}`,
      origin: 'sysex',
      parameterId,
      parameter,
      label: parameter?.name || parameterId,
      detail: 'SysEx',
      span: entry.max - entry.min,
      count: entry.count,
      // A parameter with no numeric range is not carrying a number — the GAIA's patch name is 12
      // ASCII bytes, and the decoder, asked for one byte, hands back the first character. Printing
      // that as a value would be a confident wrong number next to a correct name.
      last: isNumeric(parameter) ? entry.last : null,
      seen: current.seen[`param:${parameterId}`] ?? 0,
      reason: parameter ? '' : 'not in the loaded profile',
    });
  }

  for (const candidate of learnCandidates(current.learn)) {
    const parameterId = index ? decodeInbound(index, candidateHex(candidate))?.parameterId ?? null : null;
    const parameter = parameterId ? parameterById[parameterId] ?? null : null;
    const raw = learnCandidateLabel(candidate);
    chips.push({
      key: candidate.key,
      origin: candidate.kind,
      parameterId,
      parameter,
      label: parameter?.name || raw,
      detail: parameter ? raw : `ch ${candidate.channel}`,
      controller: candidate.kind === 'cc' ? candidate.cc : null,
      span: candidate.span,
      count: candidate.count,
      last: candidate.last,
      seen: current.seen[candidate.key] ?? 0,
      // A raw CC is bindable now — as the message rather than as a name — so the only chips left
      // with nothing to offer are the ones no binding kind covers.
      reason: parameter ? '' : (candidate.kind === 'cc'
        ? 'not in this profile — binds as a raw CC'
        : 'aftertouch and velocity have no binding kind yet'),
    });
  }

  return chips.sort((a, b) => b.seen - a.seen).slice(0, CHIP_LIMIT);
}

/**
 * The payload the drop path in CanvasControl expects.
 *
 * Two shapes over one MIME type, because a drop target should not need to know which it is getting
 * until it commits: both carry a `parameter` that getBindingCompatibility can read, so the accept
 * check and the drag highlight are the same code for both.
 *
 *   ceditor.deviceParameter — a named parameter from the profile.
 *   ceditor.midiControl     — a raw CC, described as the 0-127 integer it is.
 *
 * Null only for the things that genuinely cannot be bound: aftertouch, velocity and poly pressure
 * have no binding kind at all, so a chip for one stays inert rather than starting a drag the
 * surface would refuse.
 */
export function chipDragPayload(chip, deviceRole) {
  const role = String(deviceRole ?? '');
  if (chip?.parameter?.id) {
    return { kind: 'ceditor.deviceParameter', parameter: chip.parameter, deviceRole: role };
  }
  if (chip?.origin === 'cc' && Number.isFinite(Number(chip?.controller))) {
    return {
      kind: 'ceditor.midiControl',
      controller: Number(chip.controller),
      parameter: midiControlParameterShape(chip.controller),
      deviceRole: role,
    };
  }
  return null;
}
