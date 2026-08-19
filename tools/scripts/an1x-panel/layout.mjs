// layout.mjs — where every control on the AN1x panel goes, and what it looks like.
//
// This is a drawing, written down — the same discipline as the GAIA panel's layout. The shape is
// the AN1x's own block diagram, the one the manual prints inside the front cover:
//
//     CTRL ──────────────────────────────────────────────┐
//     PEG · LFO1 · LFO2                                  ▼
//     VCO1/VCO2 (SYNC, FM) → MIX (RING, NOISE) → HPF/VCF (FEG) → VCA (AEG) → EFFECT (VARI→EQ→DLY→REV)
//
// and the instrument's defining trick sits above it: a voice is TWO SCENES, morphable against each
// other. The hardware has one set of knobs and a SCENE button; a screen does not need that
// compromise, so both scenes are here in full, one strip each, the signal flowing left to right in
// both. Blue is Scene 1, amber is Scene 2 — the same pair of colours the morph runs between.

/** Section colours: the diagram's blue for control, scene tints, neutral silver for the flow. */
export const TINT = {
  ctrl: 'FF3E7FC4',      // the CTRL bar in the block diagram
  scene1: 'FF3E9FD4',
  scene2: 'FFE09A38',
  flow: 'FF8894A0',      // VCO / MIX / VCF / VCA — the diagram draws these plain
  effect: 'FF9A72C8',
  arp: 'FF52B788',
  feg: 'FF3FB0A0',
};

export const SKIN = {
  // The AN1x is a champagne-silver body with a dark control field and that orange wordmark.
  panelBg: 'FFE7E3DA',
  plate: 'FF191F26',
  plateEdge: 'FF3A4148',
  boxFill: 'FF222931',
  label: 'FFAEBAC6',
  labelDim: 'FF7C8894',
  knob: 54,
  knobBig: 62,
  knobSmall: 42,
  faderW: 26,
  faderH: 104,
  ledRow: 15,
};

/**
 * One scene strip. Coordinates are relative to the strip's origin; the same spec is emitted twice —
 * Scene 1 binds `scVcfCutoff`, Scene 2 binds `scene2.scVcfCutoff` — which is exactly the trick the
 * SysEx address map plays with its 00 01 00 stride, one layer up.
 *
 * VCO wave options are the manual's standard set. The AN1x re-labels them when the VCO algorithm
 * changes (sync modes swap in inner waves); the panel notes say so rather than the labels lying.
 */
const VCO1_WAVES = [
  { label: 'SAW', value: 0 }, { label: 'PULSE', value: 1 },
  { label: 'INNER 1', value: 2 }, { label: 'INNER 2', value: 3 }, { label: 'INNER 3', value: 4 },
];
const VCO2_WAVES = [
  { label: 'SAW', value: 0 }, { label: 'PULSE', value: 1 },
  { label: 'TRI', value: 2 }, { label: 'SIN', value: 3 }, { label: 'INNER', value: 4 },
];

