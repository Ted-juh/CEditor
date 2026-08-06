// layout.mjs — where every control on the GAIA panel goes, and what it looks like.
//
// This is a drawing, written down. QA-06 lays parameters out with an algorithm that reads their
// `group` and flows cells, which is right for a coverage sheet and produces something that looks
// nothing like a synthesiser. This file is the opposite: hand-placed, in the order and shape the
// SH-01's own front panel uses, because that is the layout a GAIA owner already knows.
//
// Read left to right and it is the signal path, exactly as the hardware prints it:
//
//     LFO  ->  OSC  ->  FILTER  ->  AMP        + MOD LFO, which the front panel does not expose
//
// The hardware has ONE of these strips and a TONE SELECT button, because it has one set of knobs.
// A screen does not, so there are three — one per tone — and that is the whole point of showing
// them at once.
//
// Colours are the panel's: LFO in blue, OSC/FILTER/AMP in amber, everything else grey.

/** The SH-01's own section colours, read off the instrument. */
export const TINT = {
  lfo: 'FF3B8FD0',
  osc: 'FFE0A030',
  filter: 'FFE0A030',
  amp: 'FFE0A030',
  modLfo: 'FF6C7A86',
  common: 'FF8894A0',
  effects: 'FFB05CC8',
  arp: 'FF52B788',
};

export const SKIN = {
  // The instrument is a WHITE body with a dark control area inset into it, and that contrast is
  // the first thing anyone recognises about a GAIA — more than any individual knob. So the panel
  // is silver and the controls sit on a dark plate, the same way they do on the hardware.
  panelBg: 'FFE4E6E8',
  plate: 'FF15181B',
  plateEdge: 'FF3A4148',
  boxFill: 'FF23272B',
  boxBorder: '33FFFFFF',
  headerText: 'FF11141600',
  label: 'FFAEBAC6',
  labelDim: 'FF7C8894',
  knob: 54,
  faderW: 26,
  faderH: 104,
  ledW: 96,
  ledRow: 15,
};

/**
 * One tone strip. Coordinates are relative to the strip's own origin, so the same spec is emitted
 * three times at three different Y offsets — the same trick the address map plays with the
 * 0x0100 stride, one layer up.
 *
 * `p` is the parameter id inside the tone (`osc.wave` -> `tone2.osc.wave`).
 */
