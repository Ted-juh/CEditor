// Shared by the panel's MIDI bridge generator and readback verification.
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