export const SCENE_STRIP = {
  height: 368,
  boxes: [
    {
      // The diagram's PEG spout, plus the pitch-adjacent scene settings that live nowhere else.
      title: 'PITCH / PEG', tint: TINT.flow, x: 0, y: 0, w: 252, h: 356,
      controls: [
        { p: 'scPolyMode', kind: 'leds', x: 12, y: 30, w: 104, label: 'KEY MODE' },
        { p: 'scPegSwitch', kind: 'leds', x: 128, y: 30, w: 110, label: 'PEG TO' },
        { p: 'scPegDecay', kind: 'fader', x: 16, y: 120, label: 'PEG\nDECAY' },
        { p: 'scPegDepth', kind: 'fader', x: 62, y: 120, label: 'PEG\nDEPTH' },
        { p: 'scPbUp', kind: 'knobSmall', x: 122, y: 130, label: 'BEND UP' },
        { p: 'scPbDown', kind: 'knobSmall', x: 188, y: 130, label: 'BEND DN' },
        { p: 'scPortamentoMode', kind: 'toggle', x: 122, y: 268, w: 106, label: 'PORTA FINGERED' },
        { p: 'scPortamentoTime', kind: 'knobSmall', x: 188, y: 210, label: 'PORTA TIME' },
      ],
      envelopes: [{ x: 16, y: 82, w: 92, h: 32, stages: 'ad', bind: 'peg' }],
    },
    {
      // LFO1 and LFO2, the two black spouts in the diagram. LFO1's wave list is 21 entries deep,
      // which is a knob, not a column — the display names them one at a time on the hardware too.
      title: 'LFO', tint: TINT.flow, x: 262, y: 0, w: 236, h: 356,
      controls: [
        { p: 'scLfo1Wave', kind: 'knobSmall', x: 14, y: 40, label: 'LFO1 WAVE' },
        { p: 'scLfo1Speed', kind: 'knob', x: 80, y: 34, label: 'LFO1 SPEED' },
        { p: 'scLfo1SpeedSync', kind: 'knobSmall', x: 158, y: 40, label: 'SYNC SPEED' },
        { p: 'scLfoResetMode', kind: 'leds', x: 14, y: 150, w: 88, label: 'RESET' },
        { p: 'scLfo2Speed', kind: 'knob', x: 120, y: 150, label: 'LFO2 SPEED' },
        { p: 'scVcfFilterModDepth', kind: 'knobSmall', x: 40, y: 250, label: 'FILT MOD' },
        { p: 'scVcaAmpModDepth', kind: 'knobSmall', x: 130, y: 250, label: 'AMP MOD' },
      ],
    },
    {
      title: 'VCO 1', tint: TINT.flow, x: 508, y: 0, w: 316, h: 356,
      controls: [
        { p: 'scVco1Wave', kind: 'leds', x: 12, y: 30, w: 104, label: 'WAVE', options: VCO1_WAVES },
        { p: 'scVco1PitchCoarse', kind: 'knobSmall', x: 128, y: 36, label: 'COARSE' },
        { p: 'scVco1PitchFine', kind: 'knobSmall', x: 194, y: 36, label: 'FINE' },
        { p: 'scVco1Edge', kind: 'knobSmall', x: 260, y: 36, label: 'EDGE' },
        { p: 'scVco1PulseWidth', kind: 'knobSmall', x: 128, y: 126, label: 'PW' },
        { p: 'scVco1PwmDepth', kind: 'knobSmall', x: 194, y: 126, label: 'PWM DEPTH' },
        { p: 'scVco1PwmSource', kind: 'knobSmall', x: 260, y: 126, label: 'PWM SRC' },
        { p: 'scVco1PitchModDepth', kind: 'knobSmall', x: 128, y: 216, label: 'PITCH MOD' },
      ],
    },
    {
      // The MASTER→SLAVE sync and FM lines the diagram draws between the two VCOs, as a box
      // between the two VCOs.
      title: 'SYNC / FM', tint: TINT.flow, x: 834, y: 0, w: 252, h: 356,
      controls: [
        { p: 'scVcoAlgorithm', kind: 'leds', x: 12, y: 30, w: 228, label: 'ALGORITHM' },
        { p: 'scSyncPitch', kind: 'knobSmall', x: 12, y: 122, label: 'SYNC PITCH' },
        { p: 'scSyncPitchDepth', kind: 'knobSmall', x: 78, y: 122, label: 'SYNC DEPTH' },
        { p: 'scFmDepth', kind: 'knobSmall', x: 144, y: 122, label: 'FM DEPTH' },
        { p: 'scSyncPitchSource', kind: 'leds', x: 12, y: 208, w: 105, label: 'SYNC SRC' },
        { p: 'scSyncPitchModSwitch', kind: 'leds', x: 128, y: 208, w: 110, label: 'SYNC MOD' },
        { p: 'scFmSource1', kind: 'knobSmall', x: 128, y: 290, label: 'FM SRC 1' },
        { p: 'scFmSource2', kind: 'knobSmall', x: 194, y: 290, label: 'FM SRC 2' },
      ],
    },
    {
      title: 'VCO 2', tint: TINT.flow, x: 1096, y: 0, w: 316, h: 356,
      controls: [
        { p: 'scVco2Wave', kind: 'leds', x: 12, y: 30, w: 104, label: 'WAVE', options: VCO2_WAVES },
        { p: 'scVco2PitchCoarse', kind: 'knobSmall', x: 128, y: 36, label: 'COARSE' },
        { p: 'scVco2PitchFine', kind: 'knobSmall', x: 194, y: 36, label: 'FINE' },
        { p: 'scVco2Edge', kind: 'knobSmall', x: 260, y: 36, label: 'EDGE' },
        { p: 'scVco2PulseWidth', kind: 'knobSmall', x: 128, y: 126, label: 'PW' },
        { p: 'scVco2PwmDepth', kind: 'knobSmall', x: 194, y: 126, label: 'PWM DEPTH' },
        { p: 'scVco2PwmSource', kind: 'knobSmall', x: 260, y: 126, label: 'PWM SRC' },
        { p: 'scVco2PitchModDepth', kind: 'knobSmall', x: 128, y: 216, label: 'PITCH MOD' },
      ],
    },
    {
      // The MIX block, with the RING MOD and NOISE feeds the diagram pours into it.
      title: 'MIX', tint: TINT.flow, x: 1422, y: 0, w: 196, h: 356,
      controls: [
        { p: 'scMixVco1', kind: 'fader', x: 16, y: 46, label: 'VCO 1' },
        { p: 'scMixVco2', kind: 'fader', x: 62, y: 46, label: 'VCO 2' },
        { p: 'scMixRing', kind: 'fader', x: 108, y: 46, label: 'RING' },
        { p: 'scMixNoise', kind: 'fader', x: 154, y: 46, label: 'NOISE' },
      ],
    },
    {
      // HPF and VCF share the box the way the diagram runs them together, FEG beneath as a fader
      // bank with its curve printed over it.
      title: 'HPF / VCF', tint: TINT.flow, x: 1628, y: 0, w: 430, h: 356,
      controls: [
        { p: 'scVcfFilterType', kind: 'leds', x: 12, y: 30, w: 118, label: 'TYPE' },
        { p: 'scVcfCutoff', kind: 'knobBig', x: 146, y: 32, label: 'CUTOFF' },
        { p: 'scVcfResonance', kind: 'knob', x: 220, y: 36, label: 'RESONANCE' },
        { p: 'scVcfHpfCutoff', kind: 'knobSmall', x: 288, y: 40, label: 'HPF' },
        { p: 'scVcfKbdTrack', kind: 'knobSmall', x: 346, y: 40, label: 'KBD TRK' },
        { p: 'scFegAttack', kind: 'fader', x: 16, y: 196, label: 'A' },
        { p: 'scFegDecay', kind: 'fader', x: 62, y: 196, label: 'D' },
        { p: 'scFegSustain', kind: 'fader', x: 108, y: 196, label: 'S' },
        { p: 'scFegRelease', kind: 'fader', x: 154, y: 196, label: 'R' },
        { p: 'scFegDepth', kind: 'fader', x: 216, y: 196, label: 'FEG\nDEPTH' },
        { p: 'scFegVelocity', kind: 'fader', x: 262, y: 196, label: 'VELO\nSENS' },
      ],
      envelopes: [{ x: 12, y: 140, w: 190, h: 40, stages: 'adsr', bind: 'feg' }],
    },
    {
      // VCA with its AEG bank, the FEEDBACK loop the diagram draws back under the mixer, and the
      // variation send — the last thing in the scene before the voice leaves for the effects.
      title: 'VCA', tint: TINT.flow, x: 2068, y: 0, w: 380, h: 356,
      controls: [
        { p: 'scVcaVolume', kind: 'knobBig', x: 12, y: 32, label: 'VOLUME' },
        { p: 'scVcaFeedback', kind: 'knobSmall', x: 88, y: 40, label: 'FEEDBACK' },
        { p: 'scAegVelocity', kind: 'knobSmall', x: 154, y: 40, label: 'VELO SENS' },
        { p: 'scAegAttack', kind: 'fader', x: 16, y: 196, label: 'A' },
        { p: 'scAegDecay', kind: 'fader', x: 62, y: 196, label: 'D' },
        { p: 'scAegSustain', kind: 'fader', x: 108, y: 196, label: 'S' },
        { p: 'scAegRelease', kind: 'fader', x: 154, y: 196, label: 'R' },
        { p: 'scVariDryWet', kind: 'fader', x: 224, y: 196, label: 'VARI\nDRY:WET' },
      ],
      envelopes: [{ x: 12, y: 140, w: 190, h: 40, stages: 'adsr', bind: 'aeg' }],
    },
    {
      // The CTRL bar, poured into the one place it actually lands: the scene's control matrix.
      // Sixteen sets exist; eight are laid out and the notes say where the rest live. SOURCE and
      // PARAM are the manual's numbered lists (115 sources, 37 destinations) — a display picks
      // them by name on the hardware, a knob picks them by number here.
      title: 'CTRL MATRIX', tint: TINT.ctrl, x: 2458, y: 0, w: 312, h: 356,
      matrix: { sets: 8, x: 12, y: 34, colW: 150, rowH: 78 },
    },
  ],
};

