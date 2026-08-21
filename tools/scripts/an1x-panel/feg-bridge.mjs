// feg-bridge.mjs — the drawn Free EG curves, written out to the AN1x.
//
// WHAT WAS MISSING. The panel's FREE EG box is four Envelope controls, one per track, and they were
// documented in make-an1x-panel.mjs as editing the panel's copy and nothing else: "what does not
// exist is a binding kind that maps one curve onto an array of parameters. Until it does, this lane
// edits the panel's copy." The addresses have been in the profile all along — 192 two-byte samples
// per track at 10 00 68, 10 03 68, 10 06 68, 10 09 68 — so this is the second of the two ways that
// note said were open: 192 parameter writes rather than one voiceCommon bulk send.
//
// WHY PARAMETER WRITES AND NOT THE BULK SEND. The bulk is Voice Common, 668h of it, and the Free EG
// is a small part of that. Sending it to move a curve would also send every oscillator, filter and
// effect value the panel currently holds — which is the whole voice, from a control that says it is
// editing a curve. A parameter write moves exactly what was moved.
//
// WHERE IT READS FROM. `<name>.envelope.points`, the document path. An Envelope drag holds its
// in-progress shape in the preview session (`envPoints`) and commits to the document through
// PanelPreviewSurface.commitEnvPoints -> updateControlProperty on release. Watching the document
// path therefore fires once per gesture rather than once per pointer move, which is the debounce the
// arp bridge had to build by hand. That is worth stating because the obvious-looking alternative —
// watching the session — would fire forty times a drag and write 192 addresses each time.
//
// The GAIA's arp bridge learned this the expensive way: its first version watched a path that
// existed and that a real edit never touched, so it never fired and nothing said so. an1xFegBridge
// .test.js drives the real runtime and commits points the way the preview surface does, for exactly
// that reason.
//
// THE AN1X'S OWN SEMANTICS, from the Data List:
//
//   Free EG Track n Data   192 samples, two bytes each (u14 on the wire), value 0..255
//   Centre                 128 — the value a flat track sits at, and the parameter default
//
// So y=0.5 on the curve is 128 on the wire, and a flat line writes 192 identical bytes rather than
// zeroes. Zero is a real extreme of the modulation range, not "off".

/** 192 samples per track, four tracks. From the Data List; not a tunable. */
export const FEG_POINTS = 192;
export const FEG_TRACKS = 4;
/** The wire range of one sample. */
export const FEG_MIN = 0;
export const FEG_MAX = 255;

/**
 * Envelope control points -> the 192 samples the AN1x stores.
 *
 * Self-contained by contract: no imports, no closure, no optional chaining. This function's own
 * source is what runs inside the panel, inlined verbatim by fegBridgeScript() below, so that the
 * version under test and the version that runs cannot drift apart.
 *
 * THE WARP IS A COPY, and that is the one thing here worth guarding. The app eases a segment in
 * utils/envelopeLayout.js (envWarp), and this has to agree with it or a curve drawn as `exp` would
 * be sent as something else. It cannot import that function — the panel script has no module
 * system — so an1xFegBridge.test.js asserts the two agree across every name in ENVELOPE_CURVES and
 * a sweep of tensions. A curve added to the app without being added here fails that test.
 *
 * @param {Array<{x:number, y:number, curve?:string, tension?:number}>} points
 * @param {number} count how many samples to produce (192 on the AN1x)
 * @returns {number[]} `count` integers in 0..255
 */
export function curveToPoints(points, count) {
  var total = Math.max(1, Math.round(Number(count) || 0));
  var list = Array.isArray(points) ? points : [];

  var clean = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i] || {};
    var x = Number(p.x);
    var y = Number(p.y);
    if (!isFinite(x) || !isFinite(y)) continue;
    if (x < 0) x = 0; else if (x > 1) x = 1;
    if (y < 0) y = 0; else if (y > 1) y = 1;
    clean.push({ x: x, y: y, curve: String(p.curve || 'linear'), tension: Number(p.tension) || 0 });
  }

  // A curve with nothing usable in it is FLAT AT CENTRE, not flat at zero: 128 is where the
  // parameter's own default sits, and 0 is a real extreme of the modulation range.
  var mid = Math.round((FEG_MIN + FEG_MAX) / 2);
  if (clean.length === 0) {
    var flat = [];
    for (var f = 0; f < total; f++) flat.push(mid);
    return flat;
  }

  clean.sort(function (a, b) { return a.x - b.x; });

  var out = [];
  var segment = 0;
  for (var s = 0; s < total; s++) {
    var t = total === 1 ? 0 : s / (total - 1);

    // Walk forward with the sample rather than searching per sample: both are sorted, so the
    // segment index only ever moves one way. 192 samples over a curve of a few hundred nodes.
    while (segment < clean.length - 2 && clean[segment + 1].x < t) segment++;

    var a = clean[segment];
    var b = clean[segment + 1];
    var value;
    if (b === undefined) {
      value = a.y;                                   // past the last node: hold it
    } else if (t <= a.x) {
      value = a.y;                                   // before the first node: hold it
    } else {
      var span = b.x - a.x;
      // Coincident nodes are a vertical step. Taking b is what the editor draws, and dividing by
      // zero here would put NaN into 192 addresses.
      var local = span > 0 ? (t - a.x) / span : 1;
      if (local < 0) local = 0; else if (local > 1) local = 1;
      // The curve and tension belong to the node ENDING the segment — envelopeLayout.js says so,
      // and reading them off `a` instead would shift every shape one segment left.
      var warped = fegWarp(local, b.curve, b.tension);
      value = a.y + (b.y - a.y) * warped;
    }

    var wire = Math.round(value * FEG_MAX);
    if (wire < FEG_MIN) wire = FEG_MIN; else if (wire > FEG_MAX) wire = FEG_MAX;
    out.push(wire);
  }

  return out;
}