export const TONE_STRIP = {
  height: 316,
  boxes: [
    {
      title: 'LFO', tint: TINT.lfo, x: 0, y: 0, w: 300, h: 308,
      controls: [
        { p: 'lfo.shape', kind: 'leds', x: 12, y: 30, label: 'SHAPE' },
        { p: 'lfo.rate', kind: 'knob', x: 124, y: 40, label: 'RATE' },
        { p: 'lfo.tempoSyncSwitch', kind: 'toggle', x: 196, y: 40, w: 88, label: 'TEMPO SYNC' },
        { p: 'lfo.tempoSyncNote', kind: 'combo', x: 196, y: 84, w: 88, label: 'NOTE' },
        { p: 'lfo.keyTrigger', kind: 'toggle', x: 124, y: 116, w: 60, label: 'KEY TRIG' },
        // The four faders the hardware prints under the LFO, in its order.
        { p: 'lfo.fadeTime', kind: 'fader', x: 20, y: 162, label: 'FADE\nTIME' },
        { p: 'lfo.pitchDepth', kind: 'fader', x: 84, y: 162, label: 'PITCH\nDEPTH' },
        { p: 'lfo.filterDepth', kind: 'fader', x: 148, y: 162, label: 'FILTER\nDEPTH' },
        { p: 'lfo.ampDepth', kind: 'fader', x: 212, y: 162, label: 'AMP\nDEPTH' },
      ],
    },
    {
      title: 'OSC', tint: TINT.osc, x: 310, y: 0, w: 366, h: 308,
      controls: [
        { p: 'osc.wave', kind: 'leds', x: 12, y: 30, label: 'WAVE' },
        { p: 'osc.waveVariation', kind: 'leds', x: 118, y: 30, label: 'VARIATION' },
        { p: 'osc.pitch', kind: 'knob', x: 214, y: 40, label: 'PITCH' },
        { p: 'osc.detune', kind: 'knob', x: 288, y: 40, label: 'DETUNE' },
        { p: 'osc.pulseWidthModDepth', kind: 'fader', x: 20, y: 162, label: 'PWM' },
        { p: 'osc.pulseWidth', kind: 'fader', x: 84, y: 162, label: 'PW' },
        { p: 'osc.pitchEnvAttackTime', kind: 'fader', x: 160, y: 162, label: 'A' },
        { p: 'osc.pitchEnvDecay', kind: 'fader', x: 216, y: 162, label: 'D' },
        { p: 'osc.pitchEnvDepth', kind: 'fader', x: 288, y: 162, label: 'ENV\nDEPTH' },
      ],
    },
    {
      title: 'FILTER', tint: TINT.filter, x: 686, y: 0, w: 398, h: 308,
      controls: [
        { p: 'filter.mode', kind: 'leds', x: 12, y: 30, label: 'MODE' },
        { p: 'filter.slope', kind: 'leds', x: 118, y: 30, label: 'SLOPE' },
        { p: 'filter.cutoff', kind: 'knob', x: 222, y: 34, label: 'CUTOFF' },
        { p: 'filter.resonance', kind: 'knob', x: 306, y: 34, label: 'RESONANCE' },
        { p: 'filter.cutoffKeyfollow', kind: 'knob', x: 264, y: 106, label: 'KEY FOLLOW' },
        { p: 'filter.envAttackTime', kind: 'fader', x: 20, y: 162, label: 'A' },
        { p: 'filter.envDecayTime', kind: 'fader', x: 72, y: 162, label: 'D' },
        { p: 'filter.envSustainLevel', kind: 'fader', x: 124, y: 162, label: 'S' },
        { p: 'filter.envReleaseTime', kind: 'fader', x: 176, y: 162, label: 'R' },
        { p: 'filter.envDepth', kind: 'fader', x: 240, y: 162, label: 'ENV\nDEPTH' },
        { p: 'filter.envVelocitySens', kind: 'fader', x: 312, y: 162, label: 'VELO\nSENS' },
      ],
    },
    {
      title: 'AMP', tint: TINT.amp, x: 1094, y: 0, w: 274, h: 308,
      controls: [
        { p: 'amp.level', kind: 'knob', x: 22, y: 40, label: 'LEVEL' },
        { p: 'amp.pan', kind: 'knob', x: 100, y: 40, label: 'PAN' },
        { p: 'amp.levelVelocitySens', kind: 'knob', x: 182, y: 40, label: 'VELO SENS' },
        { p: 'amp.envAttackTime', kind: 'fader', x: 30, y: 162, label: 'A' },
        { p: 'amp.envDecayTime', kind: 'fader', x: 88, y: 162, label: 'D' },
        { p: 'amp.envSustainLevel', kind: 'fader', x: 146, y: 162, label: 'S' },
        { p: 'amp.envReleaseTime', kind: 'fader', x: 204, y: 162, label: 'R' },
      ],
    },
    {
      // Not on the instrument's front panel — the modulation LFO is reached through the mod wheel
      // rather than through knobs. It is a real part of every tone, so it gets a box, set apart in
      // grey so nobody mistakes it for something they can point at on the hardware.
      title: 'MOD LFO', tint: TINT.modLfo, x: 1378, y: 0, w: 206, h: 308,
      controls: [
        { p: 'modLfo.shape', kind: 'leds', x: 12, y: 30, label: 'SHAPE' },
        { p: 'modLfo.rate', kind: 'knob', x: 128, y: 40, label: 'RATE' },
        { p: 'modLfo.tempoSyncSwitch', kind: 'toggle', x: 116, y: 116, w: 78, label: 'SYNC' },
        { p: 'modLfo.pitchDepth', kind: 'fader', x: 16, y: 162, label: 'PIT' },
        { p: 'modLfo.filterDepth', kind: 'fader', x: 64, y: 162, label: 'FLT' },
        { p: 'modLfo.ampDepth', kind: 'fader', x: 112, y: 162, label: 'AMP' },
        { p: 'modLfo.panDepth', kind: 'fader', x: 160, y: 162, label: 'PAN' },
      ],
    },
  ],
};