/** The header: what belongs to the voice, not to either scene. */
export const COMMON_STRIP = {
  height: 184,
  boxes: [
    {
      title: 'VOICE', tint: TINT.ctrl, x: 0, y: 0, w: 300, h: 172,
      controls: [
        { p: 'vcSceneSelect', kind: 'leds', x: 12, y: 34, w: 120, label: 'SCENE' },
        { p: 'vcCategory', kind: 'knobSmall', x: 150, y: 40, label: 'CATEGORY' },
        { p: 'vcTempo', kind: 'knobSmall', x: 216, y: 40, label: 'TEMPO' },
      ],
    },
    {
      title: 'LAYER', tint: TINT.ctrl, x: 310, y: 0, w: 560, h: 172,
      controls: [
        { p: 'vcLayerMode', kind: 'leds', x: 12, y: 34, w: 150, label: 'MODE' },
        { p: 'vcLayerPan', kind: 'leds', x: 176, y: 34, w: 110, label: 'PAN' },
        { p: 'vcLayerSeparation', kind: 'knobSmall', x: 300, y: 40, label: 'SEPARATION' },
        { p: 'vcUnisonDetune', kind: 'knobSmall', x: 366, y: 40, label: 'DETUNE' },
        { p: 'vcSplitPoint', kind: 'knobSmall', x: 432, y: 40, label: 'SPLIT PT' },
      ],
    },
    {
      title: 'PORTAMENTO', tint: TINT.ctrl, x: 880, y: 0, w: 240, h: 172,
      controls: [
        { p: 'vcPortamentoSwitch', kind: 'leds', x: 12, y: 34, w: 100, label: 'SWITCH' },
        { p: 'cc5-portamento-time', kind: 'knobSmall', x: 130, y: 40, label: 'TIME (CC5)' },
      ],
    },
    {
      // The performance controllers the AN1x transmits as plain CCs — the live half of CTRL.
      title: 'MASTER / PLAY', tint: TINT.ctrl, x: 1130, y: 0, w: 520, h: 172,
      controls: [
        { p: 'cc7-main-volume', kind: 'knob', x: 12, y: 34, label: 'VOLUME' },
        { p: 'cc10-panpot', kind: 'knobSmall', x: 80, y: 40, label: 'PAN' },
        { p: 'cc11-expression', kind: 'knobSmall', x: 146, y: 40, label: 'EXPRESSION' },
        { p: 'cc1-modulation', kind: 'knobSmall', x: 212, y: 40, label: 'MOD WHEEL' },
        { p: 'cc55-sustain-switch', kind: 'toggle', x: 278, y: 48, w: 84, label: 'SUSTAIN' },
        { p: 'cc3-scene-select', kind: 'knobSmall', x: 376, y: 40, label: 'SCENE (CC3)' },
      ],
    },
  ],
};