/**
 * The segment easing, mirroring utils/envelopeLayout.js envWarp.
 *
 * Kept a separate exported function so the agreement test can call it directly, and inlined
 * alongside curveToPoints so the panel script has it.
 */
export function fegWarp(t, curve, tension) {
  var tt = Number(t);
  if (!isFinite(tt) || tt < 0) tt = 0; else if (tt > 1) tt = 1;
  var k = 1 + Math.max(0, Number(tension) || 1.6);
  var name = String(curve);
  if (name === 'exp') return Math.pow(tt, k);
  if (name === 'log') return 1 - Math.pow(1 - tt, k);
  if (name === 'scurve') return tt * tt * (3 - 2 * tt);
  if (name === 'hold') return tt >= 1 ? 1 : 0;
  return tt;
}

/** The parameter id of one sample. Track 1 is unprefixed; the scope names the rest. */
export function fegParam(track, index) {
  return (track === 1 ? '' : 'fegTrack' + track + '.') + 'fegPoint' + index;
}

/**
 * The two functions as source text, with line endings normalized.
 *
 * Function.prototype.toString() hands back the raw source slice as it sits on disk, which on a
 * Windows checkout is CRLF. Embedded in a panel script and JSON.stringify'd, each "\r\n" escapes to
 * the four-character `\\r\\n` rather than `\\n`, so the generated .cepanel comes out longer on
 * Windows than on Linux from identical source — and because the CR ends up escaped INSIDE a JSON
 * string there is no raw CR byte left for .gitattributes to normalize or the freshness gate to spot.
 * It reads as a genuinely stale panel, and regenerating commits the corruption for everybody. Folded
 * here, at the only point where the checkout can leak into generated output. Same reasoning, and the
 * same fix, as arp-bridge.mjs.
 */
const inlinedTransform = () =>
  `${fegWarp.toString()}\n\n${curveToPoints.toString()}`.replace(/\r\n/g, '\n');

/**
 * The panel-scope script that keeps the AN1x's Free EG in step with the drawn curves.
 *
 * WRITES ONLY WHAT CHANGED. 768 DT1 messages — four tracks of 192 — at the AN1x's inter-message gap
 * is many seconds of MIDI for nudging one node. Holding the last sent samples and diffing turns a
 * typical edit into the handful of samples inside the segment that actually moved, and leaves the
 * other three tracks alone entirely.
 */
export function fegBridgeScript(trackControlNames, { points = FEG_POINTS } = {}) {
  const names = Array.isArray(trackControlNames) ? trackControlNames : [];
  return `// Free EG curves -> the AN1x's four tracks of 192 samples.
//
// Generated by tools/scripts/an1x-panel/feg-bridge.mjs. The transform below is that file's own
// curveToPoints and fegWarp, inlined verbatim rather than rewritten, so the version under test and
// the version that runs are the same text.

var FEG_MIN = ${FEG_MIN};
var FEG_MAX = ${FEG_MAX};
var POINTS = ${points};
var TRACKS = ${JSON.stringify(names)};

${inlinedTransform()}

var sent = [];        // the last samples actually written, per track, for diffing

function fegParam(track, index) {
  // The profile's ids: fegPoint1..192 on track 1, fegTrack2.fegPoint1..192 on the rest.
  return (track === 1 ? "" : "fegTrack" + track + ".") + "fegPoint" + index;
}

function pushTrack(trackIndex) {
  var track = trackIndex + 1;
  var shape = get(TRACKS[trackIndex] + ".envelope.points");
  if (!shape || !shape.length) return;

  var next = curveToPoints(shape, POINTS);
  var prev = sent[trackIndex];
  var writes = 0;

  for (var i = 0; i < POINTS; i++) {
    if (prev && prev[i] === next[i]) continue;
    ce.device.write(fegParam(track, i + 1), next[i]);
    writes++;
  }

  sent[trackIndex] = next;
  if (writes) log("free eg: track " + track + " — " + writes + " sample(s) written");
}

function onPanelLoad() {
  // The document path, not the session: an Envelope drag commits on release, so this fires once per
  // gesture. Watching the in-progress session shape would write 192 addresses per pointer move.
  for (var t = 0; t < TRACKS.length; t++) {
    (function (index) {
      watch(TRACKS[index] + ".envelope.points", function () { pushTrack(index); });
    }(t));
  }
}
`;
}
