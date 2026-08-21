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

/** One colour per Free EG track, so four curves over one time axis stay tellable apart. */
export const TRACK_TINT = ['FF4FC3B0', 'FFE0A94A', 'FF7FA7E8', 'FFD98AA8'];

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
  knobTiny: 36,
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
      title: 'LFO', tint: TINT.flow, x: 262, y: 0, w: 212, h: 356,
      controls: [
        { p: 'scLfo1Wave', kind: 'knobSmall', x: 14, y: 40, label: 'LFO1 WAVE' },
        { p: 'scLfo1Speed', kind: 'knob', x: 80, y: 34, label: 'LFO1 SPEED' },
        { p: 'scLfo1Delay', kind: 'knobSmall', x: 152, y: 40, label: 'LFO1 DELAY' },
        { p: 'scLfoResetMode', kind: 'leds', x: 14, y: 150, w: 88, label: 'RESET' },
        { p: 'scLfo2Speed', kind: 'knob', x: 120, y: 150, label: 'LFO2 SPEED' },
        { p: 'scVcfFilterModDepth', kind: 'knobSmall', x: 40, y: 250, label: 'FILT MOD' },
        { p: 'scVcaAmpModDepth', kind: 'knobSmall', x: 124, y: 250, label: 'AMP MOD' },
      ],
    },
    {
      title: 'VCO 1', tint: TINT.flow, x: 484, y: 0, w: 316, h: 356,
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
      title: 'SYNC / FM', tint: TINT.flow, x: 810, y: 0, w: 252, h: 356,
      controls: [
        { p: 'scVcoAlgorithm', kind: 'leds', x: 12, y: 30, w: 228, label: 'ALGORITHM' },
        { p: 'scSyncPitch', kind: 'knobSmall', x: 16, y: 122, label: 'SYNC PITCH' },
        { p: 'scSyncPitchDepth', kind: 'knobSmall', x: 78, y: 122, label: 'SYNC DEPTH' },
        { p: 'scFmDepth', kind: 'knobSmall', x: 144, y: 122, label: 'FM DEPTH' },
        { p: 'scSyncPitchSource', kind: 'leds', x: 12, y: 208, w: 105, label: 'SYNC SRC' },
        { p: 'scSyncPitchModSwitch', kind: 'leds', x: 128, y: 208, w: 110, label: 'SYNC MOD' },
        { p: 'scFmSource1', kind: 'knobSmall', x: 128, y: 276, label: 'FM SRC 1' },
        { p: 'scFmSource2', kind: 'knobSmall', x: 194, y: 276, label: 'FM SRC 2' },
      ],
    },
    {
      title: 'VCO 2', tint: TINT.flow, x: 1072, y: 0, w: 316, h: 356,
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
      title: 'MIX', tint: TINT.flow, x: 1398, y: 0, w: 196, h: 356,
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
      title: 'HPF / VCF', tint: TINT.flow, x: 1604, y: 0, w: 400, h: 356,
      controls: [
        { p: 'scVcfFilterType', kind: 'leds', x: 12, y: 30, w: 118, label: 'TYPE' },
        { p: 'scVcfCutoff', kind: 'knobBig', x: 146, y: 32, label: 'CUTOFF' },
        { p: 'scVcfResonance', kind: 'knob', x: 220, y: 36, label: 'RESONANCE' },
        { p: 'scVcfHpfCutoff', kind: 'knobSmall', x: 288, y: 40, label: 'HPF' },
        { p: 'scVcfKbdTrack', kind: 'knobSmall', x: 340, y: 40, label: 'KBD TRK' },
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
      title: 'VCA', tint: TINT.flow, x: 2014, y: 0, w: 292, h: 356,
      controls: [
        { p: 'scVcaVolume', kind: 'knobBig', x: 16, y: 32, label: 'VOLUME' },
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
      // All sixteen sets, two columns of eight: source knob, destination by name, depth knob. The
      // destination list is the manual's own 46 entries, so it reads as words; the source list (115
      // entries) is still a number, because this Data List does not enumerate it. Sets 9-16 used to
      // be reachable only from the parameter browser — half of the instrument's headline feature.
      title: 'CTRL MATRIX', tint: TINT.ctrl, x: 2316, y: 0, w: 454, h: 356,
      matrix: { sets: 16, perColumn: 8, x: 24, y: 26, rowH: 38, colW: 214, comboW: 106 },
    },
  ],
};

