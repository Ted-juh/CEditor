// effect-parameters.mjs — what the GAIA's effect knobs are actually called.
//
// THE GAP THIS CLOSES. The MIDI implementation names every effect address "MFX Parameter 1..32",
// all 92 of them with the same container range, and never says which one CONTROL 1 turns for DIST
// as opposed to for BIT CRASH. It documents a box, not a set of controls. The panel therefore
// showed PARAM 1..4, which is nobody's name for anything.
//
// The names below are transcribed from the SH-01 OWNER'S MANUAL, "Effect Parameters" — a different
// document from the MIDI implementation, and the only one that carries them.
//
// WHY THE ORDER IS THE SLOT ORDER. The owner's manual gives no addresses. It gives a PANEL
// OPERATION per parameter, and the instrument's own silkscreen names those knobs:
//
//     MFX Parameter 1   CONTROL 1     turn the CONTROL 1 knob
//     MFX Parameter 2   CONTROL 2     SHIFT (cancel) + turn the CONTROL 1 knob
//     MFX Parameter 3   CONTROL 3     SHIFT (cancel) + turn the EFFECTS LEVEL knob
//     MFX Parameter 4   LEVEL         turn the EFFECTS LEVEL knob
//
// The CONTROL 1 knob is engraved "(CONTROL 2)" underneath and the LEVEL knob "(CONTROL 3)", and the
// owner's manual lists every effect's four rows in exactly that order with Level last. So the
// manual's row order IS the CONTROL 1/2/3 + LEVEL order.
//
// THE ONE STEP THAT IS STILL AN INFERENCE, and it is worth saying out loud: nothing printed
// anywhere says CONTROL 1 writes MFX Parameter 1. Two documents agree on an ordering and the
// addresses are consecutive, which is strong — but it is not the instrument saying so.
// effect-probe.mjs answers it directly by dumping a block, moving one knob and dumping again;
// running it once would turn this from a well-founded reading into a fact.
//
// OFF is deliberately absent from every list: when an effect is off there is nothing for its knobs
// to be named, and inventing labels for a block that is not running is the same defect one level
// down.

/**
 * effect -> type label -> the owner's manual's names for MFX Parameter 1..4.
 *
 * Verbatim from the manual's Parameter column, upper-cased for the panel's caption style. The two
 * PITCH SHIFTER entries are the manual's only collision: it prints "Pitch" twice, once as the
 * CONTROL 1 knob over -12..+12 semitones ("adjusts the amount of pitch shift in semitone steps")
 * and once as a CONTROL 3 selector over a fixed list ("selects the amount of pitch shift"). Two
 * knobs both captioned PITCH would be unreadable, so the selector is PITCH SEL — the only label
 * here that is not the manual's own word, and it is a disambiguation rather than a guess.
 */
export const EFFECT_PARAMETER_NAMES = {
  distortion: {
    DIST: ['DRIVE', 'TYPE', 'PRESENCE', 'LEVEL'],
    FUZZ: ['DRIVE', 'TYPE', 'PRESENCE', 'LEVEL'],
    'BIT CRASH': ['SAMPLE RATE', 'BIT DOWN', 'FILTER', 'LEVEL'],
  },
  flanger: {
    FLANGER: ['FEEDBACK', 'DEPTH', 'RATE', 'LEVEL'],
    PHASER: ['RESONANCE', 'DEPTH', 'RATE', 'LEVEL'],
    'PITCH SHIFTER': ['PITCH', 'DETUNE', 'PITCH SEL', 'LEVEL'],
  },
  delay: {
    DELAY: ['TIME', 'FEEDBACK', 'HIGH DAMP', 'LEVEL'],
    'PANNING DELAY': ['TIME', 'FEEDBACK', 'HIGH DAMP', 'LEVEL'],
  },
  reverb: {
    REVERB: ['TIME', 'TYPE', 'HIGH DAMP', 'LEVEL'],
  },
};

/**
 * The manual's RANGE for each of those parameters — recorded, and deliberately NOT yet applied to
 * the profile.
 *
 * Why it matters: the profile declares every MFX slot over the container's full extent, wire
 * 12768..52768 shown as -20000..+20000, because that is all the MIDI implementation gives. A knob
 * bound to DIST Drive therefore sweeps forty thousand steps for a parameter with a hundred and
 * twenty-eight, and the useful part of its travel is a third of one percent. That is the difference
 * between a panel you can play and a panel you can only look at.
 *
 * Why it is not applied: the container's centre is certainly 32768 — the MIDI implementation's own
 * 12768/52768 is exactly 32768 ± 20000 — but that does not settle where the manual's "0-127" sits
 * inside it. Drive 0 could be stored 32768 (the parameter is signed-offset like the container) or
 * stored 0 (the container's range is only a maximum extent and the parameter uses raw values).
 * Both are real Roland conventions, no document distinguishes them, and picking wrong sends the
 * synth a number from the other end of its range.
 *
 * ONE READING SETTLES IT, and the machinery now exists: select DIST, set Drive to a known position,
 * request the distortion block, and look at what MFX Parameter 1 came back as. 32768 means offset,
 * 0 means raw. Then these ranges can be wired in and the knobs become usable.
 */
