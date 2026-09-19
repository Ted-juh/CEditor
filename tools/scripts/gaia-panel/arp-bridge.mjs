// arp-bridge.mjs — the drawn arpeggio pattern, written out to the synth.
//
// WHAT WAS MISSING. The panel's bottom row is the engine's arpeggiator surface: draw a block, drag
// it, drag its right edge to lengthen it. Those blocks lived in the component and published through
// the `arpPattern` channel, and stopped there. The GAIA's sixteen Patch Arpeggio Pattern blocks —
// 528 addresses, all of them in the profile — were never written, so the grid edited a pattern and
// not a synth. This is the bridge that was said to have "somewhere to land"; it lands here.
//
// WHERE IT READS THE PATTERN FROM, which is the part that was wrong for a whole release. The first
// version watched `<grid>.designer.arpeggiator.blocks`. That path exists — the component design
// surface writes it — but a user DRAWING on the grid does not go anywhere near it: an interactive
// edit lands in the preview session as `customValues.__arpeggiator`, and `syncCustomArpeggiatorValues`
// republishes it through the `arpPattern` value channel. The document's Designer blocks never move,
// so the watcher never fired, not one address was written, and nothing said so.
//
// It now watches `<grid>.arpPattern` — the channel a real grid edit actually publishes. That needed
// the script runtime to be able to read a custom component's channel at all (scripting/liveValue.js);
// before that, every read of one fell through to the document. The lesson worth keeping: a test that
// hands the script a fake `get` proves the script asks for the right thing, not that the right thing
// answers. gaiaArpBridge.test.js now drives the real runtime for exactly that reason.
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

/** Visual-only loop boundary. Does not rewrite, truncate, or transmit the note pattern. */
export function arpEndStepScript(gridControlName, endStepControlId) {
  return `function updateEndStep() {
  var value = Number(get("${endStepControlId}.value"));
  if (isFinite(value)) set("${gridControlName}.arpEndStep", Math.max(1, Math.min(32, Math.round(value))));
}
function onPanelLoad() {
  updateEndStep();
  watch("${endStepControlId}.value", updateEndStep);
}
`;
}

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
export { blocksToLanes } from '../../../CE/web/src/CE_Application/utils/gaiaArpPattern.js';
import { blocksToLanes } from '../../../CE/web/src/CE_Application/utils/gaiaArpPattern.js';

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
/**
 * blocksToLanes as source text, with its line endings normalized.
 *
 * Function.prototype.toString() hands back the function's RAW SOURCE SLICE as it sits on disk. On a
 * Windows checkout that is CRLF — and this string is then embedded in a panel script and
 * JSON.stringify'd, which escapes each "\r\n" as the four-character `\\r\\n` instead of the
 * two-character `\\n`. So the generated .cepanel came out 104 characters longer on Windows than on
 * Linux, from the same source.
 *
 * That one is worse than an ordinary line-ending mismatch, and worth being precise about. The CR
 * ends up ESCAPED INSIDE A JSON STRING, so there is no raw CR byte left in the file: .gitattributes
 * cannot normalize it, reading the file through readText cannot fold it, and the freshness gate's
 * "identical apart from line endings" hint never fires. It reads as a genuinely stale panel — and
 * the obvious response, regenerating and committing, writes the corruption in for everybody.
 *
 * So the fold happens HERE, at the only point where the checkout can leak into generated output.
 */
const inlinedTransform = () => blocksToLanes.toString().replace(/\r\n/g, '\n');

export function arpBridgeScript(gridControlName, { debounceMs = 120, lanes = 16, steps = 32 } = {}) {
  return `// Arpeggio pattern -> the GAIA's 528 Patch Arpeggio Pattern addresses.
//
// Generated by tools/scripts/gaia-panel/arp-bridge.mjs. The transform below is that file's own
// blocksToLanes, inlined verbatim rather than rewritten, so the version under test and the version
// that runs are the same text.

${inlinedTransform()}

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
  var blocks = get("${gridControlName}.arpPattern");
  if (!blocks || !blocks.length) return;

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
  watch("${gridControlName}.arpPattern", function () {
    if (pending) return;
    pending = true;
    after(${debounceMs}, pushPattern);
  });
}
`;
}
