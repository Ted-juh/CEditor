// effect-parameters.mjs — what the GAIA's effect knobs are actually called.
//
// THE GAP, stated plainly. The hardware's EFFECTS section is SELECT CONTROL, CONTROL 1/2/3 and
// LEVEL: five knobs whose meaning changes with the selected effect type. The MIDI implementation
// names the addresses "Distortion Parameter 1..32" and never says which of those CONTROL 1 turns
// for DIST as opposed to for BIT CRASH. That mapping is in the owner's manual, which this repo does
// not have — so the panel has been showing PARAM 1..4, which is nobody's name for anything.
//
// WHY THE TABLE SHIPS EMPTY. Guessing would produce labels that look right and are wrong, and a
// wrong label on a synth editor is worse than a generic one: PARAM 3 makes you check the manual,
// "DEPTH" makes you not check it. The type lists below are NOT guesses — they are the labels the
// MIDI implementation prints for each Type parameter, transcribed in address-map.mjs — so the shape
// of the answer is complete and only the leaves are missing.
//
// TO FILL IT IN. Put the manual's own name for each of MFX Parameter 1..4 into the array beside the
// type, in order, and regenerate the panel. Nothing else changes: `effectLabelScript` starts
// emitting a panel script that renames the captions when the type selector moves, and a type with
// no name for a given knob keeps PARAM n. Partial is fine — name the two you are sure of.
//
//   distortion: { DIST: ['DRIVE', '', '', 'LEVEL'] }
//
// OFF is deliberately absent from every list: when an effect is off there is nothing for its knobs
// to be named, and inventing labels for a block that is not running is the same defect one level
// down.

/**
 * effect -> type label -> the manual's names for MFX Parameter 1..4.
 *
 * The keys are exhaustive and real; the values are the part that needs the manual.
 */
export const EFFECT_PARAMETER_NAMES = {
  distortion: {
    DIST: ['', '', '', ''],
    FUZZ: ['', '', '', ''],
    'BIT CRASH': ['', '', '', ''],
  },
  flanger: {
    FLANGER: ['', '', '', ''],
    PHASER: ['', '', '', ''],
    'PITCH SHIFTER': ['', '', '', ''],
  },
  delay: {
    DELAY: ['', '', '', ''],
    'PANNING DELAY': ['', '', '', ''],
  },
  reverb: {
    REVERB: ['', '', '', ''],
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
