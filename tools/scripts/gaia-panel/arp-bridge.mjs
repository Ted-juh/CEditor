// arp-bridge.mjs — the drawn arpeggio pattern, written out to the synth.
//
// WHAT WAS MISSING. The panel's bottom row is the engine's arpeggiator surface: draw a block, drag
// it, drag its right edge to lengthen it. Those blocks lived in the component and published through
// the `arpPattern` channel, and stopped there. The GAIA's sixteen Patch Arpeggio Pattern blocks —
// 528 addresses, all of them in the profile — were never written, so the grid edited a pattern and
// not a synth. This is the bridge that was said to have "somewhere to land"; it lands here.
//
// ONE SOURCE, TWO PLACES. `blocksToLanes` is a plain function with no imports and no closure. It is
// tested in Node like any other pure function, and its SOURCE TEXT is inlined verbatim into the
// panel's script by `arpBridgeScript()` below. Writing the transform twice — once testable, once
// shipped — is how the two versions start disagreeing about ties on the third edit.
//
// THE GAIA'S OWN SEMANTICS, from the MIDI implementation and transcribed in address-map.mjs:
//
//   Original Note   0..127, or 128 for OFF — a lane the arpeggiator skips entirely
//   Step n Data     0 for a rest, 1..127 for a velocity, 128 to tie to the previous step
//
// So a block of length 4 is one velocity followed by three ties, which is why length is not simply
// "write the velocity four times": four velocities is four notes retriggering, and it sounds like
// a stutter rather than a held note.

/** Sixteen Patch Arpeggio Pattern blocks, from the MIDI implementation. Not a tunable. */
export const ARP_LANES = 16;

/**
 * Blocks the grid drew -> the sixteen lanes the GAIA stores.
 *
 * Self-contained by contract: no imports, no closure, no optional chaining on globals. This
 * function's own source is what runs inside the panel.
 *
 * @param {Array<{note:number, step:number, length:number, velocity:number}>} blocks
 * @param {{lanes?:number, steps?:number}} shape
 * @returns {{lanes: Array<{originalNote:number, steps:number[]}>, dropped: number[]}}
 */
export function blocksToLanes(blocks, shape) {
  var laneCount = (shape && shape.lanes) || 16;
  var stepCount = (shape && shape.steps) || 32;
  var list = Array.isArray(blocks) ? blocks : [];

  // One lane per distinct note, ascending. The hardware does not care about the order, but a stable
  // one does: without it, adding a block could renumber every lane and rewrite all 528 addresses
  // for an edit that touched one step.
  var notes = [];
  for (var i = 0; i < list.length; i++) {
    var n = Math.round(Number(list[i] && list[i].note));
    if (!isFinite(n) || n < 0 || n > 127) continue;
    if (notes.indexOf(n) === -1) notes.push(n);
  }
  notes.sort(function (a, b) { return a - b; });

  var kept = notes.slice(0, laneCount);
  var dropped = notes.slice(laneCount);

  var lanes = [];
  for (var lane = 0; lane < laneCount; lane++) {
    var steps = [];
    for (var s = 0; s < stepCount; s++) steps.push(0);
    // 128 = OFF. An unused lane must say so rather than sit at note 0, which is a real C-1 the
    // arpeggiator would play.
    lanes.push({ originalNote: lane < kept.length ? kept[lane] : 128, steps: steps });
  }

  for (var b = 0; b < list.length; b++) {
    var block = list[b] || {};
    var note = Math.round(Number(block.note));
    var index = kept.indexOf(note);
    if (index === -1) continue;

    var start = Math.round(Number(block.step));
    if (!isFinite(start) || start < 0 || start >= stepCount) continue;

    var length = Math.round(Number(block.length));
    if (!isFinite(length) || length < 1) length = 1;

    var velocity = Math.round(Number(block.velocity));
    if (!isFinite(velocity)) velocity = 96;
    // 0 is a REST on the wire, so a block can never write it — a block that exists is a note. 127
    // is the ceiling; 128 is the tie marker and is not a velocity anyone can ask for.
    if (velocity < 1) velocity = 1;
    if (velocity > 127) velocity = 127;

    lanes[index].steps[start] = velocity;
    for (var t = 1; t < length && start + t < stepCount; t++) lanes[index].steps[start + t] = 128;
  }

  return { lanes: lanes, dropped: dropped };
}

/**
 * The panel-scope script that keeps the synth in step with the grid.
 *
 * WRITES ONLY WHAT CHANGED, and that is not an optimisation. 528 DT1 messages per edit, at the
 * GAIA's own inter-message gap, is several seconds of MIDI for dragging one block one step — the
 * synth would still be chewing through the last edit while you made the next three. Holding the
 * previous lanes and diffing turns a typical edit into one or two messages.
 *
 * DEBOUNCED, because a drag fires `watch` on every pointer move. The delay is short enough to feel
 * immediate and long enough that a drag sends once at the end rather than forty times through it.
 */
export function arpBridgeScript(gridControlName, { debounceMs = 120, lanes = 16, steps = 32 } = {}) {
  return `// Arpeggio pattern -> the GAIA's 528 Patch Arpeggio Pattern addresses.
//
// Generated by tools/scripts/gaia-panel/arp-bridge.mjs. The transform below is that file's own
// blocksToLanes, inlined verbatim rather than rewritten, so the version under test and the version
// that runs are the same text.

${blocksToLanes.toString()}

var LANES = ${lanes};
var STEPS = ${steps};
var sent = null;      // the last lanes actually written, for diffing
var pending = false;

function laneParam(lane, key) {
  // The profile's ids: arpPattern.note1.originalNote, arpPattern.note1.step1Data ... step32Data.
  return "arpPattern.note" + (lane + 1) + "." + key;
}

function pushPattern() {
  pending = false;
  var blocks = get("${gridControlName}.designer.arpeggiator.blocks");
  if (!blocks) return;

  var built = blocksToLanes(blocks, { lanes: LANES, steps: STEPS });
  var writes = 0;

  for (var lane = 0; lane < LANES; lane++) {
    var next = built.lanes[lane];
    var prev = sent ? sent[lane] : null;

    if (!prev || prev.originalNote !== next.originalNote) {
      ce.device.write(laneParam(lane, "originalNote"), next.originalNote);
      writes++;
    }
    for (var s = 0; s < STEPS; s++) {
      if (prev && prev.steps[s] === next.steps[s]) continue;
      ce.device.write(laneParam(lane, "step" + (s + 1) + "Data"), next.steps[s]);
      writes++;
    }
  }

  sent = built.lanes;
  if (built.dropped.length) {
    // Said out loud rather than silently truncated: the GAIA has sixteen lanes and the grid does
    // not stop you drawing a seventeenth note.
    log("arp: " + built.dropped.length + " note(s) past the GAIA's " + LANES
      + " lanes were not sent — " + built.dropped.join(", "));
  }
  if (writes) log("arp: " + writes + " parameter(s) written");
}

function onPanelLoad() {
  // A drag fires this on every pointer move, so coalesce: one send at the end of a gesture rather
  // than forty through it.
  watch("${gridControlName}.designer.arpeggiator.blocks", function () {
    if (pending) return;
    pending = true;
    after(${debounceMs}, pushPattern);
  });
}
`;
}