/** The header: what belongs to the voice, not to either scene. */
export const COMMON_STRIP = {
  height: 316,
  boxes: [
    {
      title: 'VOICE', tint: TINT.ctrl, x: 0, y: 0, w: 300, h: 172,
      controls: [
        // The name, as a name. It is ten ASCII bytes at 10 00 00 and the profile carries it as one
        // text parameter, so it is one field — ten knobs was never a name.
        { p: 'vcName', kind: 'text', x: 12, y: 30, w: 276, label: 'VOICE NAME' },
        { p: 'vcSceneSelect', kind: 'leds', x: 12, y: 76, w: 120, label: 'SCENE' },
        { p: 'vcCategory', kind: 'knobSmall', x: 150, y: 82, label: 'CATEGORY' },
        { p: 'vcTempo', kind: 'knobSmall', x: 216, y: 82, label: 'TEMPO' },
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
      /**
       * The Common Control Matrix: two sets, the voice-wide counterpart of the scene matrix.
       *
       * It reaches six destinations rather than forty-six — Common Volume, Common Pan, Variation
       * Param, Delay Return, Reverb Return — and it was not on the panel at all.
       */
      title: 'COMMON CTRL', tint: TINT.ctrl, x: 1660, y: 0, w: 620, h: 172,
      controls: [
        ...[1, 2].flatMap((n) => {
          const x = 16 + (n - 1) * 300;
          return [
            { p: `vcCmSource${n}`, kind: 'knobSmall', x, y: 40, label: `SRC ${n}` },
            { p: `vcCmParam${n}`, kind: 'combo', x: x + 66, y: 50, w: 140, label: 'DESTINATION' },
            { p: `vcCmDepth${n}`, kind: 'knobSmall', x: x + 216, y: 40, label: 'DEPTH' },
          ];
        }),
      ],
    },
    {
      /**
       * SYSTEM: the settings that belong to the instrument rather than to a voice.
       *
       * Every one of these — all twenty-seven — was missing from the panel. Master tune, transpose,
       * the velocity curve, both receive channels, local on/off, the device number, and the fifteen
       * assignments that decide which CC each physical controller sends. An editor that cannot
       * reach them is an editor you have to put down and walk to the instrument to finish using.
       */
      title: 'SYSTEM', tint: TINT.ctrl, x: 0, y: 182, w: 2280, h: 126,
      controls: [
        { p: 'sysMasterTune', kind: 'knobSmall', x: 16, y: 28, label: 'TUNE' },
        { p: 'sysKbdTranspose', kind: 'knobSmall', x: 82, y: 28, label: 'TRANSPOSE' },
        { p: 'sysKbdFixedVelocity', kind: 'knobSmall', x: 148, y: 28, label: 'FIXED VELO' },
        { p: 'sysKbdVelocityCurve', kind: 'combo', x: 214, y: 38, w: 118, label: 'VELO CURVE' },
        { p: 'sysEffectBypass', kind: 'combo', x: 342, y: 38, w: 118, label: 'FX BYPASS' },
        { p: 'sysMidiLocal', kind: 'combo', x: 470, y: 38, w: 80, label: 'LOCAL' },
        { p: 'sysKbdTxChannel', kind: 'combo', x: 560, y: 38, w: 92, label: 'KBD TX CH' },
        { p: 'sysArpTxChannel', kind: 'combo', x: 662, y: 38, w: 92, label: 'ARP TX CH' },
        { p: 'sysRxChannel1', kind: 'combo', x: 764, y: 38, w: 92, label: 'RX CH 1' },
        { p: 'sysRxChannel2', kind: 'combo', x: 866, y: 38, w: 92, label: 'RX CH 2' },
        { p: 'sysDeviceNumber', kind: 'knobSmall', x: 972, y: 28, label: 'DEVICE No' },
        // Which CC each physical controller sends. The AN1x lets you move all fifteen.
        ...[
          ['sysSceneCtrlNum', 'SCENE'], ['sysMwCtrlNum', 'MOD WHL'], ['sysFvCtrlNum', 'FOOT VOL'],
          ['sysFcCtrlNum', 'FOOT CTL'], ['sysFsCtrlNum', 'FOOT SW'],
          ['sysRibbonXCtrlNum', 'RIBBON X'], ['sysRibbonZCtrlNum', 'RIBBON Z'],
        ].map(([p, label], i) => ({ p, kind: 'knobSmall', x: 1044 + i * 64, y: 28, label })),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          { p: `sysKnob${n}CtrlNum`, kind: 'knobSmall', x: 1508 + (n - 1) * 64, y: 28, label: `KNOB ${n}` }
        )),
      ],
    },
    {
      // The performance controllers the AN1x transmits as plain CCs — the live half of CTRL.
      title: 'MASTER / PLAY', tint: TINT.ctrl, x: 1130, y: 0, w: 520, h: 172,
      controls: [
        { p: 'cc7-main-volume', kind: 'knob', x: 16, y: 34, label: 'VOLUME' },
        { p: 'cc10-panpot', kind: 'knobSmall', x: 80, y: 40, label: 'PAN' },
        { p: 'cc11-expression', kind: 'knobSmall', x: 146, y: 40, label: 'EXPRESSION' },
        { p: 'cc1-modulation', kind: 'knobSmall', x: 212, y: 40, label: 'MOD WHEEL' },
        { p: 'cc64-sustain-switch', kind: 'toggle', x: 278, y: 48, w: 84, label: 'SUSTAIN' },
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
        { p: 'vcVariType', kind: 'knobSmall', x: 16, y: 36, label: 'TYPE' },
        { p: 'cc93-chorus-variation-depth', kind: 'knobSmall', x: 78, y: 36, label: 'DEPTH' },
        ...[1, 2, 3, 4, 5, 6].map((n) => (
          { p: `vcVariParam${n}`, kind: 'knobSmall', x: 144 + (n - 1) * 66, y: 36, label: `PARAM ${n}` }
        )),
      ],
    },
    {
      title: 'EQ', tint: TINT.effect, x: 570, y: 0, w: 560, h: 116,
      controls: [
        { p: 'eqLowFreq', kind: 'knobSmall', x: 16, y: 36, label: 'LO FREQ' },
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
        { p: 'vcDlyType', kind: 'knobSmall', x: 16, y: 36, label: 'TYPE' },
        { p: 'vcDlyReturn', kind: 'knobSmall', x: 78, y: 36, label: 'RETURN' },
        { p: 'cc94-delay-depth', kind: 'knobSmall', x: 144, y: 36, label: 'DEPTH' },
        { p: 'vcDlyRevConnection', kind: 'leds', x: 210, y: 32, w: 96, label: 'DLY→REV' },
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => (
          { p: `vcDlyParam${n}`, kind: 'knobSmall', x: 330 + (n - 1) * 66, y: 36, label: `PARAM ${n}` }
        )),
      ],
    },
    {
      title: 'REVERB', tint: TINT.effect, x: 1960, y: 0, w: 810, h: 116,
      controls: [
        { p: 'vcRevType', kind: 'knobSmall', x: 16, y: 36, label: 'TYPE' },
        { p: 'vcRevReturn', kind: 'knobSmall', x: 78, y: 36, label: 'RETURN' },
        { p: 'cc91-reverb-depth', kind: 'knobSmall', x: 144, y: 36, label: 'DEPTH' },
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
    {
      /**
       * Selecting a sound, which no profile in this app could express.
       *
       * The engine compiles cc, nrpn and sysex and nothing else, so "select this voice" is not a
       * thing a device profile can say. These are RAW bindings — sent as bytes rather than
       * compiled — so they reach the instrument without the engine having to learn a message kind.
       *
       * Bank Select is CC 0 and CC 32 and Program Change is its own message, deliberately three
       * separate controls rather than one clever one: what a bank number MEANS is per-instrument,
       * and this panel would rather send exactly what you dial than guess a mapping.
       */
      title: 'VOICE', tint: TINT.ctrl, x: 1810, y: 0, w: 300, h: 178,
      controls: [],
      raw: [
        { kind: 'knob', x: 16, y: 34, label: 'BANK MSB', message: 'cc', controller: 0, max: 127 },
        { kind: 'knob', x: 104, y: 34, label: 'BANK LSB', message: 'cc', controller: 32, max: 127 },
        { kind: 'knob', x: 200, y: 34, label: 'PROGRAM', message: 'programChange', max: 127 },
      ],
    },
  ],
};