/** The EFFECT block, in the diagram's own order: VARI → EQ → DLY → REV. */
export const EFFECT_STRIP = {
  height: 128,
  boxes: [
    {
      title: 'VARIATION', tint: TINT.effect, x: 0, y: 0, w: 560, h: 116,
      controls: [
        { p: 'vcVariType', kind: 'knobSmall', x: 12, y: 36, label: 'TYPE' },
        { p: 'cc82-chorus-variation-depth', kind: 'knobSmall', x: 78, y: 36, label: 'DEPTH' },
        ...[1, 2, 3, 4, 5, 6].map((n) => (
          { p: `vcVariParam${n}`, kind: 'knobSmall', x: 144 + (n - 1) * 66, y: 36, label: `PARAM ${n}` }
        )),
      ],
    },
    {
      title: 'EQ', tint: TINT.effect, x: 570, y: 0, w: 560, h: 116,
      controls: [
        { p: 'eqLowFreq', kind: 'knobSmall', x: 12, y: 36, label: 'LO FREQ' },
        { p: 'eqLowGain', kind: 'knobSmall', x: 78, y: 36, label: 'LO GAIN' },
        { p: 'eqMidFreq', kind: 'knobSmall', x: 144, y: 36, label: 'MID FREQ' },
        { p: 'eqMidGain', kind: 'knobSmall', x: 210, y: 36, label: 'MID GAIN' },
        { p: 'eqMidQ', kind: 'knobSmall', x: 276, y: 36, label: 'MID Q' },
        { p: 'eqHighFreq', kind: 'knobSmall', x: 342, y: 36, label: 'HI FREQ' },
        { p: 'eqHighGain', kind: 'knobSmall', x: 408, y: 36, label: 'HI GAIN' },
      ],
    },
    {
      title: 'DELAY', tint: TINT.effect, x: 1140, y: 0, w: 810, h: 116,
      controls: [
        { p: 'vcDlyType', kind: 'knobSmall', x: 12, y: 36, label: 'TYPE' },
        { p: 'vcDlyReturn', kind: 'knobSmall', x: 78, y: 36, label: 'RETURN' },
        { p: 'cc83-delay-depth', kind: 'knobSmall', x: 144, y: 36, label: 'DEPTH' },
        { p: 'vcDlyRevConnection', kind: 'leds', x: 210, y: 32, w: 96, label: 'DLY→REV' },
        ...[1, 2, 3, 4, 5, 6].map((n) => (
          { p: `vcDlyParam${n}`, kind: 'knobSmall', x: 330 + (n - 1) * 66, y: 36, label: `PARAM ${n}` }
        )),
      ],
    },
    {
      title: 'REVERB', tint: TINT.effect, x: 1960, y: 0, w: 810, h: 116,
      controls: [
        { p: 'vcRevType', kind: 'knobSmall', x: 12, y: 36, label: 'TYPE' },
        { p: 'vcRevReturn', kind: 'knobSmall', x: 78, y: 36, label: 'RETURN' },
        { p: 'cc80-reverb-depth', kind: 'knobSmall', x: 144, y: 36, label: 'DEPTH' },
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => (
          { p: `vcRevParam${n}`, kind: 'knobSmall', x: 210 + (n - 1) * 66, y: 36, label: `PARAM ${n}` }
        )),
      ],
    },
  ],
};