export const EFFECT_PARAMETER_RANGES = {
  distortion: {
    DIST: [{ min: 0, max: 127 }, { min: 1, max: 6 }, { min: 0, max: 127 }, { min: 0, max: 127 }],
    FUZZ: [{ min: 0, max: 127 }, { min: 1, max: 6 }, { min: 0, max: 127 }, { min: 0, max: 127 }],
    'BIT CRASH': [{ min: 0, max: 127 }, { min: 0, max: 127 }, { min: 0, max: 127 }, { min: 0, max: 127 }],
  },
  flanger: {
    FLANGER: [{ min: 0, max: 127 }, { min: 0, max: 127 }, { min: 0, max: 127 }, { min: 0, max: 127 }],
    PHASER: [{ min: 0, max: 127 }, { min: 0, max: 127 }, { min: 0, max: 127 }, { min: 0, max: 127 }],
    // Detune is in cents; the third is a SELECTOR over a fixed list, not a continuous range, which
    // is why its values are spelled out rather than given as min/max.
    'PITCH SHIFTER': [
      { min: -12, max: 12, unit: 'semitones' },
      { min: 0, max: 50, unit: 'cent' },
      { values: [-12, -7, -5, -2, -1, 0, 1, 2, 5, 7, 12] },
      { min: 0, max: 127 },
    ],
  },
  delay: {
    DELAY: [{ min: 0, max: 127 }, { min: 0, max: 127 }, { min: -36, max: 0, unit: 'dB' }, { min: 0, max: 127 }],
    'PANNING DELAY': [{ min: 0, max: 127 }, { min: 0, max: 127 }, { min: -36, max: 0, unit: 'dB' }, { min: 0, max: 127 }],
  },
  reverb: {
    REVERB: [
      { min: 0, max: 127 },
      { values: ['ROOM', 'PLATE', 'HALL'] },
      { min: 1, max: 100, unit: '%' },
      { min: 0, max: 127 },
    ],
  },
};

/** The number of parameters per effect the panel puts on screen. */
export const EFFECT_PARAMETER_COUNT = 4;

/** The fallback, and what every knob reads until the table above is filled in. */
export const genericParameterLabel = (index) => `PARAM ${index + 1}`;

/** Has anyone named anything for this effect yet? */
export function effectHasNames(effect, table = EFFECT_PARAMETER_NAMES) {
  return Object.values(table[effect] ?? {}).some((names) => names.some((name) => String(name ?? '').trim()));
}

/** True when the whole table is still empty — the panel then prints its caveat. */
export const anyEffectHasNames = (table = EFFECT_PARAMETER_NAMES) =>
  Object.keys(table).some((effect) => effectHasNames(effect, table));

/**
 * The label for one knob, given a type label.
 *
 * Falls back per PARAMETER, not per type: a manual entry that names CONTROL 1 and CONTROL 2 and
 * says nothing about 3 and 4 should give two real names and two honest generic ones, rather than
 * being refused wholesale for being incomplete.
 */
export function effectParameterLabel(effect, typeLabel, index, table = EFFECT_PARAMETER_NAMES) {
  const named = table[effect]?.[String(typeLabel ?? '').trim().toUpperCase()];
  return String(named?.[index] ?? '').trim() || genericParameterLabel(index);
}

/**
 * The panel script that renames the four captions when an effect's TYPE selector moves.
 *
 * A script rather than four static labels because the names depend on a value the user changes at
 * runtime — the same reason the arpeggio bridge is a script. When the table is empty this returns
 * null and no script is emitted, so the panel carries no dead code while it waits for the manual.
 *
 * ADDRESSED BY CONTROL ID, not by name. Every bound control on this panel is named after its
 * parameter — `distortion.type` — and the script path syntax splits on dots, so the first segment
 * of `get("distortion.type")` is the control name "distortion" and it resolves to nothing.
 * findControlByName matches ids too, and the ids are dot-free, so the generator bakes those in.
 *
 * KEYED BY THE TYPE'S WIRE VALUE rather than its label, because that is what the control holds.
 * Matching label text at runtime would mean the script carrying its own copy of the choice list and
 * agreeing with the profile about capitalisation forever.
 *
 * @param blocks  effect -> { captionIds: string[4], typeControlId, labelByValue: { [wire]: label } }
 */
export function effectLabelScript(blocks, table = EFFECT_PARAMETER_NAMES) {
  const named = Object.keys(blocks ?? {}).filter((effect) => effectHasNames(effect, table));
  if (named.length === 0) return null;

  // Resolved to wire values HERE, where the profile's choice list is in hand, so the script does no
  // matching of its own.
  const byValue = {};
  for (const effect of named) {
    const block = blocks[effect];
    byValue[effect] = { captions: block.captionIds, type: block.typeControlId, names: {} };
    for (const [wire, label] of Object.entries(block.labelByValue ?? {})) {
      const names = Array.from({ length: EFFECT_PARAMETER_COUNT }, (unused, i) =>
        effectParameterLabel(effect, label, i, table));
      if (names.some((name, i) => name !== genericParameterLabel(i))) byValue[effect].names[wire] = names;
    }
  }

  return `// Effect parameter captions -> the manual's names for the selected type.
//
// Generated by tools/scripts/gaia-panel/effect-parameters.mjs from its own table. A type with no
// name for a given knob keeps the generic PARAM n, so a half-filled table is useful. Controls are
// addressed by ID: every bound control here is named after its parameter ("distortion.type") and
// the script path syntax splits on dots, so a name would resolve to nothing.

var BLOCKS = ${JSON.stringify(byValue, null, 2)};

function relabel(effect) {
  var block = BLOCKS[effect];
  var selected = get(block.type);
  var names = block.names[String(selected)];
  for (var i = 0; i < block.captions.length; i++) {
    set(block.captions[i] + ".text.content", names ? names[i] : "PARAM " + (i + 1));
  }
}

function onPanelLoad() {
  var effects = Object.keys(BLOCKS);
  for (var i = 0; i < effects.length; i++) {
    (function (effect) {
      relabel(effect);
      watch(BLOCKS[effect].type + ".value", function () { relabel(effect); });
    }(effects[i]));
  }
}
`;
}