/** Arpeggiator, Free EG and the step sequencer — the bottom third of the diagram. */
export const PATTERN_STRIP = {
  height: 676,
  boxes: [
    {
      // One box, because the instrument treats them as one setting: ARPEGGIO or STEP SEQ, and the
      // row beneath is whichever of the two you picked.
      title: 'ARPEGGIO / STEP SEQ', tint: TINT.arp, x: 0, y: 0, w: 1000, h: 250,
      controls: [
        { p: 'arpOnOff', kind: 'leds', x: 12, y: 34, w: 86, label: 'ON' },
        { p: 'arpSelect', kind: 'leds', x: 110, y: 34, w: 110, label: 'MODE' },
        { p: 'arpType', kind: 'combo', x: 232, y: 44, w: 150, label: 'ARP TYPE' },
        { p: 'arpKbdMode', kind: 'combo', x: 392, y: 44, w: 128, label: 'KBD MODE' },
        { p: 'arpHold', kind: 'toggle', x: 530, y: 46, w: 74, label: 'HOLD' },
        { p: 'arpSceneSwitch', kind: 'combo', x: 614, y: 44, w: 108, label: 'SCENE' },
        { p: 'arpSubdivide', kind: 'knobSmall', x: 738, y: 40, label: 'SUBDIV' },
        { p: 'arpSwing', kind: 'knobSmall', x: 804, y: 40, label: 'SWING' },
        { p: 'arpVelocity', kind: 'knobSmall', x: 870, y: 40, label: 'VELOCITY' },
        { p: 'arpGateTime', kind: 'knobSmall', x: 936, y: 40, label: 'GATE' },
        // The step sequencer's own settings, which had no place on the panel at all until the
        // Current Pattern buffer (10 0E 00) was modelled.
        { p: 'ssBaseUnit', kind: 'knobSmall', x: 14, y: 156, label: 'BASE UNIT' },
        { p: 'ssLength', kind: 'knobSmall', x: 96, y: 156, label: 'STEPS' },
        { p: 'ssLoopType', kind: 'combo', x: 172, y: 166, w: 140, label: 'LOOP' },
        { p: 'ssCtrlChangeNo', kind: 'knobSmall', x: 336, y: 156, label: 'CC NUMBER' },
      ],
    },
    {
      /**
       * The step sequencer, sixteen steps deep and four values wide.
       *
       * It was a drawing. The GAIA's arpeggio grid was borrowed to stand in for it, publishing
       * blocks through a pattern channel that reaches nothing, because at the time the AN1x's step
       * data was not modelled at all. It is now — 70 parameters at 10 0E 00 — so every one of these
       * 64 faders writes a real address, and the drawing is gone.
       *
       * Four lanes rather than a piano roll, because a step here is four independent values and a
       * roll can only show one of them. Velocity 0 is the instrument's REST, which is why the
       * velocity lane is the one to read first.
       */
      title: 'STEP SEQUENCER', tint: TINT.arp, x: 1010, y: 0, w: 1760, h: 250,
      controls: [],
      steps: {
        // A grid, not sixteen scattered faders: each cell is a bar in a well, 92 wide on a 103
        // pitch, so a column is a column and a pattern has a shape you can read across.
        count: 16, x: 84, pitch: 103, cellW: 92, numberY: 16, gutterX: 12, accentEvery: 4,
        lanes: [
          { prefix: 'ssNote', label: 'NOTE', y: 32, h: 62, colour: 'FF7FD8B4' },
          { prefix: 'ssVelocity', label: 'VEL', y: 100, h: 40, colour: 'FFE0A94A' },
          { prefix: 'ssGateTime', label: 'GATE', y: 146, h: 40, colour: 'FF7FA7E8' },
          { prefix: 'ssCtrlValue', label: 'CC', y: 192, h: 40, colour: 'FFD98AA8' },
        ],
      },
    },
    {
      /**
       * The Free EG, drawn as what it is: four assignable recorder tracks over one timeline.
       *
       * It was twelve knobs. That was wrong twice over. There was no curve anywhere — the thing the
       * Free EG IS, a shape you draw over the length of the sequence, had no depiction at all — and
       * the two knobs per track were a knob standing in for a 57-entry destination list and a
       * four-way switch, because at the time the profile carried both as bare integers.
       *
       * Both are named lists now, so each track gets its destination and its scene switch as
       * choosers, and its own lane on a shared time axis. Four lanes because the instrument has
       * four tracks and they run together: the point of the Free EG is that VCF Cutoff and VCA
       * Volume and LFO1 Speed move at once, in shapes you drew, and reading that needs them
       * stacked against the same x.
       */
      title: 'FREE EG', tint: TINT.feg, x: 0, y: 260, w: 2770, h: 408,
      controls: [
        { p: 'fegTrigger', kind: 'leds', x: 12, y: 26, w: 104, label: 'TRIGGER' },
        { p: 'fegLoopType', kind: 'combo', x: 12, y: 130, w: 104, label: 'LOOP' },
        { p: 'fegLength', kind: 'knobSmall', x: 140, y: 30, label: 'LENGTH' },
        { p: 'fegKbdTrack', kind: 'knobSmall', x: 206, y: 30, label: 'KBD TRK' },
        ...[1, 2, 3, 4].flatMap((n) => {
          const y = 14 + (n - 1) * 94 + 30;
          return [
            { p: `fegTrkParam${n}`, kind: 'combo', x: 360, y, w: 210, label: n === 1 ? 'DESTINATION' : '' },
            { p: `fegTrkSceneSw${n}`, kind: 'combo', x: 582, y, w: 130, label: n === 1 ? 'SCENE' : '' },
          ];
        }),
      ],
      // One lane per track: the recorded curve, editable, over the sequence length.
      curves: [1, 2, 3, 4].map((n) => ({
        track: n, x: 726, y: 14 + (n - 1) * 94, w: 2020, h: 86,
        label: `TRACK ${n}`, labelX: 290, colour: TRACK_TINT[n - 1],
      })),
    },
  ],
};

export const PANEL_WIDTH = 2802;