/** The patch-wide header: what the hardware puts along its bottom edge and around the display. */
export const COMMON_STRIP = {
  height: 204,
  boxes: [
    {
      // Two rows with real clearance between them. The first draft put the big knobs at y=30
      // (54 tall) and the small ones at y=74, so LEVEL sat on top of BEND UP — invisible in a
      // thumbnail, obvious the moment the overlap gate ran.
      title: 'PATCH', tint: TINT.common, x: 0, y: 0, w: 470, h: 196,
      controls: [
        { p: 'common.patchName', kind: 'text', x: 12, y: 30, w: 200, label: 'NAME' },
        { p: 'common.patchLevel', kind: 'knob', x: 236, y: 26, label: 'LEVEL' },
        { p: 'common.patchTempo', kind: 'knob', x: 314, y: 26, label: 'TEMPO' },
        { p: 'common.octaveShift', kind: 'knob', x: 392, y: 26, label: 'OCTAVE' },
        { p: 'common.monoSwitch', kind: 'toggle', x: 12, y: 118, w: 62, label: 'MONO' },
        { p: 'common.portamentoSwitch', kind: 'toggle', x: 82, y: 118, w: 92, label: 'PORTAMENTO' },
        { p: 'common.portamentoTime', kind: 'knobSmall', x: 186, y: 106, label: 'PORTA TIME' },
        { p: 'common.pitchBendRangeUp', kind: 'knobSmall', x: 264, y: 106, label: 'BEND UP' },
        { p: 'common.pitchBendRangeDown', kind: 'knobSmall', x: 342, y: 106, label: 'BEND DN' },
      ],
    },
    {
      // The three SELECT / ON pairs down the left of the instrument, laid out the same way.
      title: 'TONE', tint: TINT.common, x: 480, y: 0, w: 210, h: 196,
      controls: [
        { p: 'common.tone1Switch', kind: 'toggle', x: 12, y: 30, w: 84, label: 'TONE 1 ON' },
        { p: 'common.tone1Select', kind: 'toggle', x: 106, y: 30, w: 88, label: 'SELECT' },
        { p: 'common.tone2Switch', kind: 'toggle', x: 12, y: 58, w: 84, label: 'TONE 2 ON' },
        { p: 'common.tone2Select', kind: 'toggle', x: 106, y: 58, w: 88, label: 'SELECT' },
        { p: 'common.tone3Switch', kind: 'toggle', x: 12, y: 86, w: 84, label: 'TONE 3 ON' },
        { p: 'common.tone3Select', kind: 'toggle', x: 106, y: 86, w: 88, label: 'SELECT' },
      ],
    },
    {
      title: 'SYNC / RING', tint: TINT.common, x: 700, y: 0, w: 150, h: 196,
      controls: [
        { p: 'common.syncRingSelect', kind: 'leds', x: 12, y: 30, label: '' },
      ],
    },
    {
      title: 'D BEAM', tint: TINT.common, x: 860, y: 0, w: 250, h: 196,
      controls: [
        { p: 'common.dBeamAssign', kind: 'combo', x: 12, y: 34, w: 220, label: 'ASSIGN' },
        { p: 'common.dBeamPolarity', kind: 'leds', x: 12, y: 74, label: 'POLARITY' },
      ],
    },
    {
      title: 'EFFECTS ROUTING', tint: TINT.effects, x: 1120, y: 0, w: 464, h: 196,
      controls: [
        { p: 'common.effectsMasterSwitch', kind: 'toggle', x: 12, y: 32, w: 84, label: 'MASTER' },
        { p: 'common.effectsDistortionSelect', kind: 'toggle', x: 104, y: 32, w: 76, label: 'DIST' },
        { p: 'common.effectsFlangerSelect', kind: 'toggle', x: 188, y: 32, w: 76, label: 'FLANGER' },
        { p: 'common.effectsDelaySelect', kind: 'toggle', x: 272, y: 32, w: 76, label: 'DELAY' },
        { p: 'common.effectsReverbSelect', kind: 'toggle', x: 356, y: 32, w: 76, label: 'REVERB' },
        { p: 'common.lowBoostSwitch', kind: 'toggle', x: 12, y: 80, w: 84, label: 'LOW BOOST' },
        { p: 'common.tempoSyncSwitch', kind: 'toggle', x: 104, y: 80, w: 96, label: 'DELAY SYNC' },
        { p: 'master.volume', kind: 'knob', x: 384, y: 112, label: 'VOLUME' },
      ],
    },
  ],
};