/**
 * Something to play, because the synth is not always within reach.
 *
 * The GAIA panel's notes say "No keyboard: this edits a patch, and the synth has its own keys",
 * and that reasoning holds right up until the instrument is across the room — which is where it
 * usually is, and which is the whole reason for editing it on a screen. Worse for this instrument
 * than for most: an AN1x's arpeggiator and step sequencer do nothing at all until a key is held, so
 * a panel with no keys cannot demonstrate half of what it edits.
 *
 * These are the app's own note-playing controls, which send through the same funnel a recorder taps.
 * The transport is here for the arpeggiator and the step sequencer: both follow MIDI clock, so
 * starting it from the panel is what makes them run in time with anything else.
 */
export const PLAY_STRIP = {
  height: 190,
  boxes: [
    {
      title: 'PLAY', tint: TINT.arp, x: 0, y: 0, w: 1180, h: 178,
      controls: [],
      // Three octaves from C2, wide enough to hold a chord with one hand and reach the bass the
      // arpeggiator patterns are written around.
      ribbon: { x: 12, y: 34, w: 1156, h: 118, baseNote: 36, octaves: 3 },
    },
    {
      // Chords, because holding three notes with a mouse is not possible and an arpeggiator needs
      // held notes to arpeggiate.
      title: 'CHORDS', tint: TINT.arp, x: 1190, y: 0, w: 300, h: 178,
      controls: [],
      chords: { x: 12, y: 30, w: 276, h: 132 },
    },
    {
      title: 'TRANSPORT', tint: TINT.arp, x: 1500, y: 0, w: 300, h: 178,
      controls: [],
      transport: { x: 12, y: 40, w: 276, h: 70 },
    },
  ],
};

/** Arpeggiator, Free EG and the step sequencer — the bottom third of the diagram. */
export const PATTERN_STRIP = {
  height: 260,
  boxes: [
    {
      title: 'ARPEGGIO / STEP SEQ', tint: TINT.arp, x: 0, y: 0, w: 880, h: 130,
      controls: [
        { p: 'arpOnOff', kind: 'leds', x: 12, y: 34, w: 86, label: 'ON' },
        { p: 'arpSelect', kind: 'leds', x: 110, y: 34, w: 110, label: 'MODE' },
        { p: 'arpType', kind: 'knobSmall', x: 240, y: 40, label: 'ARP TYPE' },
        { p: 'arpStepPtnNo', kind: 'knobSmall', x: 306, y: 40, label: 'PATTERN' },
        { p: 'arpHold', kind: 'knobSmall', x: 372, y: 40, label: 'HOLD' },
        { p: 'arpSceneSwitch', kind: 'knobSmall', x: 438, y: 40, label: 'SCENE' },
        { p: 'arpSubdivide', kind: 'knobSmall', x: 504, y: 40, label: 'SUBDIV' },
        { p: 'arpSwing', kind: 'knobSmall', x: 570, y: 40, label: 'SWING' },
        { p: 'arpVelocity', kind: 'knobSmall', x: 636, y: 40, label: 'VELOCITY' },
        { p: 'arpGateTime', kind: 'knobSmall', x: 702, y: 40, label: 'GATE' },
      ],
    },
    {
      // The Free EG: four hand-drawn control tracks. The four track curves themselves are bulk
      // data (the userPattern dump, no byte layout yet) — what is editable by address is here.
      title: 'FREE EG', tint: TINT.feg, x: 0, y: 142, w: 880, h: 106,
      controls: [
        { p: 'fegTrigger', kind: 'leds', x: 12, y: 30, w: 110, label: 'TRIGGER' },
        { p: 'fegLoopType', kind: 'knobSmall', x: 134, y: 34, label: 'LOOP' },
        { p: 'fegLength', kind: 'knobSmall', x: 200, y: 34, label: 'LENGTH' },
        { p: 'fegKbdTrack', kind: 'knobSmall', x: 266, y: 34, label: 'KBD TRK' },
        ...[1, 2, 3, 4].flatMap((n) => ([
          { p: `fegTrkParam${n}`, kind: 'knobSmall', x: 340 + (n - 1) * 136, y: 34, label: `TRK ${n} PARAM` },
          { p: `fegTrkSceneSw${n}`, kind: 'knobSmall', x: 406 + (n - 1) * 136, y: 34, label: `TRK ${n} SW` },
        ])),
      ],
    },
    {
      title: 'STEP SEQUENCER', tint: TINT.arp, x: 890, y: 0, w: 1880, h: 248,
      controls: [],
      grid: { x: 12, y: 26, w: 1856, h: 196, steps: 16 },
    },
  ],
};

export const PANEL_WIDTH = 2802;