/**
 * The arpeggiator, and the four effect blocks.
 *
 * The effects are the honest part of this panel. The hardware has SELECT CONTROL, CONTROL 1/2/3
 * and LEVEL — five knobs whose meaning changes with the effect type. The MIDI implementation names
 * the addresses "Distortion Parameter 1..32" and never says which of those the front panel's
 * CONTROL 1 actually turns; that mapping is in the owner's manual. So this shows the type selector
 * and the first four parameters of each block under the manual's own names, and says so on the
 * panel rather than inventing labels that would look right and be wrong.
 */
export const EFFECTS_STRIP = {
  height: 184,
  boxes: [
    {
      title: 'ARPEGGIO', tint: TINT.arp, x: 0, y: 0, w: 520, h: 176,
      controls: [
        { p: 'common.switch', kind: 'toggle', x: 12, y: 32, w: 72, label: 'ON' },
        { p: 'arp.grid', kind: 'combo', x: 94, y: 32, w: 88, label: 'GRID' },
        { p: 'arp.duration', kind: 'combo', x: 190, y: 32, w: 88, label: 'DURATION' },
        { p: 'arp.motif', kind: 'combo', x: 286, y: 32, w: 128, label: 'MOTIF' },
        { p: 'arp.octaveRange', kind: 'knobSmall', x: 430, y: 26, label: 'OCTAVE' },
        { p: 'arp.accentRate', kind: 'knobSmall', x: 12, y: 92, label: 'ACCENT' },
        { p: 'arp.velocity', kind: 'knobSmall', x: 90, y: 92, label: 'VELOCITY' },
        { p: 'arp.endStep', kind: 'knobSmall', x: 168, y: 92, label: 'END STEP' },
      ],
    },
    ...[
      ['distortion', 'DISTORTION', 530],
      ['flanger', 'FLANGER', 796],
      ['delay', 'DELAY', 1062],
      ['reverb', 'REVERB', 1328],
    ].map(([prefix, title, x]) => ({
      title, tint: TINT.effects, x, y: 0, w: 256, h: 176,
      controls: [
        { p: `${prefix}.type`, kind: 'leds', x: 12, y: 30, label: 'TYPE' },
        { p: `${prefix}.parameter1`, kind: 'knobSmall', x: 124, y: 26, label: 'PARAM 1' },
        { p: `${prefix}.parameter2`, kind: 'knobSmall', x: 190, y: 26, label: 'PARAM 2' },
        { p: `${prefix}.parameter3`, kind: 'knobSmall', x: 124, y: 92, label: 'PARAM 3' },
        { p: `${prefix}.parameter4`, kind: 'knobSmall', x: 190, y: 92, label: 'PARAM 4' },
      ],
    })),
  ],
};

export const PANEL_WIDTH = 1600;
